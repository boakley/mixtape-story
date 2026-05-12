<script lang="ts">
  import PreviewButton from './PreviewButton.svelte';
  import type { DisplaySong } from '$lib/types';

  type Props = { song: DisplaySong; view: 'expanded' | 'compact' };
  let { song, view }: Props = $props();

  let expandedInCompact = $state(false);
  const expanded = $derived(view === 'expanded' || expandedInCompact);

  const listenTooltip = $derived.by(() => {
    switch (song.linkStatus) {
      case 'pending':
        return 'Universal link is being generated. Usually ready within a few minutes.';
      case 'failed':
        return "Couldn't generate a universal link for this song.";
      case 'manual':
        return 'No streaming link for this song.';
      default:
        return '';
    }
  });

  const listenEnabled = $derived(song.linkStatus === 'done' && !!song.songlinkUrl);
  // While the universal link isn't ready, the 30s preview is the listen surface.
  const showPreviewInstead = $derived(!listenEnabled && !!song.previewUrl);
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
    {song.memoryYear ?? ''}
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
        <h2 class="min-w-0 flex-1 text-base font-normal leading-snug">
        <button
          type="button"
          onclick={() => (expandedInCompact = !expandedInCompact)}
          aria-expanded={expanded}
          title={expanded ? 'Hide story' : 'Show story'}
          class="group flex w-full items-start gap-2 text-left"
        >
          <span class="min-w-0 flex-1 leading-snug">
            <!-- Mobile (compact): title on its own line, artist on a second
                 smaller line. Frees up the cramped horizontal space.
                 Desktop: title and artist join inline on one row. -->
            <span class="block truncate text-base sm:inline">
              <span class="text-ink group-hover:text-accent">{song.title}</span>
              {#if song.artist}
                <span class="hidden text-ink-muted sm:inline"> · {song.artist}</span>
              {/if}
            </span>
            {#if song.artist}
              <span class="block truncate text-sm text-ink-muted sm:hidden">{song.artist}</span>
            {/if}
          </span>
          <span
            class="shrink-0 pt-1 text-ink-muted transition-transform group-hover:text-accent {expanded
              ? 'rotate-90'
              : ''}"
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 2 10 7 4 12" />
            </svg>
          </span>
        </button>
        </h2>
      {:else}
        <h2 class="min-w-0 flex-1 text-xl leading-tight text-ink sm:text-2xl">
          {song.title}
        </h2>
      {/if}

      {#if listenEnabled}
        <a
          href={song.songlinkUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
        >
          → Listen
        </a>
      {:else if showPreviewInstead && song.previewUrl}
        <PreviewButton url={song.previewUrl} />
      {:else}
        <span
          title={listenTooltip}
          aria-disabled="true"
          class="shrink-0 cursor-not-allowed text-sm text-ink-muted"
        >
          → Listen
        </span>
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
      {#if song.storyHtml}
        <!-- marked output: raw HTML disabled at parse time; safe to inject. -->
        <div
          class="story prose-story mt-3 max-w-prose text-base leading-relaxed text-ink {view ===
          'compact'
            ? 'pb-2'
            : ''}"
        >
          {@html song.storyHtml}
        </div>
      {/if}
    {/if}
  </div>
</article>
