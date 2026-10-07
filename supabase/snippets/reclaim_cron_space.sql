-- One-time: hand the space from the cron/pg_net log tables back to the OS.
-- Run after migration 0020 has pruned cron.job_run_details.
--
-- VACUUM can't run inside a transaction, so it can't live in a migration —
-- and the SQL editor wraps multi-statement runs in one. Paste and run each
-- line ON ITS OWN in Dashboard → SQL Editor.
--
-- If Supabase replies "only table or database owner can vacuum it", that's
-- fine: autovacuum still frees the space for reuse inside Postgres; only the
-- dashboard's disk number won't drop.

vacuum full cron.job_run_details;

vacuum full net._http_response;
