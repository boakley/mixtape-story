-- Phase 1a: profiles only.
-- The `songs`, `stories`, `story_media`, `songlink_cache`, and `ask_clicks` tables
-- land in Phase 1b once the editor needs them. Keeping the auth foundation
-- minimal lets us iterate without dragging schema we don't yet exercise.

create extension if not exists "pgcrypto";

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique not null,
  display_name  text not null,
  bio           text,
  created_at    timestamptz not null default now()
);

-- Handle validation: lowercase letters, digits, hyphens; 2-32 chars; must start with a letter
-- and not end in a hyphen. Mirrors the matcher in src/lib/server/handle.ts (added in 1b).
alter table profiles
  add constraint profiles_handle_format
  check (handle ~ '^[a-z][a-z0-9-]{0,30}[a-z0-9]$');
