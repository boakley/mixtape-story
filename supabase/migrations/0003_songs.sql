-- Phase 1b: songs + stories + song_cache.
-- See docs/PHASE-1B.md "Schema" for design rationale.

create table songs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,
  position            integer not null,
  -- Canonical metadata (filled by resolver or by hand):
  title               text not null,
  artist              text,
  album               text,
  release_year        integer,
  memory_year         integer,
  isrc                text,
  album_art_url       text,
  -- Resolution:
  source_url          text,
  songlink_url        text,
  link_status         text not null default 'pending'
    check (link_status in ('pending', 'done', 'failed', 'manual')),
  link_attempts       integer not null default 0,
  link_last_attempt   timestamptz,
  link_last_error     text,
  added_at            timestamptz not null default now()
);

create index songs_owner_position_idx on songs (owner_id, position);
create index songs_pending_idx on songs (link_status) where link_status = 'pending';

-- 1:1 with songs. Separate row so empty stories are first-class state
-- and a story update doesn't touch the songs row.
create table stories (
  song_id     uuid primary key references songs(id) on delete cascade,
  text        text not null default '',
  updated_at  timestamptz not null default now()
);

-- Resolver cache, keyed by normalized source URL. Shared across all users.
create table song_cache (
  source_url   text primary key,
  payload      jsonb not null,
  fetched_at   timestamptz not null default now()
);
