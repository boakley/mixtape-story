-- Launch seed: create the writing-meditation group and enroll the
-- existing production users (the writing group v1 was built for),
-- sharing each member's mixtape into the group so the directory is
-- populated from day one rather than unveiling empty.
--
-- Excluded handles: danfiasco, bryan1 (test/alt accounts).
--
-- Idempotent — every insert is on-conflict-do-nothing, so re-running
-- (or a member having already joined/shared by hand) is safe. On a
-- database without the steward profile (fresh local stack, CI) the
-- whole block is a no-op.

do $$
declare
  steward uuid;
  gid uuid;
begin
  select id into steward from profiles where handle = 'bryan';
  if steward is null then
    raise notice 'writing-meditation seed skipped: no "bryan" profile here';
    return;
  end if;

  insert into groups (slug, name, description, mode, created_by)
  values (
    'writing-meditation',
    'Writing Meditation Group',
    'We are a group of friends that meet weekly for a writing meditation '
      || 'focused on secular Buddhism. Get to know some of the group by the '
      || 'music that shapes our lives.',
    'anthology',
    steward
  )
  -- The group may already exist (it was trialled via admin bypass while
  -- the feature was flagged). This migration is authoritative for the
  -- launch wording; existing memberships/created_by are untouched.
  on conflict (slug) do update
    set name = excluded.name,
        description = excluded.description;

  select id into gid from groups where slug = 'writing-meditation';

  insert into group_memberships (group_id, profile_id, role)
  select gid, p.id,
         case when p.id = steward then 'steward' else 'member' end
  from profiles p
  where p.handle not in ('danfiasco', 'bryan1')
  on conflict (group_id, profile_id) do nothing;

  insert into mixtape_group_shares (mixtape_id, group_id)
  select m.id, gid
  from mixtapes m
  join group_memberships gm
    on gm.profile_id = m.profile_id
   and gm.group_id = gid
  on conflict (mixtape_id, group_id) do nothing;
end $$;
