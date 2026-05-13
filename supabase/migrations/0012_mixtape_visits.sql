-- Per-mixtape visit log. One row per (profile, visitor) pair; visit_count
-- is implicit in the row's existence. Writes happen server-side via the
-- service-role client; the only Data API surface is a read for the owner.

create table mixtape_visits (
  profile_id     uuid not null references profiles(id) on delete cascade,
  visitor_id     text not null,
  first_visit_at timestamptz not null default now(),
  last_visit_at  timestamptz not null default now(),
  primary key (profile_id, visitor_id)
);

create index mixtape_visits_profile_idx on mixtape_visits (profile_id);

alter table mixtape_visits enable row level security;

-- The only Data API operation we allow is "owner reads their own row(s)."
-- Writes go through the service-role client in the page-load handler,
-- which bypasses RLS, so no INSERT/UPDATE policy is needed for anon or
-- authenticated.
create policy "owners can read their visits"
  on mixtape_visits
  for select
  to authenticated
  using (profile_id = auth.uid());

-- Explicit grants. New Supabase projects (May 30, 2026) and all existing
-- projects (Oct 30, 2026) no longer auto-expose public tables to the
-- Data API — every grant must be stated. anon gets nothing here on
-- purpose; authenticated gets SELECT (RLS scopes it to the owner);
-- service_role gets full access for server-side writes.
grant select on mixtape_visits to authenticated;
grant select, insert, update, delete on mixtape_visits to service_role;
