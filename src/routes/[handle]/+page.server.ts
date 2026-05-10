import { error } from '@sveltejs/kit';
import { parseSeedCsv } from '$lib/seed/parse';
import type { PageServerLoad } from './$types';

// Eager-glob every seed CSV at build time so handles are statically known.
const csvFiles = import.meta.glob('/src/lib/seed/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const csvByHandle: Record<string, string> = {};
for (const [path, content] of Object.entries(csvFiles)) {
  const match = path.match(/\/([^/]+)\.csv$/);
  if (match) csvByHandle[match[1]!] = content;
}

export const prerender = true;

export const entries = () => Object.keys(csvByHandle).map((handle) => ({ handle }));

export const load: PageServerLoad = ({ params }) => {
  const { handle } = params;
  const csv = csvByHandle[handle];
  if (!csv) throw error(404, 'Mixtape not found');

  const songs = parseSeedCsv(csv);
  const displayName = handle.charAt(0).toUpperCase() + handle.slice(1);

  return { handle, displayName, songs };
};
