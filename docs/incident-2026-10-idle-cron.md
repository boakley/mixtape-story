# Incident: an idle cron job ran the database out of budget

October 2026. Written up after the fix, while the numbers were still at hand.

## Summary

Supabase emailed a warning that the project was about to exceed its disk IO
budget. The dashboard showed CPU and disk IO both at 98% on the free-tier
t4g.nano instance, and nobody had used the site in about two months.

The cause was the resolve-queue cron job from migrations 0006 and 0009. It
fired every minute and called the Edge Function whether or not any song was
waiting to be resolved. Five months of that left two log tables bloated to
320 MB between them, and the database's own cleanup of one of those tables
became the most expensive thing running on the instance.

Migration 0020 fixed it. The project is back to near-idle, and the two tables
went from 320 MB to about 7 MB.

## What the numbers showed

`supabase/snippets/diagnose_load.sql` is a read-only query that reports table
sizes, scheduled jobs, cron and pg_net activity, the song queue, and the top
statements from `pg_stat_statements`. Run in the dashboard SQL editor, it
returned:

| Signal | Value |
|---|---|
| `cron.job_run_details` | 214,300 rows, 181 MB |
| `net._http_response` | 360 rows, 139 MB |
| Songs waiting to resolve | 0 (all 157 `done`) |
| pg_net cleanup `DELETE` | 209,509 calls, 489,359 s total, 2.3 s average |
| Cron runs, last 24 h | 969 succeeded, 471 failed (avg 15 s) |
| Total database size | 348.7 MB of the 500 MB free-tier limit |

The queue was empty, so every one of those runs did nothing useful.

## Root cause

Each tick did three things that cost something. It inserted and then updated a
row in `cron.job_run_details`, which pg_cron keeps forever unless something
deletes it. It called `net.http_post`, which stores the response in
`net._http_response`. And for each request, pg_net's background worker ran a
cleanup `DELETE ... ORDER BY created LIMIT n` against that response table.

The response table had 360 live rows sitting in 139 MB of mostly dead space.
Scanning that made each cleanup take seconds instead of milliseconds. At one
per minute, those cleanups alone added up to about 136 hours of CPU, on an
instance whose sustained CPU allowance is a few percent. The failed cron runs
were most likely a symptom of the starved instance.

This kind of cost grows nonlinearly. In June, with small tables, each tick was
cheap and a glance at the dashboard would have looked fine. The tables grew,
each cleanup got slower, and the instance slowly ran out of headroom.

## Fix

Migration `0020_resolve_queue_idle_gate.sql` did three things:

1. Added `where exists (select 1 from songs where link_status = 'pending')` to
   the cron job's `select net.http_post(...)`. Postgres evaluates the `where`
   before the select list, so an idle tick makes no HTTP call, leaves no
   response row, and triggers no cleanup. Every code path that queues work
   sets `link_status = 'pending'` (the `/_edit` inserts and the admin retry),
   so the check is exact. Songs still resolve within about a minute.
2. Scheduled `prune-cron-history`, a nightly job that deletes cron log rows
   older than 7 days.
3. Deleted the existing backlog once.

After that, `supabase/snippets/reclaim_cron_space.sql` ran `VACUUM FULL` on
both tables, one statement per run because `VACUUM` can't run inside a
transaction. Results:

| Table | Before | After |
|---|---|---|
| `cron.job_run_details` | 181 MB | 7 MB |
| `net._http_response` | 139 MB | 456 kB |

Checking `cron.job_run_details` a few minutes later showed every tick as
`succeeded` with `0 rows` returned. That means the gate is working: the job
checks the queue, finds nothing, and skips the call.

Migration 0020 was pasted into the SQL editor and later marked applied with
`supabase migration repair --status applied 0020`, so prod's migration history
matches the repo.

## A second problem: the Supabase CLI wouldn't start

The usual route for migrations, `pnpm exec supabase db push`, failed because
the CLI was killed with SIGKILL at launch and printed nothing. `codesign
--verify` on the native binary reported "code or signature have been
modified." A fresh download of the same version (2.105.0) from npm had the
same SHA-256 as the installed copy, which ruled out local corruption. That
release shipped with a broken ad-hoc signature, and macOS 27 refuses to run
it. Version 2.120.0 has a valid signature, and upgrading to it fixed the
problem (commit `7e8cfd8`).

The useful move there was comparing the hash against a clean copy before
reinstalling anything. A reinstall would have pulled the same broken binary.

## What we missed

The comments in migrations 0006 and 0009 are long and careful, and every one
of them is about getting the job to work: secrets, Vault, permission errors.
None of them asks what one tick costs, what it leaves behind, or what that
adds up to at 1,440 ticks a day for months. That question would have caught
both problems at design time. A scheduled job should do work in proportion to
activity. The pending-song gate could have been in the first version.

We also treated pg_cron and pg_net as having no side effects. Both keep
records of what they do. Supabase's own pg_cron docs recommend scheduling a
cleanup of `cron.job_run_details`, and we didn't. Any tool that creates a log
table needs a retention plan when it's adopted.

Testing checked that a pending song gets resolved. It never checked what the
database looks like after weeks of running with no users, and local
development couldn't have shown that, because the local database is rebuilt
with `db reset` all the time. A check of table sizes in prod a week after
launch would have caught the growth early.

Finally, there was no early warning. Supabase's email arrived once the budget
was nearly gone. A usage alert would have helped, but the stronger defense is
a design that's safe to leave alone. A dormant project is exactly the one
nobody is watching.

## If the site is shelved

The gated job is cheap now, but it still runs 1,440 times a day. To stop it
entirely:

```sql
select cron.unschedule('resolve-queue-every-minute');
```

Turning it back on means re-running migration 0020's `cron.schedule` block.
Pausing the whole Supabase project from the dashboard also works, and it
stops everything, including the site.
