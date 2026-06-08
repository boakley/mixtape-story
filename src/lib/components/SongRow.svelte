<script lang="ts">
  import PreviewButton from './PreviewButton.svelte';
  import { listenHref, type ListenPref } from '$lib/listen';
  import type { DisplaySong } from '$lib/types';

  // SongRow per docs/implementation-notes.md §2:
  //
  // - Chevron + teaser appear only when the song has a non-empty story.
  //   A row without a story isn't an expand target — it renders as a
  //   plain title+artist+Listen line with the chevron column preserved
  //   (but invisible) so titles still align across rows.
  // - Compact + has-story + collapsed: one-line CSS-truncated teaser
  //   under the title, derived client-side from the first non-empty
  //   line of storyText. No schema change.
  // - Compact + has-story + open OR view=expanded: full story body
  //   with a left accent rule (border-l-2 border-accent).
  // - `→ Listen` keeps the right-aligned column in every state and
  //   stopPropagation's its own click so tapping it never toggles the
  //   row.
  // - Action-arrow convention (docs/design-language.md): underline the
  //   label only; the leading `→` glyph stays unstyled.

  type Props = { song: DisplaySong; view: 'expanded' | 'compact'; listenPref: ListenPref | null };
  let { song, view, listenPref }: Props = $props();

  let expandedInCompact = $state(false);

  const hasStory = $derived(song.storyText.trim().length > 0);
  // Story body visible when there is one AND we're in some open state.
  const showStory = $derived(hasStory && (view === 'expanded' || expandedInCompact));
  // Teaser only in compact mode, only when collapsed, only when there's
  // something to tease.
  const showTeaser = $derived(hasStory && view === 'compact' && !expandedInCompact);
  // ARIA expanded reflects "is the story panel visible." In view=expanded
  // it's always true; in compact it tracks the per-row toggle.
  const isExpanded = $derived(view === 'expanded' || expandedInCompact);

  // First non-empty line of the story for the teaser. CSS truncate clips
  // visually, but stripping subsequent lines avoids browsers rendering
  // hidden newlines weirdly inside a flex baseline.
  const teaserText = $derived(
    song.storyText.split('\n').find((l) => l.trim().length > 0) ?? ''
  );

  const storyId = $derived(`song-story-${song.id}`);

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

  const listenUrl = $derived(listenHref(song, listenPref));
  const showPreviewInstead = $derived(!listenUrl && !!song.previewUrl);

  function stopProp(e: MouseEvent): void {
    e.stopPropagation();
  }
</script>

<article class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 py-3">
  <!-- Rail + solid accent dot. Rail extension matches py-3 so adjacent
       rows merge into one spine. -->
  <div class="relative" aria-hidden="true">
    <span class="absolute -bottom-3 -top-3 left-1/2 w-px -translate-x-1/2 bg-rule"></span>
    <span
      class="absolute left-1/2 top-[0.875rem] h-2 w-2 -translate-x-1/2 rounded-full bg-accent ring-2 ring-paper"
    ></span>
  </div>

  <div class="min-w-0">
    <!-- Title row: chevron + title/artist (button when expandable, div
         when not) + right-aligned Listen. Listen is a sibling of the
         button so we never nest interactive elements. -->
    <div class="flex items-baseline gap-3">
      {#if hasStory}
        <button
          type="button"
          onclick={() => (expandedInCompact = !expandedInCompact)}
          aria-expanded={isExpanded}
          aria-controls={storyId}
          class="group flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span
            class="inline-flex w-3 shrink-0 justify-center text-ink-muted transition-transform {isExpanded
              ? 'rotate-90 text-accent'
              : ''}"
            aria-hidden="true"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="4 2 10 7 4 12" />
            </svg>
          </span>
          <span class="min-w-0 flex-1 leading-snug">
            <span class="block truncate text-base">
              <span class="text-ink group-hover:text-accent">{song.title}</span>
              {#if song.artist}
                <span class="hidden text-ink-muted sm:inline"> · {song.artist}</span>
              {/if}
            </span>
            {#if song.artist}
              <span class="block truncate text-sm text-ink-muted sm:hidden">{song.artist}</span>
            {/if}
          </span>
        </button>
      {:else}
        <!-- Non-expandable: chevron column preserved (invisible) so the
             title still aligns with expandable rows above and below. -->
        <div class="flex min-w-0 flex-1 items-baseline gap-2">
          <span class="invisible inline-flex w-3 shrink-0 justify-center" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 2 10 7 4 12" />
            </svg>
          </span>
          <span class="min-w-0 flex-1 leading-snug">
            <span class="block truncate text-base">
              <span class="text-ink">{song.title}</span>
              {#if song.artist}
                <span class="hidden text-ink-muted sm:inline"> · {song.artist}</span>
              {/if}
            </span>
            {#if song.artist}
              <span class="block truncate text-sm text-ink-muted sm:hidden">{song.artist}</span>
            {/if}
          </span>
        </div>
      {/if}

      <!-- Listen sits right-aligned in every state. The `→` glyph is
           aria-hidden and unstyled; only the label is underlined. -->
      {#if listenUrl}
        <a
          href={listenUrl}
          onclick={stopProp}
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm text-ink hover:text-accent"
        >
          <span aria-hidden="true">→ </span><span
            class="underline decoration-accent decoration-2 underline-offset-4">Listen</span>
        </a>
      {:else if showPreviewInstead && song.previewUrl}
        <PreviewButton url={song.previewUrl} />
      {:else}
        <span
          title={listenTooltip}
          aria-disabled="true"
          class="shrink-0 cursor-not-allowed text-sm text-ink-muted"
        >
          <span aria-hidden="true">→ </span><span
            class="underline decoration-rule decoration-2 underline-offset-4">Listen</span>
        </span>
      {/if}
    </div>

    <!-- Compact + collapsed: one-line teaser under the title, indented
         to align with title text (past the chevron column + gap). -->
    {#if showTeaser}
      <p class="mt-1 truncate pl-5 text-sm text-ink-muted">{teaserText}</p>
    {/if}

    <!-- Story body. Left accent rule with comfortable reading width.
         Indented to align with title text. -->
    {#if showStory}
      <div
        id={storyId}
        class="prose-story mt-3 ml-5 max-w-prose border-l-2 border-accent pl-3 text-base leading-relaxed text-ink"
      >
        {#if song.memoryYear}
          <p class="text-sm italic text-ink-muted">
            This song reminds me of {song.memoryYear}.
          </p>
        {/if}
        <!-- marked output: raw HTML disabled at parse time; safe to inject. -->
        {@html song.storyHtml}
      </div>
    {/if}
  </div>
</article>
