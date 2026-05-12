-- Schedule the resolution worker to run every minute.
-- Requires:
--   1. The `resolve-queue` Edge Function deployed:
--        supabase functions deploy resolve-queue --no-verify-jwt
--   2. `pg_cron` and `pg_net` extensions (both available in hosted Supabase).
--   3. Two database-level settings, set once per project via the SQL editor
--      (Dashboard → SQL Editor → New query) so the cron job's SQL context
--      can read them with current_setting():
--
--        alter database postgres set app.settings.supabase_url
--          = 'https://<project-ref>.supabase.co';
--        alter database postgres set app.settings.service_role_key
--          = '<service role JWT>';
--
--      ALTER DATABASE persists across restarts. The "Custom Postgres Config"
--      dashboard panel will NOT work — it only accepts well-known GUCs
--      (statement_timeout, work_mem, etc.), not the `app.settings.*` namespace.
--      App env vars (Cloudflare secrets, etc.) also will NOT work — pg_cron
--      runs inside Postgres and can't see them.
--
-- The cron job posts to the Edge Function with the service-role key in the
-- Authorization header; the function uses that key internally.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule any prior version of this job before re-scheduling.
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
      url := current_setting('app.settings.supabase_url') || '/functions/v1/resolve-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
