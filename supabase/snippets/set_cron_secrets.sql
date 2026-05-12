-- One-time-per-project setup for the resolve-queue pg_cron worker.
--
-- The cron job (see migration 0009) reads the project URL and the service-role
-- JWT from Supabase Vault. This snippet stores those two values. Idempotent —
-- safe to re-run any time, e.g. when the JWT rotates.
--
-- Run in the Supabase dashboard SQL editor for each environment
-- (https://supabase.com/dashboard/project/<ref>/sql/new), substituting the
-- project URL and the service-role JWT for that project.

do $$
declare
  v_id uuid;
  v_project_url constant text := 'https://kudxongbgeaylfpcmick.supabase.co';
  v_service_role_key constant text :=
    -- Paste the service-role JWT below (recoverable via
    -- `pnpm exec supabase projects api-keys --project-ref <ref>`).
    'PASTE_SERVICE_ROLE_JWT_HERE';
begin
  select id into v_id from vault.secrets where name = 'project_url';
  if v_id is null then
    perform vault.create_secret(v_project_url, 'project_url',
      'Project URL for the resolve-queue cron worker');
  else
    perform vault.update_secret(v_id, v_project_url);
  end if;

  select id into v_id from vault.secrets where name = 'service_role_key';
  if v_id is null then
    perform vault.create_secret(v_service_role_key, 'service_role_key',
      'Service-role JWT for the resolve-queue cron worker');
  else
    perform vault.update_secret(v_id, v_service_role_key);
  end if;
end $$;

-- Verify both secrets exist and decrypt:
select name, length(decrypted_secret) as len
from vault.decrypted_secrets
where name in ('project_url', 'service_role_key');
