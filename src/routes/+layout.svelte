<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import '../app.css';
  import type { LayoutData } from './$types';

  type Props = { data: LayoutData; children: Snippet };
  let { data, children }: Props = $props();

  let menuOpen = $state(false);
  let navEl: HTMLElement | undefined = $state();

  // Pages where the hamburger has nothing useful to offer.
  const HIDE_MENU_ON = new Set(['/login']);
  const showMenu = $derived(!HIDE_MENU_ON.has(page.url.pathname));

  function closeMenu() {
    menuOpen = false;
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
<nav bind:this={navEl} class="fixed top-3 right-3 z-50">
  <button
    type="button"
    onclick={() => (menuOpen = !menuOpen)}
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
        {#if data.isAdmin}
          <a
            href="/admin/mixtapes"
            onclick={closeMenu}
            class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Mixtapes
          </a>
          <a
            href="/admin/queue"
            onclick={closeMenu}
            class="block px-3 py-2 text-sm text-ink hover:bg-rule hover:text-accent"
          >
            Resolve queue
          </a>
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
{/if}
