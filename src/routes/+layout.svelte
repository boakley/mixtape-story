<script lang="ts">
  import { page } from '$app/state';
  import { fade, fly } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import '../app.css';
  import type { LayoutData } from './$types';

  type Props = { data: LayoutData; children: Snippet };
  let { data, children }: Props = $props();

  let menuOpen = $state(false);
  let adminMenuOpen = $state(false);
  let menuButtonEl: HTMLButtonElement | undefined = $state();
  let drawerEl: HTMLElement | undefined = $state();

  // Honor prefers-reduced-motion: the drawer snaps instead of sliding.
  // Read lazily (SSR-safe) at the moment a transition starts.
  function motionMs(full: number): number {
    if (typeof window === 'undefined') return 0;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : full;
  }

  // Pages where the hamburger has nothing useful to offer.
  const HIDE_MENU_ON = new Set(['/login']);
  const showMenu = $derived(!HIDE_MENU_ON.has(page.url.pathname));

  // When the viewer is on their own /{handle} mixtape page, the ☰ menu
  // gains a "Manage this mixtape" section with Edit + QR (Listen-with
  // and Visitor-count come in later steps). Detect via the SvelteKit
  // route id so we don't have to guess from the pathname.
  const isMixtapeView = $derived(page.route.id === '/[handle]/[[slug=mixtapeslug]]');
  // /{handle} or /{handle}/{slug} — the current mixtape page's base path.
  const mixtapeBase = $derived(
    page.params.slug ? `/${page.params.handle}/${page.params.slug}` : `/${page.params.handle}`
  );
  const isOwnerOfThisMixtape = $derived(
    isMixtapeView &&
      typeof page.params.handle === 'string' &&
      page.params.handle === data.viewerHandle
  );

  function openMenu() {
    menuOpen = true;
    // If the user is already on an admin page when they pop the menu,
    // expand the admin submenu by default — they're more likely to be
    // navigating within the section than out of it.
    adminMenuOpen = page.url.pathname.startsWith('/admin');
  }

  function closeMenu() {
    menuOpen = false;
  }

  function toggleMenu() {
    if (menuOpen) closeMenu();
    else openMenu();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  }

  // Minimal focus trap: Tab cycles within the drawer while it's open.
  function trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !drawerEl) return;
    const focusables = drawerEl.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // While the drawer is open: lock body scroll, move focus in; on
  // close: restore both. Focus returns to the ☰ chip.
  $effect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerEl?.focus();
    return () => {
      document.body.style.overflow = prev;
      menuButtonEl?.focus();
    };
  });

  /** Quiet current-page marker for drawer links. */
  function isCurrent(href: string): boolean {
    return page.url.pathname === href;
  }

  // Hydration marker for E2E tests. Children mount before parents in
  // Svelte, so by the time the root layout's $effect fires every
  // SongRow / ListenChooser / form on the page has its onclick
  // handlers bound. Tests wait for `body[data-hydrated="true"]` via
  // the `awaitHydrated` helper instead of `waitForLoadState(
  // 'networkidle')`, which Playwright marks as discouraged.
  $effect(() => {
    document.body.setAttribute('data-hydrated', 'true');
    return () => document.body.removeAttribute('data-hydrated');
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{@render children()}

{#if showMenu}
<!-- The ☰ chip is unchanged: pinned at the right edge of the content
     area, vertically centered on the cap row (see the band comment in
     git history). Only what it opens changed — a dropdown became the
     slide-out drawer below. -->
<div class="pointer-events-none fixed inset-x-0 top-6 z-50 sm:top-10">
  <div class="mx-auto flex max-w-2xl justify-end px-5 sm:px-6">
    <button
      bind:this={menuButtonEl}
      type="button"
      onclick={toggleMenu}
      aria-label={menuOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={menuOpen}
      class="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-paper text-ink shadow-sm hover:text-accent [&_svg]:pointer-events-none"
    >
      {#if menuOpen}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 2 L12 12 M12 2 L2 12" />
        </svg>
      {:else}
        <svg
          width="16"
          height="14"
          viewBox="0 0 16 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 3 H14 M2 11 H14" />
        </svg>
      {/if}
    </button>
  </div>
</div>

{#if menuOpen}
  <!-- Scrim: click closes. Above the page and the ☰ band, below the
       drawer. -->
  <div
    class="fixed inset-0 z-[60] bg-ink/30"
    transition:fade={{ duration: motionMs(200) }}
    onclick={closeMenu}
    aria-hidden="true"
  ></div>

  <!-- The drawer. 84% width on phones (a sliver of page stays visible
       as the way back), fixed 280px from sm up. Conditional render +
       fly keeps the a11y tree identical to the old dropdown: links
       exist only while open. -->
  <div
    bind:this={drawerEl}
    role="dialog"
    aria-modal="true"
    aria-label="Site menu"
    tabindex="-1"
    onkeydown={trapFocus}
    transition:fly={{ x: 320, duration: motionMs(240), opacity: 1 }}
    class="fixed bottom-0 right-0 top-0 z-[70] flex w-[84vw] flex-col overflow-y-auto border-l border-rule bg-paper shadow-xl sm:w-[280px]"
  >
    <!-- Header carries only the close affordance; identity lives at
         the bottom next to Sign out (same concern), where a two-line
         layout gives the email room to show in full. -->
    <div class="flex items-center justify-end px-3 pb-2 pt-3">
      <button
        type="button"
        onclick={closeMenu}
        aria-label="Close menu"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rule text-ink-muted hover:text-accent"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 2 L12 12 M12 2 L2 12" />
        </svg>
      </button>
    </div>
    <hr class="border-rule" />

    {#if data.user}
      {#if data.viewerHandle && data.viewerMixtapes.length > 0}
        <nav aria-label="My mixtapes">
          <p class="px-3 pt-2 text-xs uppercase tracking-wider text-ink-muted">My mixtapes</p>
          {#each data.viewerMixtapes as m (m.slug ?? '')}
            {@const href = m.slug ? `/${data.viewerHandle}/${m.slug}` : `/${data.viewerHandle}`}
            <a
              {href}
              onclick={closeMenu}
              aria-current={isCurrent(href) ? 'page' : undefined}
              class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent {isCurrent(href)
                ? 'border-l-2 border-accent bg-rule/40 pl-[10px]'
                : ''}"
            >
              {m.name ?? `${data.viewerDisplayName ?? data.viewerHandle}'s mixtape`}
            </a>
          {/each}
        </nav>
      {/if}
      {#if data.viewerGroups.length > 0}
        <nav aria-label="My groups">
          <p class="px-3 pt-2 text-xs uppercase tracking-wider text-ink-muted">My groups</p>
          {#each data.viewerGroups as g (g.slug)}
            <a
              href="/g/{g.slug}"
              onclick={closeMenu}
              aria-current={isCurrent(`/g/${g.slug}`) ? 'page' : undefined}
              class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent {isCurrent(
                `/g/${g.slug}`
              )
                ? 'border-l-2 border-accent bg-rule/40 pl-[10px]'
                : ''}"
            >
              {g.name}
            </a>
          {/each}
        </nav>
      {/if}
      {#if isOwnerOfThisMixtape}
        <hr class="mt-2 border-rule" />
        <p class="px-3 pt-2 text-xs uppercase tracking-wider text-ink-muted">
          Manage this mixtape
        </p>
        <a
          href="{mixtapeBase}/_edit"
          onclick={closeMenu}
          class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
        >
          Edit mixtape <span class="text-ink-muted">· songs &amp; stories</span>
        </a>
        <a
          href="{mixtapeBase}?qr=1"
          onclick={closeMenu}
          class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
        >
          QR code
        </a>
      {/if}
      {#if isMixtapeView}
        <!-- "Listen with" lives next to the page-specific items even
             though it's available to visitors and owners alike — the
             whole point is letting any reader change the per-song
             Listen routing without leaving the page. -->
        <a
          href="{mixtapeBase}?listen=set"
          onclick={closeMenu}
          class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
        >
          Listen with…
        </a>
      {/if}
      {#if data.isAdmin}
        <button
          type="button"
          onclick={() => (adminMenuOpen = !adminMenuOpen)}
          aria-expanded={adminMenuOpen}
          aria-controls="admin-submenu"
          class="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink hover:bg-rule hover:text-accent"
        >
          <span>Admin</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="transition-transform {adminMenuOpen ? 'rotate-90' : ''}"
            aria-hidden="true"
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
        </button>
        <div id="admin-submenu" role="group" aria-label="Admin menu" hidden={!adminMenuOpen}>
          <a
            href="/admin/mixtapes"
            onclick={closeMenu}
            class="block py-1.5 pl-6 pr-3 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Mixtapes
          </a>
          <a
            href="/admin/groups"
            onclick={closeMenu}
            class="block py-1.5 pl-6 pr-3 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Groups
          </a>
          <a
            href="/admin/queue"
            onclick={closeMenu}
            class="block py-1.5 pl-6 pr-3 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Resolve queue
          </a>
        </div>
      {/if}
      <!-- Identity + Sign out anchor to the bottom — the one place
           they can't be buried mid-list. break-all so even a long
           email wraps in full instead of clipping. -->
      <div class="mt-auto border-t border-rule">
        <p class="px-3 pt-3 text-xs text-ink-muted">Signed in as</p>
        <p class="break-all px-3 text-xs text-ink">{data.user.email}</p>
        <form method="POST" action="/logout">
          <button
            type="submit"
            class="block w-full px-3 py-3 text-left text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    {:else}
      <a
        href="/login"
        onclick={closeMenu}
        class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
      >
        Sign in
      </a>
    {/if}
  </div>
{/if}
{/if}
