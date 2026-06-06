import { isAdminEmail } from '$lib/server/admin';
import { getFeatures } from '$lib/server/features';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
  const { session, user } = await safeGetSession();

  let viewerHandle: string | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('handle')
      .eq('id', user.id)
      .maybeSingle();
    viewerHandle = (data?.handle as string | undefined) ?? null;
  }

  return {
    session,
    user,
    viewerHandle,
    isAdmin: isAdminEmail(user?.email),
    features: getFeatures()
  };
};
