#!/usr/bin/env -S node --experimental-strip-types
/**
 * One-shot CSV → DB migration for the Phase 1b cutover.
 *
 *   pnpm tsx scripts/migrate-seeds.ts                       # dry run
 *   pnpm tsx scripts/migrate-seeds.ts --apply               # write
 *
 * Reads each seed CSV (`src/lib/seed/<handle>.csv`), looks up the matching
 * profile, and inserts `songs` + `stories` rows. The `year` column means
 * `memory_year` for hand-curated CSVs and `release_year` for CSVs that
 * came from a streaming-service export. The per-handle mapping is in
 * `yearMeaning` below; default is `memory`.
 *
 * Uses the service-role key so RLS does not block writes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseSeedCsv } from '../src/lib/seed/parse.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SEED_DIR = resolvePath(HERE, '..', 'src', 'lib', 'seed');

const yearMeaning: Record<string, 'memory' | 'release'> = {
  bryan: 'memory',
  roxanne: 'memory'
};

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function migrateHandle(handle: string, raw: string): Promise<void> {
  const meaning = yearMeaning[handle] ?? 'memory';
  const songs = parseSeedCsv(raw);
  console.log(`\n== ${handle} (${songs.length} songs, year=${meaning}) ==`);

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, handle')
    .eq('handle', handle)
    .maybeSingle();
  if (profErr) {
    console.error(`  ! could not look up profile: ${profErr.message}`);
    return;
  }
  if (!profile) {
    console.warn(`  ! no profile for handle "${handle}" — skipping (sign in once to create it)`);
    return;
  }

  // Skip if any songs already exist for this owner (don't double-import).
  const { count } = await supabase
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', profile.id);
  if ((count ?? 0) > 0) {
    console.log(`  · ${count} songs already exist for ${handle}; skipping.`);
    return;
  }

  for (const [i, song] of songs.entries()) {
    const memoryYear = meaning === 'memory' ? song.year : null;
    const releaseYear = meaning === 'release' ? song.year : null;
    const linkStatus = song.link ? 'done' : 'manual';

    const row = {
      owner_id: profile.id,
      position: i + 1,
      title: song.title,
      artist: song.artist,
      album: song.album,
      release_year: releaseYear,
      memory_year: memoryYear,
      source_url: song.link,
      songlink_url: song.link,
      link_status: linkStatus
    };

    console.log(
      `  ${(i + 1).toString().padStart(3)} ${row.title}${row.artist ? ' — ' + row.artist : ''}` +
        ` [${linkStatus}${memoryYear ? `, my ${memoryYear}` : ''}${releaseYear ? `, rel ${releaseYear}` : ''}]`
    );

    if (!APPLY) continue;

    const { data: inserted, error: insErr } = await supabase
      .from('songs')
      .insert(row)
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error(`    ! insert failed: ${insErr?.message ?? 'unknown'}`);
      continue;
    }
    const { error: storyErr } = await supabase
      .from('stories')
      .insert({ song_id: inserted.id, text: song.story });
    if (storyErr) console.error(`    ! story insert failed: ${storyErr.message}`);
  }
}

const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.csv'));
console.log(`Found ${files.length} seed CSV(s) in ${SEED_DIR}`);
console.log(APPLY ? 'Mode: APPLY (writes will happen)' : 'Mode: DRY RUN (use --apply to write)');

for (const file of files) {
  const handle = file.replace(/\.csv$/, '');
  const raw = readFileSync(resolvePath(SEED_DIR, file), 'utf8');
  await migrateHandle(handle, raw);
}

console.log('\nDone.');
