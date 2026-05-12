-- Keep stories.updated_at fresh on every write.
create or replace function stories_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stories_set_updated_at
  before update on stories
  for each row execute function stories_touch_updated_at();
