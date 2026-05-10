-- RLS for profiles.
-- Public read (everyone can see /{handle} pages); only the owner can insert/update.

alter table profiles enable row level security;

create policy profiles_select_all
  on profiles for select
  using (true);

create policy profiles_insert_self
  on profiles for insert
  with check (id = auth.uid());

create policy profiles_update_self
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
