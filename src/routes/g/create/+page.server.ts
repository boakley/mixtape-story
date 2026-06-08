import { error, fail, redirect } from '@sveltejs/kit';
import { isFeatureAvailable } from '$lib/server/features';
import { isReservedGroupSlug } from '$lib/groups/reserved-slugs';
import { adminClient } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

function gate(user: { email?: string | null } | null) {
  if (!isFeatureAvailable('groups', user)) throw error(404, 'Not Found');
}

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  // Get user before the gate so admin-bypass works.
  const { user } = await safeGetSession();
  gate(user);
  if (!user) throw redirect(303, '/login');

  // A creator needs a profile (handle) before they can create a group — the
  // steward membership row references profiles.id, and the creator's
  // /u/{handle} profile is where future "I made this group" attribution
  // would point. Send unhandled users through onboarding first.
  const { data: profile } = await adminClient()
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) throw redirect(303, '/onboarding');

  return { handle: profile.handle as string };
};

type Values = { slug: string; name: string; description: string };

function shortFail(status: number, values: Values, errorMsg: string) {
  return fail(status, { ...values, error: errorMsg });
}

export const actions: Actions = {
  default: async ({ request, locals: { safeGetSession } }) => {
    const { user } = await safeGetSession();
    gate(user);
    if (!user) throw redirect(303, '/login');

    const data = await request.formData();
    const values: Values = {
      slug: String(data.get('slug') ?? '').trim().toLowerCase(),
      name: String(data.get('name') ?? '').trim(),
      description: String(data.get('description') ?? '').trim()
    };

    if (!values.slug || !SLUG_RE.test(values.slug)) {
      return shortFail(
        400, values,
        'Slug must be 3–32 chars, lowercase letters, digits, and hyphens; start with a letter; not end in a hyphen.'
      );
    }
    if (isReservedGroupSlug(values.slug)) {
      return shortFail(400, values, `"${values.slug}" is reserved. Pick another.`);
    }
    if (!values.name || values.name.length > MAX_NAME) {
      return shortFail(400, values, `Name is required (up to ${MAX_NAME} characters).`);
    }
    if (values.description.length > MAX_DESCRIPTION) {
      return shortFail(400, values, `Description must be ${MAX_DESCRIPTION} characters or fewer.`);
    }

    const admin = adminClient();

    // Uniqueness check separate from the insert so we can return a friendlier
    // error than the raw constraint-violation message.
    const { data: taken } = await admin
      .from('groups')
      .select('id')
      .eq('slug', values.slug)
      .maybeSingle();
    if (taken) return shortFail(409, values, `"${values.slug}" is taken. Pick another.`);

    // Insert the group, then add the creator as steward. Both use the
    // service-role client to bypass RLS; the user is already authenticated
    // and the route enforces created_by = their id.
    const { data: groupRow, error: insertError } = await admin
      .from('groups')
      .insert({
        slug: values.slug,
        name: values.name,
        description: values.description,
        mode: 'anthology',
        created_by: user.id
      })
      .select('id')
      .single();
    if (insertError || !groupRow) {
      return shortFail(500, values, 'Could not create the group. Try again.');
    }

    const { error: membershipError } = await admin
      .from('group_memberships')
      .insert({
        group_id: groupRow.id,
        profile_id: user.id,
        role: 'steward'
      });
    if (membershipError) {
      // Best-effort cleanup so an orphan group doesn't sit there with no
      // steward to manage it. Rare path; only happens if the second
      // insert hits a constraint or transport error.
      await admin.from('groups').delete().eq('id', groupRow.id);
      return shortFail(500, values, 'Could not finalize the group. Try again.');
    }

    throw redirect(303, `/g/${values.slug}`);
  }
};
