-- Switch the resolve-queue pg_cron job to read secrets from Supabase Vault
-- instead of `current_setting('app.settings.*')`.
--
-- Why the change: hosted Supabase doesn't let any user (including `postgres`)
-- run `ALTER DATABASE ... SET app.settings.*` — permission denied. Vault is
-- the supported pattern for "this SQL needs a secret value at runtime."
--
-- Prerequisite: the secrets `project_url` and `service_role_key` must already
-- exist in `vault.secrets`. Set them once per environment via the dashboard
-- SQL editor — see `supabase/snippets/set_cron_secrets.sql` for the block.
-- This migration is *safe to apply first*; the cron job will simply log a
-- null URL until the secrets are populated, at which point it starts working.

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
    );
  $cron$
);
