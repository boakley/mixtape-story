-- Stop the resolve-queue cron from doing work when there's nothing to resolve.
--
-- Why: the every-minute job from 0009 called the Edge Function on every tick,
-- queue empty or not. Each call left a row in net._http_response (which pg_net
-- then sweeps with a DELETE per request) and every tick logged a row in
-- cron.job_run_details, which pg_cron never prunes. Five months idle on a
-- t4g.nano: 214k log rows, ~320 MB across the two tables, and CPU + disk IO
-- pinned at the budget ceiling with zero traffic.
--
-- Fix, in three parts:
--   1. Gate the http_post on "any song pending?" — idle ticks never touch
--      pg_net. Every path that queues work sets songs.link_status = 'pending'
--      (/_edit inserts, admin retry), so the check is exact. songs_pending_idx
--      (0003) makes it an index probe. Cadence is unchanged: new songs still
--      resolve within about a minute.
--   2. Prune cron.job_run_details nightly, keeping 7 days.
--   3. Clear the existing backlog once.
--
-- Idempotent: safe to re-run (e.g. pasted into the SQL editor, then later
-- applied again by `supabase db push`).
--
-- Disk space isn't returned to the OS by DELETE alone — see
-- supabase/snippets/reclaim_cron_space.sql for the one-time VACUUM FULL.

do $$
begin
  perform cron.unschedule('resolve-queue-every-minute');
exception when others then
  null;
end $$;

select cron.schedule(
  'resolve-queue-every-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
        limit 1
      ) || '/functions/v1/resolve-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (
      select 1 from public.songs where link_status = 'pending'
    );
  $cron$
);

do $$
begin
  perform cron.unschedule('prune-cron-history');
exception when others then
  null;
end $$;

select cron.schedule(
  'prune-cron-history',
  '17 3 * * *',
  $cron$
    delete from cron.job_run_details
    where start_time < now() - interval '7 days';
  $cron$
);

delete from cron.job_run_details
where start_time < now() - interval '7 days';
