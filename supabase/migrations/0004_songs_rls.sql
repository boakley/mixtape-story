-- RLS for songs, stories, song_cache.
-- songs/stories: public read (the /{handle} page is public); owner-only write.
-- song_cache: RLS on, no policies — only service-role (the resolution worker) touches it.

alter table songs enable row level security;
alter table stories enable row level security;
alter table song_cache enable row level security;

-- songs --------------------------------------------------------------
create policy songs_select_all
  on songs for select
  using (true);

create policy songs_insert_self
  on songs for insert
  with check (owner_id = auth.uid());

create policy songs_update_self
  on songs for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy songs_delete_self
  on songs for delete
  using (owner_id = auth.uid());

-- stories ------------------------------------------------------------
create policy stories_select_all
  on stories for select
  using (true);

create policy stories_insert_self
  on stories for insert
  with check (
    exists (select 1 from songs where songs.id = stories.song_id and songs.owner_id = auth.uid())
  );

create policy stories_update_self
  on stories for update
  using (
    exists (select 1 from songs where songs.id = stories.song_id and songs.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from songs where songs.id = stories.song_id and songs.owner_id = auth.uid())
  );

create policy stories_delete_self
  on stories for delete
  using (
    exists (select 1 from songs where songs.id = stories.song_id and songs.owner_id = auth.uid())
  );
