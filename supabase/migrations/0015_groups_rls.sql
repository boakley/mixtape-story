-- Phase 3a step 2: RLS policies for the tables introduced in 0014.
--
-- Pattern notes:
-- - Membership-check helpers live in a `private` schema, not exposed via
--   the Data API. They are SECURITY DEFINER so they bypass RLS when
--   doing the lookup — without that, any policy that consults
--   group_memberships from inside a policy ON group_memberships (or a
--   policy on a table whose own policy already consulted memberships,
--   e.g. mixtapes) would recurse infinitely.
-- - `(select auth.uid())` is used instead of bare `auth.uid()` so
--   Postgres caches the value per statement.
-- - Where policies are intentionally omitted (e.g. group_memberships
--   INSERT), the action is denied from client roles — those mutations
--   happen via service_role from server-side route handlers, which is
--   the right shape for invite-validation flows.
-- - Songs RLS is NOT modified here. Today songs are publicly readable
--   (per 0004_songs_rls); when a group mixtape lands and routes go live,
--   a later migration will gate song reads on mixtape visibility. For
--   step 2, group mixtapes don't exist yet, so the existing songs RLS
--   is still correct.
-- - Guest-link reads bypass RLS via service_role in the page handler:
--   the route validates the token in the query string, then uses
--   service_role to fetch the gated mixtape. RLS itself only covers the
--   no-token "are you a member?" path.

-- ============================================================
-- Private schema + membership-check helpers
-- ============================================================

create schema if not exists private;
-- Lock down by default; specific grants below restore exactly what's
-- needed for RLS policies to invoke the helpers. PostgREST never sees
-- this schema (it isn't in the exposed-schemas config), so even with
-- USAGE granted, anon/authenticated can't enumerate or call functions
-- here from outside the policy machinery.
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- Bypasses RLS on group_memberships to answer "is this profile a member
-- of this group?" Safe to call from policies because SECURITY DEFINER
-- runs the function as its creator (the migration owner / postgres),
-- not as the calling role. `search_path = public` is required for
-- security-definer functions to prevent search-path takeover.
create or replace function private.is_group_member(gid uuid, pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = gid and profile_id = pid
  );
$$;

create or replace function private.is_group_steward(gid uuid, pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = gid and profile_id = pid and role = 'steward'
  );
$$;

-- Default is "grant execute to PUBLIC" — strip that, then grant only
-- the specific roles that need to invoke the helpers from inside RLS.
-- (service_role bypasses RLS so doesn't need the grant; if any
-- service_role code later wants to call these directly, add a grant.)
revoke execute on function private.is_group_member(uuid, uuid) from public;
grant execute on function private.is_group_member(uuid, uuid) to anon, authenticated;

revoke execute on function private.is_group_steward(uuid, uuid) from public;
grant execute on function private.is_group_steward(uuid, uuid) to anon, authenticated;

-- ============================================================
-- mixtapes
-- ============================================================

-- SELECT: public/unlisted readable by anyone; private only to owner;
-- group only to members of the group.
create policy mixtapes_select on mixtapes for select using (
  visibility in ('unlisted', 'public')
  or (visibility = 'private' and profile_id = (select auth.uid()))
  or (
    visibility = 'group'
    and private.is_group_member(group_id, (select auth.uid()))
  )
);

-- Write policies: only the mixtape's profile owner can mutate it.
create policy mixtapes_insert on mixtapes for insert with check (
  profile_id = (select auth.uid())
);

create policy mixtapes_update on mixtapes for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy mixtapes_delete on mixtapes for delete using (
  profile_id = (select auth.uid())
);

-- ============================================================
-- groups
-- ============================================================
-- Group rows themselves leak nothing useful that isn't already exposed
-- by the slug-in-URL (per design-groups.md). Member-only data
-- (memberships, invites, mixtapes inside the group) is gated by its
-- own table's policies.

create policy groups_select on groups for select using (true);

-- Authenticated user can create a group; created_by must match them.
create policy groups_insert on groups for insert with check (
  (select auth.uid()) is not null
  and created_by = (select auth.uid())
);

-- Only stewards can edit a group's metadata (name, description, mode).
create policy groups_update on groups for update
  using (private.is_group_steward(id, (select auth.uid())))
  with check (private.is_group_steward(id, (select auth.uid())));

-- Only stewards can delete a group. (Cascades drop memberships, invites,
-- guest_links; mixtapes get group_id → NULL via mixtapes_group_id_fkey.)
create policy groups_delete on groups for delete using (
  private.is_group_steward(id, (select auth.uid()))
);

-- ============================================================
-- group_memberships
-- ============================================================

-- SELECT: members can see fellow members within their groups.
create policy group_memberships_select on group_memberships for select using (
  private.is_group_member(group_id, (select auth.uid()))
);

-- INSERT: intentionally blocked from client roles. Joining a group
-- always goes through the invite-validation route handler, which uses
-- service_role to insert the membership row after validating the code.

-- DELETE: a user can leave by deleting their own row; a steward can
-- remove a member by deleting any row in the group.
create policy group_memberships_delete on group_memberships for delete using (
  profile_id = (select auth.uid())
  or private.is_group_steward(group_id, (select auth.uid()))
);

-- UPDATE: intentionally no policy. Role transfer / steward management
-- is deferred to a later phase (see PHASE-3 "Open questions" — steward
-- transfer); when it lands, mutations go via service_role.

-- ============================================================
-- group_invites
-- ============================================================
-- All access requires being a steward in the target group. Brand-new
-- visitors validating an invite URL (`/g/{slug}/i/{code}`) don't hit
-- the data API directly — the route handler uses service_role to look
-- the code up.

create policy group_invites_select on group_invites for select using (
  private.is_group_steward(group_id, (select auth.uid()))
);

create policy group_invites_insert on group_invites for insert with check (
  created_by = (select auth.uid())
  and private.is_group_steward(group_id, (select auth.uid()))
);

create policy group_invites_update on group_invites for update
  using (private.is_group_steward(group_id, (select auth.uid())))
  with check (private.is_group_steward(group_id, (select auth.uid())));

create policy group_invites_delete on group_invites for delete using (
  private.is_group_steward(group_id, (select auth.uid()))
);

-- ============================================================
-- guest_links
-- ============================================================
-- Only the mixtape's owning profile manages guest links. The actual
-- token-bearing read path (a non-member viewing a gated mixtape)
-- happens via service_role in the page handler — RLS just gates the
-- steward/creator-side surface.

create policy guest_links_select on guest_links for select using (
  exists (
    select 1 from mixtapes m
    where m.id = guest_links.mixtape_id
      and m.profile_id = (select auth.uid())
  )
);

create policy guest_links_insert on guest_links for insert with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from mixtapes m
    where m.id = guest_links.mixtape_id
      and m.profile_id = (select auth.uid())
  )
);

create policy guest_links_update on guest_links for update
  using (
    exists (
      select 1 from mixtapes m
      where m.id = guest_links.mixtape_id
        and m.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from mixtapes m
      where m.id = guest_links.mixtape_id
        and m.profile_id = (select auth.uid())
    )
  );

create policy guest_links_delete on guest_links for delete using (
  exists (
    select 1 from mixtapes m
    where m.id = guest_links.mixtape_id
      and m.profile_id = (select auth.uid())
  )
);

-- ============================================================
-- Grants — expose new tables to the Data API
-- ============================================================
-- RLS-protected tables still need explicit table-level grants for the
-- anon/authenticated roles to reach them through PostgREST. Without
-- these, even SELECT policies that say `using (true)` won't work.
-- Per Supabase docs: "Exposing a Table to the Data API."

grant select on mixtapes to anon, authenticated;
grant insert, update, delete on mixtapes to authenticated;

grant select on groups to anon, authenticated;
grant insert, update, delete on groups to authenticated;

grant select, delete on group_memberships to authenticated;
-- No INSERT or UPDATE grant — service_role only for those.

grant select, insert, update, delete on group_invites to authenticated;

grant select, insert, update, delete on guest_links to authenticated;
