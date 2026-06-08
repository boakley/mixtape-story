-- Phase 3a refactor: switch from "copy" to "share" semantics.
--
-- One mixtape entity, shared with N groups via a join table. Edits to
-- the mixtape propagate to every group where it's shared because there's
-- only one row. Divergent versions are achieved by making a different
-- mixtape entity (anticipated as /u/{handle}/{slug} in v1.5+).
--
-- This replaces the earlier design where each group got its own copy of
-- a user's mixtape (the partial unique index on (profile_id, group_id)
-- enforced one-per-group). Under share semantics, the group_id column on
-- mixtapes is removed entirely; the share table carries that relationship.
--
-- See docs/PHASE-3-groups.md for the user-facing reasoning.

-- ============================================================
-- 1. The share table
-- ============================================================

create table mixtape_group_shares (
  mixtape_id  uuid not null references mixtapes(id) on delete cascade,
  group_id    uuid not null references groups(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (mixtape_id, group_id)
);

create index mixtape_group_shares_group_idx on mixtape_group_shares (group_id);

-- ============================================================
-- 2. Backfill: convert each existing group-scoped mixtape row to a share
-- ============================================================
-- For users who have both a personal mixtape AND a group-scoped copy,
-- the group copy becomes a share of the personal. The copy's songs and
-- stories were duplicates created by the now-removed copyIn action, so
-- deleting the copy rows loses no real content.
--
-- For users who somehow only have a group-scoped mixtape and no
-- personal (rare; only possible if onboarding didn't create one), the
-- group mixtape becomes their personal mixtape AND gets a share row.

with personal_mixtapes as (
  select profile_id, id as personal_id
  from mixtapes
  where group_id is null
),
group_mixtapes as (
  select id, profile_id, group_id
  from mixtapes
  where group_id is not null
)
insert into mixtape_group_shares (mixtape_id, group_id)
select coalesce(pm.personal_id, gm.id), gm.group_id
from group_mixtapes gm
left join personal_mixtapes pm on pm.profile_id = gm.profile_id;

-- Now drop the group-scoped mixtape rows for users who already had a
-- personal one. Songs + stories cascade-delete.
delete from mixtapes
where group_id is not null
  and profile_id in (select profile_id from mixtapes where group_id is null);

-- For users who only had a group-scoped mixtape (no personal), demote
-- it to personal scope: flip visibility from 'group' to 'unlisted' so
-- the joint constraint stops complaining, then null out group_id.
update mixtapes set visibility = 'unlisted' where group_id is not null;
update mixtapes set group_id = null where group_id is not null;

-- ============================================================
-- 3. Drop the now-redundant column + constraints + triggers + indexes
-- ============================================================

-- The mixtapes_select policy from 0015 references group_id directly,
-- so drop it before the column. Recreated in section 5 below with
-- share-aware logic.
drop policy mixtapes_select on mixtapes;

-- BEFORE DELETE trigger on groups demoted member mixtapes; no longer
-- needed since shares cascade-delete cleanly.
drop trigger groups_before_delete_revert_mixtapes on groups;
drop function groups_before_delete_revert_mixtapes();

-- Joint constraint forced visibility='group' iff group_id IS NOT NULL.
-- Neither side exists anymore (group_id about to go; we'll narrow the
-- visibility CHECK below).
alter table mixtapes drop constraint mixtapes_visibility_group_match;

-- Partial unique indexes that depended on group_id.
drop index mixtapes_one_personal_per_profile;
drop index mixtapes_one_per_profile_per_group;
drop index mixtapes_group_id_idx;

-- FK from mixtapes to groups, then the column.
alter table mixtapes drop constraint mixtapes_group_id_fkey;
alter table mixtapes drop column group_id;

-- ============================================================
-- 4. Tighten visibility CHECK: 'group' is no longer a valid value.
-- ============================================================

alter table mixtapes drop constraint mixtapes_visibility_check;
alter table mixtapes
  add constraint mixtapes_visibility_check
  check (visibility in ('private', 'unlisted', 'public'));

-- One mixtape per profile in v1 (was "one personal per profile" before;
-- since there's no longer a group-scoped variant on the mixtapes table
-- itself, this is just one mixtape per profile, full stop). Multi-mixtape-
-- per-user lands in v1.5+ per design-groups.md §1a.
create unique index mixtapes_one_per_profile on mixtapes (profile_id);

-- ============================================================
-- 5. Mixtape-ownership helper + RLS policies on the share table
--    + retune mixtapes SELECT
-- ============================================================

-- Without this SECURITY DEFINER helper, any policy that asks "is this
-- profile the owner of this mixtape?" via an EXISTS into mixtapes would
-- trigger mixtapes_select recursively (which itself consults shares,
-- which consults mixtapes, …). The function bypasses RLS internally
-- since it runs as its creator.
create or replace function private.is_mixtape_owner(mid uuid, pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.mixtapes
    where id = mid and profile_id = pid
  );
$$;

revoke execute on function private.is_mixtape_owner(uuid, uuid) from public;
grant execute on function private.is_mixtape_owner(uuid, uuid) to anon, authenticated;

alter table mixtape_group_shares enable row level security;

-- SELECT: visible to (a) the mixtape owner (so they can see/manage
-- where their mixtape is shared) and (b) members of the group it's
-- shared with (so the directory query works).
create policy mixtape_group_shares_select on mixtape_group_shares for select using (
  private.is_mixtape_owner(mixtape_id, (select auth.uid()))
  or private.is_group_member(group_id, (select auth.uid()))
);

-- INSERT: only the mixtape owner can share their mixtape, and only
-- with a group they're a member of.
create policy mixtape_group_shares_insert on mixtape_group_shares for insert with check (
  private.is_mixtape_owner(mixtape_id, (select auth.uid()))
  and private.is_group_member(group_id, (select auth.uid()))
);

-- DELETE: either the mixtape owner ("stop sharing my own mixtape") or
-- a steward of the group ("kick this mixtape out of my group").
create policy mixtape_group_shares_delete on mixtape_group_shares for delete using (
  private.is_mixtape_owner(mixtape_id, (select auth.uid()))
  or private.is_group_steward(group_id, (select auth.uid()))
);

-- Recreate the mixtapes_select policy (dropped before the column drop
-- in section 3). Previously gated on visibility='group' + group_id;
-- now any mixtape shared with a group is visible to that group's
-- members, regardless of the mixtape's stored visibility (which only
-- governs /{handle} access).
create policy mixtapes_select on mixtapes for select using (
  visibility in ('unlisted', 'public')
  or (visibility = 'private' and profile_id = (select auth.uid()))
  or exists (
    select 1 from mixtape_group_shares mgs
    where mgs.mixtape_id = mixtapes.id
      and private.is_group_member(mgs.group_id, (select auth.uid()))
  )
);

-- ============================================================
-- 6. Data API grants
-- ============================================================

grant select on mixtape_group_shares to anon, authenticated;
grant insert, delete on mixtape_group_shares to authenticated;
