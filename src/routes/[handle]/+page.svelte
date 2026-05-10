<script lang="ts">
  import SongStoryCard from '$lib/components/poc/SongStoryCard.svelte';
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
    const years = data.songs.map((s) => s.year).filter((y): y is number => y !== null);
    if (years.length === 0) return null;
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? `${min}` : `${min} — ${max}`;
  });

  const ogDescription = $derived.by(() => {
    const titles = data.songs.map((s) => s.title);
    const shown = titles.slice(0, 4).join(' · ');
    const rest = titles.length - 4;
    return rest > 0 ? `${shown} · +${rest} more` : shown;
  });
</script>

<svelte:head>
  <title>{data.displayName}'s mixtape — mixtapestory.com</title>
  <meta name="description" content={ogDescription} />
  <meta property="og:title" content="{data.displayName}'s mixtape" />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://mixtapestory.com/{data.handle}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="{data.displayName}'s mixtape" />
  <meta name="twitter:description" content={ogDescription} />
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
  </header>

  {#if data.songs.length === 0}
    <p class="text-ink-muted">No songs yet.</p>
  {:else}
    {#each data.songs as song (song.position)}
      <SongStoryCard {song} {view} />
    {/each}
  {/if}

  <footer class="mt-10 pt-6 text-xs text-ink-muted">
    <p>mixtapestory.com — in private testing.</p>
  </footer>
</main>
