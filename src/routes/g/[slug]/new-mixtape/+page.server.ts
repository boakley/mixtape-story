import { error, fail, redirect } from '@sveltejs/kit';
import { requireGroupRole } from '$lib/server/group-actions';
import { isValidMixtapeSlug } from '$lib/mixtapes/slug';
import { copyMixtapeInto } from '$lib/server/mixtape-copy';
import type { Actions, PageServerLoad } from './$types';

// Group-born mixtape creation — the only way secondary mixtapes come
// into being (v1.5). The slug is the group's slug, the share is
// created in the same action, and "Start from" can deep-copy any of
// the member's existing mixtapes. The 1:1 mixtape↔group pairing lives
// here in the flow; the schema underneath stays general.

const MAX_NAME = 100;

export const load: PageServerLoad = async ({ params, locals }) => {
  const ctx = await requireGroupRole(params, locals, 'member');
  if (!ctx.ok) throw error(ctx.status, ctx.message);
  const { admin, user, group } = ctx;

  const [{ data: groupRow }, { data: profile }, { data: mixtapes }] = await Promise.all([
    admin.from('groups').select('name').eq('id', group.id).maybeSingle(),
    admin.from('profiles').select('handle, display_name').eq('id', user.id).maybeSingle(),
    admin
      .from('mixtapes')
      .select('id, slug, name')
      .eq('profile_id', user.id)
      .order('created_at')
  ]);
  if (!groupRow || !profile) throw error(404, 'Group not found');

  const rows = (mixtapes ?? []) as { id: string; slug: string | null; name: string | null }[];
  const sources = [
    ...rows.filter((m) => m.slug === null),
    ...rows.filter((m) => m.slug !== null && m.slug !== params.slug)
  ].map((m) => ({
    id: m.id,
    name: m.name ?? `${profile.display_name}'s mixtape`
  }));

  return {
    groupSlug: params.slug,
    groupName: groupRow.name as string,
    handle: profile.handle as string,
    alreadyExists: rows.some((m) => m.slug === params.slug),
    sources
  };
};

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
    const ctx = await requireGroupRole(params, locals, 'member');
    if (!ctx.ok) return fail(ctx.status, { error: ctx.message });
    const { admin, user, group } = ctx;

    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const start = String(data.get('start') ?? 'blank');

    if (!name) return fail(400, { error: 'A group mixtape needs a name.' });
    if (name.length > MAX_NAME) {
      return fail(400, { error: `Name must be ${MAX_NAME} characters or fewer.` });
    }
    // Group slugs share the mixtape-slug grammar; the one exception is
    // the reserved legacy word, which a group could theoretically own.
    if (!isValidMixtapeSlug(params.slug)) {
      return fail(400, { error: 'This group’s name can’t be used as a mixtape address.' });
    }

    // "Copy of X" sources must be the member's own mixtape.
    let sourceId: string | null = null;
    if (start !== 'blank') {
      const { data: source } = await admin
        .from('mixtapes')
        .select('id')
        .eq('id', start)
        .eq('profile_id', user.id)
        .maybeSingle();
      if (!source) return fail(400, { error: 'Pick a mixtape of yours to copy.' });
      sourceId = source.id as string;
    }

    const { data: created, error: insErr } = await admin
      .from('mixtapes')
      .insert({ profile_id: user.id, slug: params.slug, name, visibility: 'unlisted' })
      .select('id')
      .maybeSingle();
    if (insErr || !created) {
      if (insErr?.code === '23505') {
        return fail(400, { error: 'You already have a mixtape named after this group.' });
      }
      return fail(500, { error: insErr?.message ?? 'Could not create the mixtape.' });
    }

    if (sourceId) {
      await copyMixtapeInto(admin, sourceId, created.id as string);
    }

    // The share is part of the birth: replace whatever this member
    // currently shows the group (usually their primary) with the new
    // group-born mixtape.
    await admin
      .from('mixtape_group_shares')
      .delete()
      .eq('profile_id', user.id)
      .eq('group_id', group.id);
    const { error: shareErr } = await admin
      .from('mixtape_group_shares')
      .insert({ mixtape_id: created.id as string, group_id: group.id });
    if (shareErr) return fail(500, { error: shareErr.message });

    const { data: profile } = await admin
      .from('profiles')
      .select('handle')
      .eq('id', user.id)
      .maybeSingle();
    const handle = (profile?.handle as string | undefined) ?? '';

    // Blank mixtapes land in their editor — nothing to read yet. A
    // copy has content, so it lands back on the group page where its
    // card now shows.
    throw redirect(303, sourceId ? `/g/${params.slug}` : `/${handle}/${params.slug}/_edit`);
  }
};
