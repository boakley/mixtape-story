-- iTunes Search query cache + a small RLS fix on song_cache.
--
-- The editor's `parse_list` action looks up `itunes_cache` to skip repeat
-- searches across users (e.g. Jen and Bryan both have "Angel from Montgomery
-- John Prine"). Reads run in user context; writes are service-role only.

create table itunes_cache (
  query        text primary key,    -- normalized: lowercased, single-spaced, trimmed
  payload      jsonb not null,      -- the Track we'd write to a song row
  fetched_at   timestamptz not null default now()
);

alter table itunes_cache enable row level security;

-- Signed-in users can read the shared cache; only the service role writes it.
create policy itunes_cache_select_auth
  on itunes_cache for select
  to authenticated
  using (true);

-- song_cache (added in 0003) was enabled-RLS with no policies, which meant
-- the editor's own cache-hit lookups silently never matched. Same fix:
-- public read; service-role writes via the resolution worker.
create policy song_cache_select_auth
  on song_cache for select
  to authenticated
  using (true);
