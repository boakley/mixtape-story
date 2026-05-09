<script lang="ts">
  import type { SeedSong } from '$lib/seed/parse';

  type Props = { song: SeedSong; view: 'expanded' | 'compact' };
  let { song, view }: Props = $props();

  let expandedInCompact = $state(false);
  const expanded = $derived(view === 'expanded' || expandedInCompact);
</script>

<article
  class="grid grid-cols-[3rem_1rem_minmax(0,1fr)] gap-x-3 {view === 'compact'
    ? 'py-1'
    : 'py-4 sm:py-5'}"
>
  <div
    class="text-right tabular-nums text-ink-muted {view === 'compact'
      ? 'pt-[0.1875rem] text-xs'
      : 'pt-0.5 text-sm'}"
  >
    {song.year ?? ''}
  </div>

  <div class="relative" aria-hidden="true">
    <span
      class="absolute left-1/2 w-px -translate-x-1/2 bg-rule {view === 'compact'
        ? '-top-1 -bottom-1'
        : '-top-4 -bottom-4 sm:-top-5 sm:-bottom-5'}"
    ></span>
    <span
      class="absolute left-1/2 -translate-x-1/2 rounded-full bg-accent ring-2 ring-paper {view ===
      'compact'
        ? 'top-[0.3125rem] h-1.5 w-1.5'
        : 'top-[0.4375rem] h-2.5 w-2.5'}"
    ></span>
  </div>

  <div class="min-w-0">
    <div class="flex items-baseline justify-between gap-3">
      {#if view === 'compact'}
        <button
          type="button"
          onclick={() => (expandedInCompact = !expandedInCompact)}
          aria-expanded={expanded}
          class="group flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span class="min-w-0 flex-1 truncate text-base leading-snug">
            <span class="text-ink group-hover:text-accent">{song.title}</span>
            {#if song.artist}
              <span class="text-ink-muted"> · {song.artist}</span>
            {/if}
          </span>
          <span
            class="shrink-0 text-sm leading-none text-ink-muted transition-transform group-hover:text-accent {expanded
              ? 'rotate-90'
              : ''}"
            aria-hidden="true">›</span>
        </button>
      {:else}
        <h2 class="min-w-0 flex-1 text-xl leading-tight text-ink sm:text-2xl">
          {song.title}
        </h2>
      {/if}

      {#if song.link}
        <a
          href={song.link}
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
        >
          → Listen
        </a>
      {/if}
    </div>

    {#if expanded}
      {#if view === 'expanded'}
        <p class="mt-1 text-sm text-ink-muted">
          {#if song.artist}{song.artist}{/if}
          {#if song.artist && song.album} · {/if}
          {#if song.album}{song.album}{/if}
        </p>
      {:else if song.album}
        <p class="mt-1 text-xs text-ink-muted">{song.album}</p>
      {/if}
      <div
        class="mt-3 max-w-prose whitespace-pre-line text-base leading-relaxed text-ink {view ===
        'compact'
          ? 'pb-2'
          : ''}"
      >
        {song.story}
      </div>
    {/if}
  </div>
</article>
