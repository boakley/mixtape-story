#!/usr/bin/env -S node --experimental-strip-types
/**
 * Seed the LOCAL Supabase with a populated group so we can look at the
 * group landing page with real-shape data.
 *
 *   pnpm tsx scripts/seed-group.ts             # dry run
 *   pnpm tsx scripts/seed-group.ts --apply     # write
 *
 * Each run, idempotently:
 *   - Drops the seed group ("writing-meditation") and the throwaway
 *     personas (roxanne, diane, jack), cascading their songs/shares/
 *     memberships. We never wipe bryan — that may be a real local profile.
 *   - Ensures 4 personas exist: bryan, roxanne, diane, jack. Looks up by
 *     handle; creates a fake auth user (`<handle>@e2e.local`) for any
 *     that are missing.
 *   - Creates the group with bryan as steward; roxanne/diane/jack as
 *     members.
 *   - For each persona with 0 songs, imports src/lib/seed/<handle>.csv.
 *     If a persona already has songs (e.g. bryan imported via
 *     migrate-seeds.ts), we leave the existing data alone.
 *   - Shares each persona's mixtape with the group.
 *
 * Refuses to run unless SUPABASE_URL points at localhost.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseSeedCsv } from '../src/lib/seed/parse.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SEED_DIR = resolvePath(HERE, '..', 'src', 'lib', 'seed');

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

// Hard safety gate. This script creates fake users and wipes by handle —
// running it against a remote DB would be very bad.
if (!/(localhost|127\.0\.0\.1)/.test(SUPABASE_URL)) {
  console.error(
    `Refusing to run: ${SUPABASE_URL} doesn't look like localhost.\n` +
      'This script seeds fake users and is destructive — only intended for local dev.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Persona = {
  handle: string;
  displayName: string;
  role: 'steward' | 'member';
};

const GROUP_SLUG = 'writing-meditation';
const GROUP_NAME = 'Writing & meditation';
const GROUP_DESCRIPTION =
  'A small contemplative-writing group sharing songs and the stories behind them.';

const PERSONAS: Persona[] = [
  { handle: 'bryan', displayName: 'Bryan', role: 'steward' },
  { handle: 'roxanne', displayName: 'Roxanne', role: 'member' },
  { handle: 'diane', displayName: 'Diane', role: 'member' },
  { handle: 'jack', displayName: 'Jack', role: 'member' }
];

// Personas that are pure seed-fakes (vs. potentially-real local profiles).
// Only these get wiped on re-run; bryan is left alone.
const FAKE_HANDLES = new Set(['roxanne', 'diane', 'jack']);

// CSV "year" column meaning, per persona.
const yearMeaning: Record<string, 'memory' | 'release'> = {
  bryan: 'memory',
  roxanne: 'memory',
  diane: 'memory',
  jack: 'memory'
};

function log(msg: string): void {
  console.log(msg);
}

async function wipe(): Promise<void> {
  log('\n== Wipe ==');

  // 1) Drop the seed group. Cascades memberships, invites, mixtape_group_shares.
  const { data: g } = await supabase
    .from('groups')
    .select('id')
    .eq('slug', GROUP_SLUG)
    .maybeSingle();
  if (g) {
    log(`  - dropping group "${GROUP_SLUG}"`);
    if (APPLY) {
      const { error } = await supabase.from('groups').delete().eq('id', g.id);
      if (error) throw new Error(`drop group: ${error.message}`);
    }
  } else {
    log(`  - no existing group "${GROUP_SLUG}"`);
  }

  // 2) Drop the throwaway personas. profiles.id == auth.users.id, so
  //    deleting the auth user cascades profile, mixtape, songs, stories.
  for (const handle of FAKE_HANDLES) {
    const { data: p } = await supabase
      .from('profiles')
      .select('id')
      .eq('handle', handle)
      .maybeSingle();
    if (p) {
      log(`  - deleting "${handle}" (auth user + cascade)`);
      if (APPLY) {
        const { error } = await supabase.auth.admin.deleteUser(p.id as string);
        if (error) throw new Error(`deleteUser(${handle}): ${error.message}`);
      }
    } else {
      log(`  - no existing "${handle}"`);
    }
  }
}

async function ensurePersona(
  p: Persona
): Promise<{ profileId: string; mixtapeId: string }> {
  // 1) Profile lookup; create if missing.
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', p.handle)
    .maybeSingle();

  let profileId: string;
  if (existing) {
    log(`  · ${p.handle}: found existing profile`);
    profileId = existing.id as string;
  } else {
    const email = `${p.handle}@e2e.local`;
    log(`  + ${p.handle}: creating auth user (${email})`);
    if (!APPLY) {
      return { profileId: 'DRY-RUN', mixtapeId: 'DRY-RUN' };
    }
    const { data: u, error: ue } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true
    });
    if (ue || !u.user) throw new Error(`createUser(${p.handle}): ${ue?.message}`);
    profileId = u.user.id;
    const { error: pe } = await supabase
      .from('profiles')
      .insert({ id: profileId, handle: p.handle, display_name: p.displayName });
    if (pe) throw new Error(`insert profile(${p.handle}): ${pe.message}`);
  }

  // 2) Personal mixtape lookup-or-create (one per profile, group_id is null).
  const { data: mx } = await supabase
    .from('mixtapes')
    .select('id')
    .eq('profile_id', profileId)
    .is('group_id', null)
    .maybeSingle();

  let mixtapeId: string;
  if (mx) {
    mixtapeId = mx.id as string;
  } else {
    if (!APPLY) return { profileId, mixtapeId: 'DRY-RUN' };
    const { data: created, error: me } = await supabase
      .from('mixtapes')
      .insert({ profile_id: profileId, visibility: 'unlisted' })
      .select('id')
      .single();
    if (me || !created) throw new Error(`insert mixtape(${p.handle}): ${me?.message}`);
    mixtapeId = created.id as string;
  }

  return { profileId, mixtapeId };
}

async function importCsv(
  p: Persona,
  profileId: string,
  mixtapeId: string
): Promise<void> {
  const csvPath = resolvePath(SEED_DIR, `${p.handle}.csv`);
  if (!existsSync(csvPath)) {
    log(`  · ${p.handle}: no CSV at src/lib/seed/${p.handle}.csv — skipping import`);
    return;
  }

  // Don't double-import. If the owner already has any song, leave it alone.
  if (APPLY) {
    const { count } = await supabase
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', profileId);
    if ((count ?? 0) > 0) {
      log(`  · ${p.handle}: ${count} song(s) already present — skipping import`);
      return;
    }
  }

  const raw = readFileSync(csvPath, 'utf8');
  const songs = parseSeedCsv(raw);
  const meaning = yearMeaning[p.handle] ?? 'memory';
  log(`  + ${p.handle}: importing ${songs.length} song(s) (year=${meaning})`);

  if (!APPLY) return;

  for (const [i, song] of songs.entries()) {
    const memoryYear = meaning === 'memory' ? song.year : null;
    const releaseYear = meaning === 'release' ? song.year : null;
    const row = {
      owner_id: profileId,
      mixtape_id: mixtapeId,
      position: i + 1,
      title: song.title,
      artist: song.artist,
      album: song.album,
      release_year: releaseYear,
      memory_year: memoryYear,
      source_url: song.link,
      songlink_url: song.link,
      link_status: song.link ? 'done' : 'manual'
    };
    const { data: inserted, error: ie } = await supabase
      .from('songs')
      .insert(row)
      .select('id')
      .single();
    if (ie || !inserted) {
      console.error(`    ! insert song failed (${song.title}): ${ie?.message}`);
      continue;
    }
    const { error: se } = await supabase
      .from('stories')
      .insert({ song_id: inserted.id, text: song.story });
    if (se) console.error(`    ! insert story failed (${song.title}): ${se.message}`);
  }
}

async function createGroup(stewardProfileId: string): Promise<string> {
  log('\n== Group ==');
  log(`  + creating "${GROUP_SLUG}" (created_by: bryan)`);
  if (!APPLY) return 'DRY-RUN';
  const { data: g, error: ge } = await supabase
    .from('groups')
    .insert({
      slug: GROUP_SLUG,
      name: GROUP_NAME,
      description: GROUP_DESCRIPTION,
      created_by: stewardProfileId
    })
    .select('id')
    .single();
  if (ge || !g) throw new Error(`insert group: ${ge?.message}`);
  return g.id as string;
}

async function addMembership(
  groupId: string,
  profileId: string,
  role: 'steward' | 'member'
): Promise<void> {
  if (!APPLY) return;
  const { error } = await supabase
    .from('group_memberships')
    .insert({ group_id: groupId, profile_id: profileId, role });
  if (error) throw new Error(`insert membership: ${error.message}`);
}

async function shareMixtape(groupId: string, mixtapeId: string): Promise<void> {
  if (!APPLY) return;
  const { error } = await supabase
    .from('mixtape_group_shares')
    .insert({ group_id: groupId, mixtape_id: mixtapeId });
  if (error) throw new Error(`insert share: ${error.message}`);
}

async function main(): Promise<void> {
  log(`SUPABASE_URL: ${SUPABASE_URL}`);
  log(`Mode: ${APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (use --apply to write)'}`);

  await wipe();

  log('\n== Personas ==');
  const ids: Record<string, { profileId: string; mixtapeId: string }> = {};
  for (const p of PERSONAS) {
    ids[p.handle] = await ensurePersona(p);
    await importCsv(p, ids[p.handle].profileId, ids[p.handle].mixtapeId);
  }

  const stewardId = ids['bryan'].profileId;
  const groupId = await createGroup(stewardId);

  log('\n== Memberships ==');
  for (const p of PERSONAS) {
    log(`  + ${p.handle}: ${p.role}`);
    await addMembership(groupId, ids[p.handle].profileId, p.role);
  }

  log('\n== Shares ==');
  for (const p of PERSONAS) {
    log(`  + ${p.handle}: share mixtape with group`);
    await shareMixtape(groupId, ids[p.handle].mixtapeId);
  }

  log(
    `\nDone. ${
      APPLY
        ? `Visit http://localhost:5173/g/${GROUP_SLUG} as bryan to see it.`
        : '(dry run — re-run with --apply)'
    }`
  );
}

main().catch((e) => {
  console.error('\nFAILED:', e?.message ?? e);
  process.exit(1);
});
