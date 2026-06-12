import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Legacy editor URL. The editor moved to /{handle}/_edit when mixtape
// slugs landed (system paths wear the `_` prefix so they can never
// collide with a slug — see src/lib/mixtapes/slug.ts). This literal
// route segment outranks [[slug=mixtapeslug]], which is why 'edit' is
// the one denylisted slug. Kept for bookmarks and muscle memory.
export const load: PageServerLoad = async ({ params }) => {
  throw redirect(308, `/${params.handle}/_edit`);
};
