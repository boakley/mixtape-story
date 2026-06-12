import { isAdminEmail } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
  const { session, user } = await safeGetSession();

  let viewerHandle: string | null = null;
  let viewerDisplayName: string | null = null;
  let viewerMixtapes: { slug: string | null; name: string | null }[] = [];
  let viewerGroups: { slug: string; name: string }[] = [];

  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('handle, display_name')
      .eq('id', user.id)
      .maybeSingle();
    viewerHandle = (data?.handle as string | undefined) ?? null;
    viewerDisplayName = (data?.display_name as string | undefined) ?? null;

    // ☰ navigation: the viewer's mixtapes (primary — slug null — first,
    // then creation order) and the groups they belong to. Both queries
    // pass RLS with the user client.
    const [{ data: mixtapes }, { data: memberships }] = await Promise.all([
      supabase
        .from('mixtapes')
        .select('slug, name, created_at')
        .eq('profile_id', user.id)
        .order('created_at'),
      supabase
        .from('group_memberships')
        .select('groups(slug, name)')
        .eq('profile_id', user.id)
    ]);

    const rows = (mixtapes ?? []) as { slug: string | null; name: string | null }[];
    viewerMixtapes = [
      ...rows.filter((m) => m.slug === null),
      ...rows.filter((m) => m.slug !== null)
    ].map(({ slug, name }) => ({ slug, name }));

    viewerGroups = ((memberships ?? []) as unknown as { groups: { slug: string; name: string } | null }[])
      .flatMap((m) => (m.groups ? [m.groups] : []));
  }

  return {
    session,
    user,
    viewerHandle,
    viewerDisplayName,
    viewerMixtapes,
    viewerGroups,
    isAdmin: isAdminEmail(user?.email)
  };
};
