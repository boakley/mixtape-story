-- Phase 3a step 1: introduce explicit `mixtapes` as a top-level entity, and
-- add the foundation tables for groups (memberships, invites, guest links).
-- Songs gain a nullable `mixtape_id`, backfilled from owner_id via the
-- mixtape-per-profile 1:1 mapping created here. The NOT NULL tightening on
-- songs.mixtape_id lands in a later migration once editor + load paths
-- route through it.
--
-- See docs/PHASE-3-groups.md (step order) and docs/design-groups.md (model).

-- ============================================================
-- 1. Mixtapes
-- ============================================================
-- One row per (profile, scope) pair. In v1, scope is "personal" (group_id
-- IS NULL) or one specific group. The unique partial indexes below enforce
-- the curation discipline: at most one personal mixtape per profile, at
-- most one mixtape per profile per group.

create table mixtapes (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  visibility   text not null default 'unlisted'
    check (visibility in ('private', 'unlisted', 'group', 'public')),
  group_id     uuid,  -- FK added after `groups` exists, below
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Joint constraint: 'group' visibility iff group_id IS NOT NULL.
  -- App layer enforces this too; the DB is belt-and-braces.
  constraint mixtapes_visibility_group_match check (
    (visibility = 'group' and group_id is not null) or
    (visibility != 'group' and group_id is null)
  )
);

create or replace function mixtapes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mixtapes_set_updated_at
  before update on mixtapes
  for each row execute function mixtapes_touch_updated_at();

-- Backfill: one mixtape per existing profile, dated to the profile's birth.
-- visibility='unlisted' matches today's "anyone with the link can read"
-- behavior (today the link-visibility is implicit; this migration makes
-- it explicit).
insert into mixtapes (profile_id, visibility, created_at, updated_at)
select id, 'unlisted', created_at, created_at
from profiles;

-- At most one personal mixtape per profile.
create unique index mixtapes_one_personal_per_profile
  on mixtapes (profile_id) where group_id is null;

-- At most one mixtape per profile per group.
create unique index mixtapes_one_per_profile_per_group
  on mixtapes (profile_id, group_id) where group_id is not null;

-- ============================================================
-- 2. Groups
-- ============================================================

create table groups (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  description  text not null default '',
  mode         text not null default 'anthology'
    check (mode in ('anthology', 'collective')),
  created_by   uuid not null references profiles(id) on delete restrict,
  created_at   timestamptz not null default now()
);

-- Slug format: 3-32 chars, lowercase ASCII + hyphens, starts with a letter,
-- doesn't end in a hyphen. Mirrors profile-handle validation pattern.
alter table groups
  add constraint groups_slug_format
  check (slug ~ '^[a-z][a-z0-9-]{1,30}[a-z0-9]$');

-- Now wire mixtapes.group_id → groups, with a "set null" cascade so that
-- deleting a group reverts member mixtapes to personal scope (per
-- design-groups.md "What happens when a group is deleted").
alter table mixtapes
  add constraint mixtapes_group_id_fkey
  foreign key (group_id) references groups(id) on delete set null;

create index mixtapes_group_id_idx on mixtapes (group_id) where group_id is not null;

-- ============================================================
-- 3. Group memberships
-- ============================================================

create table group_memberships (
  group_id    uuid not null references groups(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  role        text not null default 'member'
    check (role in ('steward', 'member')),
  joined_at   timestamptz not null default now(),
  primary key (group_id, profile_id)
);

-- Reverse lookup: "what groups is this profile in?"
create index group_memberships_profile_id_idx on group_memberships (profile_id);

-- ============================================================
-- 4. Group invites
-- ============================================================
-- Codes are human-pickable (e.g. 'spring2026') and unique per group, not
-- globally. The new-user invite flow validates codes at /g/{slug}/i/{code}.

create table group_invites (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id) on delete cascade,
  code            text not null,
  created_by      uuid not null references profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  uses_remaining  integer,  -- null = unlimited
  -- 4-32 chars, lowercase alphanumerics + hyphens, no leading/trailing
  -- hyphen. Stewards pick memorable codes; rate-limiting at the route
  -- handles brute-force concerns at short lengths.
  constraint group_invites_code_format
    check (code ~ '^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$'),
  unique (group_id, code)
);

-- Active-code lookup by group.
create index group_invites_group_active_idx on group_invites (group_id)
  where revoked_at is null;

-- ============================================================
-- 5. Guest links — per-mixtape tokenized share URLs
-- ============================================================
-- Grants read access to a single mixtape for someone outside the group,
-- without granting group membership. Token defaults to a random 32-char
-- hex string at insert time (16 bytes of entropy is plenty at our scale).

create table guest_links (
  id           uuid primary key default gen_random_uuid(),
  mixtape_id   uuid not null references mixtapes(id) on delete cascade,
  token        text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_by   uuid not null references profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz
);

create index guest_links_mixtape_active_idx on guest_links (mixtape_id)
  where revoked_at is null;

-- ============================================================
-- 6. Songs gain mixtape_id (nullable for this migration)
-- ============================================================
-- songs.owner_id is preserved as a denormalization (and for future
-- collective-mode "who added this song" semantics). The mixtape_id link
-- is what scopes songs to a specific mixtape, once the editor + reader
-- code routes through it. NOT NULL tightening is a later migration after
-- the code is using the column on inserts.

alter table songs add column mixtape_id uuid references mixtapes(id) on delete cascade;

update songs s
   set mixtape_id = m.id
  from mixtapes m
 where m.profile_id = s.owner_id
   and m.group_id is null;

create index songs_mixtape_id_idx on songs (mixtape_id);

-- ============================================================
-- 7. RLS — enabled on all new tables; policies land in step 2.
-- ============================================================
-- With RLS enabled and no policies, anon/authenticated reads are blocked.
-- Server-side service_role bypasses RLS so any future seed/admin code
-- still works. Step 2 (next migration) layers in:
--   - mixtape reads: gated by membership when visibility='group', or by
--     a valid guest_links.token; unlisted/public reads stay open.
--   - groups + memberships + invites + guest_links: members-only.

alter table mixtapes enable row level security;
alter table groups enable row level security;
alter table group_memberships enable row level security;
alter table group_invites enable row level security;
alter table guest_links enable row level security;
