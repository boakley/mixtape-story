import csvRaw from '$lib/seed/bryan.csv?raw';
import { parseSeedCsv } from '$lib/seed/parse';
import type { PageServerLoad } from './$types';

export const prerender = true;

export const load: PageServerLoad = () => {
  const songs = parseSeedCsv(csvRaw);
  return {
    handle: 'bryan',
    displayName: 'Bryan',
    songs
  };
};
