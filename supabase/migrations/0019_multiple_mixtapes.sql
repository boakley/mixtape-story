-- v1.5: multiple mixtapes per user (group-born flow).
--
-- The schema stays general — a free `slug` column plus the existing
-- share table — while the app's creation flow binds secondary
-- mixtapes 1:1 to groups (slug = group slug). Same playbook as v1's
-- "one mixtape per user" rule: enforce the product shape in the flow,
-- keep the data model open so relaxing it later is a UI change.
--
-- Three parts:
--   1. mixtapes.slug — null = the primary (exactly one per profile);
--      non-null = a group-born mixtape, unique per (profile, slug).
--   2. mixtape_group_shares.profile_id — denormalized owner, synced
--      by trigger, so "one share per (user, group)" is one unique
--      constraint. The trigger also keeps pre-deploy app code (which
--      inserts only mixtape_id/group_id) working through the
--      migrate-then-deploy window.
--   3. mixtape_visits re-keyed to (mixtape_id, visitor_id) so each
--      mixtape page counts its own readers. Old rows backfill to the
--      owner's primary. Deploy-window note: until the new code ships,
--      the old visit upsert fails silently — accepted, it's
--      best-effort analytics and the result was never checked.

-- ============================================================
-- 1. mixtapes: slug
-- ============================================================

alter table mixtapes add column slug text;

-- Same grammar as handles and group slugs (3–32, lowercase, starts
-- with a letter, ends with letter/digit). `_`-prefixed system paths
-- (/{handle}/_edit) are collision-free by construction.
alter table mixtapes add constraint mixtapes_slug_format
  check (slug is null or slug ~ '^[a-z][a-z0-9-]{1,30}[a-z0-9]$');

-- Secondary mixtapes need a display name — menus and share choosers
-- would otherwise show several identical "{display_name}'s mixtape"
-- fallbacks. The primary keeps its nullable name + fallback.
alter table mixtapes add constraint mixtapes_secondary_named
  check (slug is null or name is not null);

-- Replace "one mixtape per profile" (0016) with "one *primary* per
-- profile, secondaries unique per slug".
drop index mixtapes_one_per_profile;
create unique index mixtapes_one_primary_per_profile
  on mixtapes (profile_id) where slug is null;
create unique index mixtapes_profile_slug_key
  on mixtapes (profile_id, slug) where slug is not null;

-- ============================================================
-- 2. shares: one per (user, group)
-- ============================================================

alter table mixtape_group_shares
  add column profile_id uuid references profiles(id) on delete cascade;

update mixtape_group_shares s
  set profile_id = m.profile_id
  from mixtapes m
  where m.id = s.mixtape_id;

-- Keep the denorm honest forever (and let not-yet-deployed app code,
-- which doesn't send profile_id, keep inserting through the window).
create or replace function public.mixtape_group_shares_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select profile_id into new.profile_id from mixtapes where id = new.mixtape_id;
  return new;
end;
$$;

create trigger mixtape_group_shares_sync_profile
  before insert or update of mixtape_id on mixtape_group_shares
  for each row execute function public.mixtape_group_shares_sync_profile();

alter table mixtape_group_shares alter column profile_id set not null;

-- The cap the flow relies on: a member shows a group exactly one
-- mixtape — their primary or their version-for-that-group.
alter table mixtape_group_shares
  add constraint mixtape_group_shares_one_per_profile_group unique (profile_id, group_id);

-- Tighten the insert policy: you may only share mixtapes you own
-- (unchanged) and the share row must be yours.
drop policy mixtape_group_shares_insert on mixtape_group_shares;
create policy mixtape_group_shares_insert on mixtape_group_shares for insert with check (
  private.is_mixtape_owner(mixtape_id, (select auth.uid()))
);

-- ============================================================
-- 3. visits: per-mixtape counting
-- ============================================================

alter table mixtape_visits
  add column mixtape_id uuid references mixtapes(id) on delete cascade;

update mixtape_visits v
  set mixtape_id = m.id
  from mixtapes m
  where m.profile_id = v.profile_id and m.slug is null;

alter table mixtape_visits alter column mixtape_id set not null;

alter table mixtape_visits drop constraint mixtape_visits_pkey;
alter table mixtape_visits add primary key (mixtape_id, visitor_id);

drop policy "owners can read their visits" on mixtape_visits;
create policy "owners can read their visits" on mixtape_visits
  for select to authenticated
  using (private.is_mixtape_owner(mixtape_id, (select auth.uid())));

drop index mixtape_visits_profile_idx;
alter table mixtape_visits drop column profile_id;
