import type { PageLoad } from './$types';

const csvFiles = import.meta.glob('/src/lib/seed/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true
});

export const load: PageLoad = () => {
  const handles = Object.keys(csvFiles)
    .map((p) => p.match(/\/([^/]+)\.csv$/)?.[1])
    .filter((h): h is string => !!h)
    .sort();
  return { handles };
};
