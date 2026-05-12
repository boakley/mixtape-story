<script lang="ts">
  import SongRow from '$lib/components/SongRow.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };
  let { data }: Props = $props();

  type View = 'expanded' | 'compact';
  const STORAGE_KEY = 'mixtapestory:view';

  let view = $state<View>('compact');

  $effect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'compact' || saved === 'expanded') view = saved;
  });

  function setView(next: View) {
    view = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be disabled — non-fatal */
    }
  }

  const yearRange = $derived.by(() => {
    const years = data.songs
      .map((s) => s.memoryYear)
      .filter((y): y is number => y !== null);
    if (years.length === 0) return null;
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? `${min}` : `${min} — ${max}`;
  });

  // The og:description shown beneath the unfurl title. Mirrors the OG image
  // composition ("the company we're in" — see design memo): deduped artist
  // names in mixtape order, not song titles. Song titles would close the
  // loop before the recipient clicks.
  const ogDescription = $derived.by(() => {
    const seen = new Set<string>();
    const artists: string[] = [];
    for (const s of data.songs) {
      const a = s.artist?.trim();
      if (!a) continue;
      const key = a.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      artists.push(a);
    }
    if (artists.length === 0) return 'A mixtape, waiting to begin';
    const shown = artists.slice(0, 4).join(' · ');
    const rest = artists.length - 4;
    return rest > 0 ? `${shown} · +${rest} more` : shown;
  });

  const isOwner = $derived(data.user?.id && data.session && data.handle === data.viewerHandle);
</script>

<svelte:head>
  <title>{data.displayName}'s mixtape — mixtapestory.com</title>
  <meta name="description" content={ogDescription} />
  <meta property="og:title" content="{data.displayName}'s mixtape" />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://mixtapestory.com/{data.handle}" />
  <!-- og:image points directly at the Storage URL where the render-og Edge
       Function writes the pre-rendered PNG. Direct (not via our /og/{handle}
       SvelteKit endpoint) because some social-platform preview engines don't
       follow redirects, and Storage already returns the right Content-Type
       and cache headers. -->
  <meta
    property="og:image"
    content="https://kudxongbgeaylfpcmick.supabase.co/storage/v1/object/public/og-images/{data.handle}.png"
  />
  <meta property="og:image:width" content="1080" />
  <meta property="og:image:height" content="1080" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{data.displayName}'s mixtape" />
  <meta name="twitter:description" content={ogDescription} />
  <meta
    name="twitter:image"
    content="https://kudxongbgeaylfpcmick.supabase.co/storage/v1/object/public/og-images/{data.handle}.png"
  />
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <p class="text-xs uppercase tracking-wider text-ink-muted">
      <a href="/" class="hover:text-accent">mixtapestory.com</a>
    </p>
    <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">
      {data.displayName}'s mixtape
    </h1>

    <div class="mt-2 flex items-center justify-between gap-4">
      <p class="text-sm text-ink-muted">
        {data.songs.length} songs{yearRange ? ` · ${yearRange}` : ''}
      </p>

      <div class="inline-flex rounded-full border border-rule p-0.5 text-xs">
        <button
          type="button"
          onclick={() => setView('expanded')}
          aria-pressed={view === 'expanded'}
          class="rounded-full px-3 py-1 transition-colors {view === 'expanded'
            ? 'bg-ink text-paper'
            : 'text-ink-muted hover:text-ink'}"
        >
          Expanded
        </button>
        <button
          type="button"
          onclick={() => setView('compact')}
          aria-pressed={view === 'compact'}
          class="rounded-full px-3 py-1 transition-colors {view === 'compact'
            ? 'bg-ink text-paper'
            : 'text-ink-muted hover:text-ink'}"
        >
          Compact
        </button>
      </div>
    </div>

    {#if isOwner}
      <p class="mt-3 text-sm">
        <a
          href="/{data.handle}/edit"
          class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
        >
          Edit mixtape
        </a>
      </p>
    {/if}
  </header>

  {#if data.songs.length === 0}
    <p class="text-ink-muted">No songs yet.</p>
  {:else}
    {#each data.songs as song (song.id)}
      <SongRow {song} {view} />
    {/each}
  {/if}

  <footer class="mt-10 pt-6 text-xs text-ink-muted">
    <p>mixtapestory.com — in private testing.</p>
  </footer>
</main>

<style>
  :global(.story p) {
    margin: 0.75em 0;
  }
  :global(.story p:first-child) {
    margin-top: 0;
  }
  :global(.story p:last-child) {
    margin-bottom: 0;
  }
  :global(.story a) {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  :global(.story strong) {
    color: var(--color-ink);
    font-weight: 600;
  }
  :global(.story em) {
    font-style: italic;
  }
  :global(.story ul),
  :global(.story ol) {
    margin: 0.75em 0;
    padding-left: 1.5em;
  }
  :global(.story ul) {
    list-style: disc;
  }
  :global(.story ol) {
    list-style: decimal;
  }
  :global(.story blockquote) {
    margin: 0.75em 0;
    padding-left: 1em;
    border-left: 2px solid var(--color-rule);
    color: var(--color-ink-muted);
  }
</style>
