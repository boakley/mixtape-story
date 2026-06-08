// Global setup runs once before any tests. We use it to warm the
// dev server so the first test doesn't pay SvelteKit's on-demand
// route-compilation cost (which on a cold start can push the
// /login → signInWithOtp chain over the default 5s expect timeout).
//
// Hit a couple of representative routes — enough to compile the
// initial bundles and prime the Supabase admin client connection.

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

  // Routes to pre-compile. Keep this short; we only need enough that
  // the on-demand compilation isn't blocking the first test.
  const warmupPaths = ['/', '/login'];

  await Promise.all(
    warmupPaths.map((path) =>
      fetch(`${baseURL}${path}`).catch(() => {
        /* swallow — if the server isn't up yet, Playwright's
         * webServer config will boot it; we're just opportunistic */
      })
    )
  );
}
