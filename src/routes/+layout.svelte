<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import '../app.css';
  import type { LayoutData } from './$types';

  type Props = { data: LayoutData; children: Snippet };
  let { data, children }: Props = $props();

  let menuOpen = $state(false);
  let adminMenuOpen = $state(false);
  let navEl: HTMLElement | undefined = $state();

  // Pages where the hamburger has nothing useful to offer.
  const HIDE_MENU_ON = new Set(['/login']);
  const showMenu = $derived(!HIDE_MENU_ON.has(page.url.pathname));

  // When the viewer is on their own /{handle} mixtape page, the ☰ menu
  // gains a "Manage this mixtape" section with Edit + QR (Listen-with
  // and Visitor-count come in later steps). Detect via the SvelteKit
  // route id so we don't have to guess from the pathname.
  const isMixtapeView = $derived(page.route.id === '/[handle]');
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

  function handleBodyClick(e: MouseEvent) {
    if (!menuOpen) return;
    if (navEl && !navEl.contains(e.target as Node)) closeMenu();
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:body onclick={handleBodyClick} />

{@render children()}

{#if showMenu}
<!-- Position the ☰ at the right edge of the page-content area (where
     → Listen sits on song rows), not the viewport edge, AND vertically
     centered on every page's cap row content. Every <main> uses
     py-8 sm:py-12; the cap row sits at the top of <main>. Pin the
     band to top-6 sm:top-10 so the h-9 (36px) ☰ button's vertical
     center lands on the cap row's text baseline.

     pointer-events-none on the outer band lets clicks pass through to
     content; pointer-events-auto on the nav re-enables interactivity
     for the button + dropdown. -->
<div class="pointer-events-none fixed inset-x-0 top-6 z-50 sm:top-10">
  <div class="mx-auto flex max-w-2xl justify-end px-5 sm:px-6">
<nav bind:this={navEl} class="pointer-events-auto relative">
  <button
    type="button"
    onclick={toggleMenu}
    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
    aria-expanded={menuOpen}
    class="flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-paper text-ink shadow-sm hover:text-accent [&_svg]:pointer-events-none"
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

  {#if menuOpen}
    <div
      class="absolute right-0 top-11 w-56 overflow-hidden rounded-md border border-rule bg-paper py-1 shadow-md"
    >
      {#if data.user}
        <p class="truncate px-3 py-2 text-xs text-ink-muted">
          Signed in as <span class="text-ink">{data.user.email}</span>
        </p>
        <hr class="border-rule" />
        {#if data.viewerHandle}
          <a
            href="/{data.viewerHandle}"
            onclick={closeMenu}
            class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            My mixtape
          </a>
        {/if}
        {#if isOwnerOfThisMixtape}
          <hr class="border-rule" />
          <p class="px-3 pt-2 text-xs uppercase tracking-wider text-ink-muted">
            Manage this mixtape
          </p>
          <a
            href="/{page.params.handle}/edit"
            onclick={closeMenu}
            class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Edit mixtape <span class="text-ink-muted">· songs &amp; stories</span>
          </a>
          <a
            href="/{page.params.handle}?qr=1"
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
            href="/{page.params.handle}?listen=set"
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
          <div
            id="admin-submenu"
            role="group"
            aria-label="Admin menu"
            hidden={!adminMenuOpen}
          >
            <a
              href="/admin/mixtapes"
              onclick={closeMenu}
              class="block py-1.5 pl-6 pr-3 text-sm text-ink hover:bg-rule hover:text-accent"
            >
              Mixtapes
            </a>
            {#if data.features?.groups}
              <a
                href="/admin/groups"
                onclick={closeMenu}
                class="block py-1.5 pl-6 pr-3 text-sm text-ink hover:bg-rule hover:text-accent"
              >
                Groups
              </a>
            {/if}
            <a
              href="/admin/queue"
              onclick={closeMenu}
              class="block py-1.5 pl-6 pr-3 text-sm text-ink hover:bg-rule hover:text-accent"
            >
              Resolve queue
            </a>
          </div>
        {/if}
        <hr class="border-rule" />
        <form method="POST" action="/logout">
          <button
            type="submit"
            class="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Sign out
          </button>
        </form>
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
</nav>
  </div>
</div>
{/if}
