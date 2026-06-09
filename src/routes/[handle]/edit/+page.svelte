<script lang="ts">
  import { enhance, deserialize, applyAction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import PreviewButton from '$lib/components/PreviewButton.svelte';
  import HelpTip from '$lib/components/HelpTip.svelte';
  import type { ActionResult } from '@sveltejs/kit';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();

  // Top-input mode: 'list' (default) or 'search'. URL paste and manual entry
  // are reachable as inline fall-throughs inside the Search panel.
  let mode = $state<'list' | 'search'>('list');

  // Per-row UI state in the song list below.
  let openStoryFor = $state<string | null>(null);
  let openMetaFor = $state<string | null>(null);
  let confirmingDelete = $state<string | null>(null);

  // Local working copy of the currently-open story so we can show a live
  // character counter and enforce the 10k cap matching the DB constraint.
  let storyDraft = $state('');
  const STORY_MAX = 10_000;
  function toggleStory(song: { id: string; story_text: string }) {
    if (openStoryFor === song.id) {
      openStoryFor = null;
    } else {
      openStoryFor = song.id;
      storyDraft = song.story_text;
    }
  }

  // Local copy of the song list so drag-and-drop can re-order optimistically
  // before the server confirms.
  let songs = $derived(data.songs);
  let songOrder = $state<typeof data.songs>([]);
  $effect(() => {
    songOrder = songs;
  });

  function handleDndConsider(e: CustomEvent<DndEvent<(typeof data.songs)[number]>>) {
    songOrder = e.detail.items;
  }
  async function handleDndFinalize(e: CustomEvent<DndEvent<(typeof data.songs)[number]>>) {
    songOrder = e.detail.items;
    const ids = songOrder.map((s) => s.id);
    const fd = new FormData();
    fd.set('ids', JSON.stringify(ids));
    await fetch('?/reorder', { method: 'POST', body: fd });
    await invalidateAll();
  }

  type PreviewTrack = {
    title: string;
    artist: string | null;
    album: string | null;
    releaseYear: number | null;
    albumArtUrl: string | null;
    previewUrl: string | null;
    sourceUrl: string;
    normalizedSourceUrl: string;
    duplicate?: boolean;
    query?: string;
    raw?: string;
    note?: string | null;
    error?: string | null;
    unmatched?: boolean;
  };

  type Alternate = Omit<PreviewTrack, 'duplicate' | 'query' | 'raw' | 'note' | 'error' | 'unmatched'>;

  // Live search (Search tab).
  type SearchResult = {
    title: string;
    artist: string | null;
    album: string | null;
    releaseYear: number | null;
    isrc: string | null;
    albumArtUrl: string | null;
    previewUrl: string | null;
    sourceUrl: string;
    normalizedSourceUrl: string;
  };
  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);
  let searchAdding = $state<string | null>(null); // sourceUrl of the row being added
  let showFallbackUrl = $state(false);
  let showFallbackManual = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const q = searchQuery.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (q.length < 2) {
      searchResults = [];
      searchLoading = false;
      searchError = null;
      return;
    }
    debounceTimer = setTimeout(async () => {
      searchLoading = true;
      searchError = null;
      try {
        const res = await fetch(`/api/itunes-search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          searchError = `Search failed (${res.status})`;
          searchResults = [];
        } else {
          const data = (await res.json()) as { results: SearchResult[] };
          searchResults = data.results;
        }
      } catch (err) {
        searchError = (err as Error).message;
      } finally {
        searchLoading = false;
      }
    }, 250);
  });

  async function addTrack(track: SearchResult) {
    searchAdding = track.sourceUrl;
    try {
      const fd = new FormData();
      fd.set('track', JSON.stringify(track));
      const res = await fetch('?/add_track', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as ActionResult<{ ok?: boolean }, { error?: string }>;
      if (result.type === 'success') {
        await invalidateAll();
        // Stay in the picker; clear the query so the user can search the next one.
        searchQuery = '';
        searchResults = [];
      } else if (result.type === 'failure') {
        searchError = result.data?.error ?? 'Could not add that song.';
      } else {
        await applyAction(result);
      }
    } catch (err) {
      searchError = (err as Error).message;
    } finally {
      searchAdding = null;
    }
  }

  const preview = $derived<{ tracks: PreviewTrack[] } | null>(
    form && 'preview' in form && form.preview
      ? (form.preview as { tracks: PreviewTrack[] })
      : null
  );

  // Per-row state for the preview screen, keyed by row index.
  let selected = $state<Record<number, boolean>>({});
  let swap = $state<Record<number, Alternate>>({});
  let alternates = $state<Record<number, Alternate[]>>({});
  let altsLoading = $state<number | null>(null);
  let altsError = $state<string | null>(null);

  $effect(() => {
    if (!preview) return;
    const initial: Record<number, boolean> = {};
    for (let i = 0; i < preview.tracks.length; i++) {
      initial[i] = !preview.tracks[i]!.unmatched; // unmatched rows default to unchecked
    }
    selected = initial;
    swap = {};
    alternates = {};
    altsLoading = null;
    altsError = null;
  });

  function rowFor(i: number): PreviewTrack {
    const original = preview!.tracks[i]!;
    const s = swap[i];
    if (!s) return original;
    return { ...original, ...s, unmatched: false, error: null };
  }

  const importPayload = $derived(
    preview
      ? JSON.stringify(
          preview.tracks
            .map((_, i) => (selected[i] ? rowFor(i) : null))
            .filter((t): t is PreviewTrack => t !== null)
            .map((t) => ({
              title: t.title,
              artist: t.artist,
              album: t.album,
              releaseYear: t.releaseYear,
              albumArtUrl: t.albumArtUrl,
              previewUrl: t.previewUrl,
              sourceUrl: t.sourceUrl,
              normalizedSourceUrl: t.normalizedSourceUrl
            }))
        )
      : '[]'
  );

  const checkedCount = $derived(
    preview ? Object.values(selected).filter(Boolean).length : 0
  );

  async function loadAlternates(i: number, query: string) {
    altsLoading = i;
    altsError = null;
    try {
      const fd = new FormData();
      fd.set('query', query);
      const res = await fetch('?/search_alternates', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as ActionResult<{ alternates?: { tracks: Alternate[] } }>;
      if (result.type === 'success') {
        const list = result.data?.alternates?.tracks ?? [];
        alternates = { ...alternates, [i]: list };
      } else if (result.type === 'failure') {
        altsError = (result.data?.error as string) ?? 'Could not load alternates.';
      } else {
        altsError = 'Could not load alternates.';
      }
    } catch (err) {
      altsError = (err as Error).message;
    } finally {
      altsLoading = null;
    }
  }

  function chooseAlternate(i: number, alt: Alternate) {
    swap = { ...swap, [i]: alt };
    selected = { ...selected, [i]: true };
    alternates = { ...alternates, [i]: [] }; // close picker
  }

  function tooltip(status: string): string {
    switch (status) {
      case 'pending':
        return 'Universal link is being generated. Usually ready within a few minutes.';
      case 'failed':
        return "Couldn't generate a universal link for this song.";
      case 'manual':
        return 'No streaming link for this song.';
      default:
        return '';
    }
  }
</script>

<svelte:head>
  <title>{data.displayName}'s mixtape — edit</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <p class="text-xs uppercase tracking-wider text-ink-muted">
      <a href="/" class="hover:text-accent">mixtapestory.com</a>
    </p>
    <div class="mt-2 flex items-baseline justify-between gap-3">
      <h1 class="text-3xl leading-tight text-ink sm:text-4xl">
        {data.displayName}'s mixtape — edit
      </h1>
      <a
        href="/{data.handle}"
        class="shrink-0 text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
      >
        View public page
      </a>
    </div>
    <p class="mt-2 text-sm text-ink-muted">
      {data.songs.length} {data.songs.length === 1 ? 'song' : 'songs'}
    </p>
  </header>

  <!-- Top input area -->
  <section class="mb-8 rounded-lg border border-rule p-4">
    {#if preview}
      <p class="mb-3 text-sm text-ink">
        Found <strong>{preview.tracks.length}</strong>
        {preview.tracks.length === 1 ? 'song' : 'songs'}. Uncheck any you don't want, then import.
      </p>

      <ul class="mb-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {#each preview.tracks as orig, i}
          {@const row = rowFor(i)}
          {@const titleId = `preview-track-${i}-title`}
          <li class="rounded-md border border-rule p-2 text-sm">
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected[i] ?? false}
                disabled={!!row.unmatched && !swap[i]}
                aria-labelledby={titleId}
                onchange={(e) =>
                  (selected = {
                    ...selected,
                    [i]: (e.currentTarget as HTMLInputElement).checked
                  })}
                class="mt-1 shrink-0"
              />

              {#if row.albumArtUrl}
                <img
                  src={row.albumArtUrl}
                  alt=""
                  loading="lazy"
                  class="h-10 w-10 shrink-0 rounded border border-rule object-cover"
                />
              {:else}
                <div class="h-10 w-10 shrink-0 rounded border border-rule bg-rule"></div>
              {/if}

              <div class="min-w-0 flex-1">
                <p id={titleId} class="truncate">
                  <span class="text-ink">{row.title}</span>
                  {#if row.artist}
                    <span class="text-ink-muted"> · {row.artist}</span>
                  {/if}
                  {#if row.releaseYear}
                    <span class="text-ink-muted"> · {row.releaseYear}</span>
                  {/if}
                </p>
                {#if row.album && !row.unmatched}
                  <p class="truncate text-xs text-ink-muted">{row.album}</p>
                {/if}
                {#if orig.raw && orig.raw !== `${row.title}${row.artist ? ' ' + row.artist : ''}`}
                  <p class="truncate text-xs text-ink-muted">From: {orig.raw}</p>
                {/if}

                <div class="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  {#if row.unmatched}
                    <span class="text-accent">{orig.error ?? 'No match'}</span>
                  {/if}
                  {#if row.duplicate}
                    <span class="text-accent">already in your mixtape</span>
                  {/if}
                  {#if swap[i]}
                    <span class="text-ink-muted">swapped</span>
                  {/if}
                  {#if orig.query}
                    <button
                      type="button"
                      onclick={() => loadAlternates(i, orig.query!)}
                      disabled={altsLoading === i}
                      class="text-ink-muted underline hover:text-accent disabled:opacity-50"
                    >
                      {altsLoading === i ? 'Loading…' : alternates[i] ? 'Hide alternates' : 'Try a different match'}
                    </button>
                  {/if}
                </div>

                {#if alternates[i] && alternates[i].length > 0}
                  <ul class="mt-2 space-y-1 border-t border-rule pt-2">
                    {#each alternates[i] as alt}
                      <li>
                        <button
                          type="button"
                          onclick={() => chooseAlternate(i, alt)}
                          class="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs hover:bg-rule"
                        >
                          {#if alt.albumArtUrl}
                            <img src={alt.albumArtUrl} alt="" loading="lazy" class="h-8 w-8 shrink-0 rounded border border-rule object-cover" />
                          {/if}
                          <span class="min-w-0">
                            <span class="text-ink">{alt.title}</span>
                            {#if alt.artist}<span class="text-ink-muted"> · {alt.artist}</span>{/if}
                            {#if alt.album}<span class="block truncate text-ink-muted">{alt.album}{alt.releaseYear ? ` · ${alt.releaseYear}` : ''}</span>{/if}
                          </span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>

      {#if altsError}
        <p class="mb-2 text-xs text-accent">{altsError}</p>
      {/if}

      <form method="POST" action="?/import_playlist" use:enhance class="flex items-center gap-3">
        <input type="hidden" name="payload" value={importPayload} />
        <button
          type="submit"
          disabled={checkedCount === 0}
          class="rounded-md bg-accent px-4 py-2 text-sm text-paper hover:bg-ink disabled:cursor-not-allowed disabled:bg-ink-muted"
        >
          Import {checkedCount} {checkedCount === 1 ? 'song' : 'songs'}
        </button>
        <a href="/{data.handle}/edit" class="text-sm text-ink-muted underline hover:text-accent">
          Start over
        </a>
      </form>
    {:else}
      <!-- mode switcher -->
      <div class="mb-3 flex gap-1 text-xs">
        {#each [['list', 'Paste list'], ['search', 'Search']] as [m, label]}
          <button
            type="button"
            onclick={() => (mode = m as typeof mode)}
            class="rounded-md px-3 py-1 transition-colors {mode === m
              ? 'bg-ink text-paper'
              : 'text-ink-muted hover:text-ink'}"
          >
            {label}
          </button>
        {/each}
      </div>

      {#if mode === 'list'}
        <form method="POST" action="?/parse_list" use:enhance class="space-y-3">
          <span class="inline-flex items-center gap-1.5">
            <label class="text-xs uppercase tracking-wider text-ink-muted" for="list-input">
              Paste a list
            </label>
            <HelpTip label="Paste a list">
              Paste from a playlist, an email, or just type. We match each
              line to Apple Music; you'll review and confirm before any
              songs are added.
            </HelpTip>
          </span>
          <p id="list-help" class="text-sm text-ink-muted">
            One song per line, or one per quoted title. Each line is matched
            against the Apple Music catalog.
          </p>
          <textarea
            id="list-input"
            name="text"
            aria-describedby="list-help"
            rows="6"
            placeholder={'"Angel from Montgomery" John Prine\n"Wing" Patti Smith\n"When the Levee Breaks" Led Zeppelin'}
            class="w-full rounded-md border border-rule px-3 py-2 text-sm leading-relaxed"
          ></textarea>
          <button
            type="submit"
            class="rounded-md bg-accent px-4 py-2 text-sm text-paper hover:bg-ink"
          >
            Find songs
          </button>
        </form>
      {:else}
        <!-- Search picker -->
        <div class="space-y-3">
          <span class="inline-flex items-center gap-1.5">
            <label class="text-xs uppercase tracking-wider text-ink-muted" for="search-input">
              Search
            </label>
            <HelpTip label="Search">
              Searches the Apple Music catalog as you type. If nothing
              matches, the URL paste and Add manually options appear below.
            </HelpTip>
          </span>
          <p id="search-help" class="text-sm text-ink-muted">
            Type a song title and artist. Pick the right match from the list.
          </p>
          <input
            id="search-input"
            aria-describedby="search-help"
            type="search"
            bind:value={searchQuery}
            placeholder="fleetwood mac rhiannon"
            autocomplete="off"
            class="w-full rounded-md border border-rule px-3 py-2 text-sm"
          />

          {#if searchLoading}
            <p class="text-xs text-ink-muted">Searching…</p>
          {:else if searchError}
            <p class="text-xs text-accent">{searchError}</p>
          {:else if searchQuery.trim().length >= 2 && searchResults.length === 0}
            <p class="text-xs text-ink-muted">
              No match.
              {#if !showFallbackManual}
                <button
                  type="button"
                  onclick={() => (showFallbackManual = true)}
                  class="underline hover:text-accent"
                >
                  Add manually
                </button>
              {/if}
              instead.
            </p>
          {:else if searchResults.length > 0}
            <ul class="max-h-[24rem] space-y-1 overflow-y-auto rounded-md border border-rule p-1">
              {#each searchResults as track}
                <li>
                  <button
                    type="button"
                    onclick={() => addTrack(track)}
                    disabled={searchAdding === track.sourceUrl}
                    class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-rule disabled:opacity-50"
                  >
                    {#if track.albumArtUrl}
                      <img
                        src={track.albumArtUrl}
                        alt=""
                        loading="lazy"
                        class="h-10 w-10 shrink-0 rounded border border-rule object-cover"
                      />
                    {:else}
                      <div class="h-10 w-10 shrink-0 rounded border border-rule bg-rule"></div>
                    {/if}
                    <span class="min-w-0 flex-1">
                      <span class="block truncate">
                        <span class="text-ink">{track.title}</span>
                        {#if track.artist}<span class="text-ink-muted"> · {track.artist}</span>{/if}
                      </span>
                      {#if track.album}
                        <span class="block truncate text-xs text-ink-muted">
                          {track.album}{track.releaseYear ? ` · ${track.releaseYear}` : ''}
                        </span>
                      {/if}
                    </span>
                    {#if searchAdding === track.sourceUrl}
                      <span class="shrink-0 self-center text-xs text-ink-muted">Adding…</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          <!-- Inline fall-throughs -->
          <div class="flex flex-wrap gap-3 text-xs text-ink-muted">
            {#if !showFallbackUrl}
              <button
                type="button"
                onclick={() => (showFallbackUrl = true)}
                class="underline hover:text-accent"
              >
                Have a streaming URL?
              </button>
            {/if}
            {#if !showFallbackManual}
              <button
                type="button"
                onclick={() => (showFallbackManual = true)}
                class="underline hover:text-accent"
              >
                Add manually
              </button>
            {/if}
          </div>

          {#if showFallbackUrl}
            <form
              method="POST"
              action="?/resolve"
              use:enhance={() => async ({ update }) => {
                await update();
                showFallbackUrl = false;
              }}
              class="space-y-2 rounded-md border border-rule p-3"
            >
              <span class="inline-flex items-center gap-1.5">
                <label class="text-xs uppercase tracking-wider text-ink-muted" for="url-input">
                  Streaming URL
                </label>
                <HelpTip label="Streaming URL">
                  Songlink/Odesli resolves any service URL into a universal
                  link that opens in the listener's preferred app.
                </HelpTip>
              </span>
              <p id="url-help" class="text-xs text-ink-muted">
                Paste a Spotify, YouTube Music, or other streaming URL.
              </p>
              <div class="flex items-center gap-2">
                <input
                  id="url-input"
                  aria-describedby="url-help"
                  type="url"
                  name="url"
                  placeholder="https://..."
                  required
                  class="min-w-0 flex-1 rounded-md border border-rule px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  class="shrink-0 rounded-md bg-accent px-3 py-2 text-sm text-paper hover:bg-ink"
                >
                  Add
                </button>
                <button
                  type="button"
                  onclick={() => (showFallbackUrl = false)}
                  class="text-xs text-ink-muted underline"
                >
                  cancel
                </button>
              </div>
            </form>
          {/if}

          {#if showFallbackManual}
            <form
              method="POST"
              action="?/manual"
              use:enhance={() => async ({ update }) => {
                await update();
                showFallbackManual = false;
              }}
              class="space-y-2 rounded-md border border-rule p-3"
            >
              <p class="text-xs text-ink-muted">No streaming link will be generated.</p>
              <input
                type="text"
                name="title"
                aria-label="Song title"
                placeholder="Song title"
                required
                class="w-full rounded-md border border-rule px-3 py-2 text-sm"
              />
              <input
                type="text"
                name="artist"
                aria-label="Artist"
                placeholder="Artist"
                class="w-full rounded-md border border-rule px-3 py-2 text-sm"
              />
              <input
                type="text"
                name="album"
                aria-label="Album (optional)"
                placeholder="Album (optional)"
                class="w-full rounded-md border border-rule px-3 py-2 text-sm"
              />
              <div class="flex items-center gap-2">
                <button
                  type="submit"
                  class="rounded-md bg-accent px-3 py-2 text-sm text-paper hover:bg-ink"
                >
                  Add song
                </button>
                <button
                  type="button"
                  onclick={() => (showFallbackManual = false)}
                  class="text-xs text-ink-muted underline"
                >
                  cancel
                </button>
              </div>
            </form>
          {/if}
        </div>
      {/if}
    {/if}

    {#if form && 'error' in form && form.error}
      <p role="alert" class="mt-3 text-sm text-accent">{form.error}</p>
    {/if}
    {#if form && 'imported' in form && form.imported}
      <p role="status" class="mt-3 text-sm text-ink-muted">Imported {form.imported} songs.</p>
    {/if}
  </section>

  <!-- Song list -->
  {#if songOrder.length === 0}
    <p class="text-ink-muted">No songs yet. Paste a list above to add some.</p>
  {:else}
    <ol
      class="divide-y divide-rule rounded-md border border-rule"
      use:dndzone={{
        items: songOrder,
        dragDisabled: false,
        flipDurationMs: 180,
        dropTargetStyle: {}
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
      {#each songOrder as song (song.id)}
        <li animate:flip={{ duration: 180 }} class="group" data-testid="song-row">
          <!-- Compact single-line row -->
          <div class="flex items-center gap-2 px-2 py-1.5">
            <button
              type="button"
              class="drag-handle flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-ink-muted hover:text-ink active:cursor-grabbing"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
                <circle cx="3" cy="3" r="1.2" fill="currentColor" />
                <circle cx="7" cy="3" r="1.2" fill="currentColor" />
                <circle cx="3" cy="7" r="1.2" fill="currentColor" />
                <circle cx="7" cy="7" r="1.2" fill="currentColor" />
                <circle cx="3" cy="11" r="1.2" fill="currentColor" />
                <circle cx="7" cy="11" r="1.2" fill="currentColor" />
              </svg>
            </button>

            <span
              class="w-10 shrink-0 text-right text-xs tabular-nums text-ink-muted"
              aria-label={song.memory_year ? `Memory year ${song.memory_year}` : ''}
            >
              {song.memory_year ?? ''}
            </span>

            <span class="min-w-0 flex-1 truncate text-sm">
              <span class="text-ink">{song.title}</span>
              {#if song.artist}<span class="text-ink-muted"> · {song.artist}</span>{/if}
            </span>

            {#if song.link_status === 'done' && song.songlink_url}
              <a
                href={song.songlink_url}
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 text-xs text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
              >
                → Listen
              </a>
            {:else if song.preview_url}
              <PreviewButton url={song.preview_url} />
            {:else}
              <span
                title={tooltip(song.link_status)}
                aria-disabled="true"
                class="shrink-0 cursor-not-allowed text-xs text-ink-muted"
              >
                → Listen
              </span>
            {/if}

            <button
              type="button"
              onclick={() => (openMetaFor = openMetaFor === song.id ? null : song.id)}
              class="shrink-0 px-1.5 text-xs text-ink-muted hover:text-accent"
              aria-label={openMetaFor === song.id ? 'Close edit' : 'Edit'}
              title={openMetaFor === song.id ? 'Close edit' : 'Edit metadata'}
            >
              Edit
            </button>

            <button
              type="button"
              onclick={() => toggleStory(song)}
              class="shrink-0 px-1.5 text-xs text-ink-muted hover:text-accent"
              title={song.story_text ? 'Edit story' : 'Write story'}
            >
              {song.story_text ? 'Story✓' : 'Story'}
            </button>

            {#if confirmingDelete === song.id}
              <form
                method="POST"
                action="?/delete"
                use:enhance={() => async ({ update }) => {
                  await update();
                  confirmingDelete = null;
                }}
                class="inline"
              >
                <input type="hidden" name="song_id" value={song.id} />
                <button
                  type="submit"
                  class="shrink-0 px-1.5 text-xs text-accent underline hover:text-ink"
                >
                  Confirm
                </button>
              </form>
              <button
                type="button"
                onclick={() => (confirmingDelete = null)}
                class="shrink-0 px-1 text-xs text-ink-muted underline">cancel</button
              >
            {:else}
              <button
                type="button"
                onclick={() => (confirmingDelete = song.id)}
                class="shrink-0 px-1 text-ink-muted hover:text-accent"
                aria-label="Remove song"
                title="Remove song">✕</button
              >
            {/if}
          </div>

          <!-- Expandable: story preview when collapsed, full forms when expanded -->
          {#if openMetaFor === song.id}
            <form
              method="POST"
              action="?/save_meta"
              use:enhance={() => async ({ update }) => {
                await update();
                openMetaFor = null;
              }}
              class="space-y-2 border-t border-rule bg-rule/20 px-3 py-3"
            >
              <input type="hidden" name="song_id" value={song.id} />
              <input
                type="text"
                name="title"
                aria-label="Title"
                value={song.title}
                placeholder="Title"
                required
                class="w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-sm"
              />
              <input
                type="text"
                name="artist"
                aria-label="Artist"
                value={song.artist ?? ''}
                placeholder="Artist"
                class="w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-sm"
              />
              <input
                type="text"
                name="album"
                aria-label="Album"
                value={song.album ?? ''}
                placeholder="Album"
                class="w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                class="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:bg-ink"
                >Save</button
              >
            </form>
          {/if}

          {#if openStoryFor === song.id}
            <form
              method="POST"
              action="?/save_story"
              use:enhance={() => async ({ update }) => {
                await update();
                openStoryFor = null;
              }}
              class="space-y-2 border-t border-rule bg-rule/20 px-3 py-3"
            >
              <input type="hidden" name="song_id" value={song.id} />
              <label class="flex items-center gap-2 text-sm text-ink-muted">
                <span>This song reminds me of the year</span>
                <HelpTip label="Memory year">
                  Optional. The year you most associate with this song —
                  not necessarily its release year. Used as a lead-in on
                  some stories.
                </HelpTip>
                <input
                  type="number"
                  name="memory_year"
                  value={song.memory_year ?? ''}
                  min="1900"
                  max="2100"
                  placeholder="—"
                  class="w-20 rounded-md border border-rule bg-paper px-2 py-1 text-sm text-ink"
                />
              </label>
              <span class="inline-flex items-center gap-1.5">
                <span class="text-sm text-ink-muted">Story</span>
                <HelpTip label="Story">
                  Why does this song matter to you? Markdown is supported.
                  Stories are optional — a mixtape with no stories is still
                  a mixtape.
                </HelpTip>
              </span>
              <textarea
                name="text"
                aria-label="Story for this song"
                rows="6"
                maxlength={STORY_MAX}
                bind:value={storyDraft}
                placeholder="Why does this song matter? Markdown supported."
                class="w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm leading-relaxed"
              ></textarea>
              <div class="flex items-center justify-between gap-3 text-xs text-ink-muted">
                <span>Markdown supported</span>
                <span
                  class:text-accent={storyDraft.length > STORY_MAX * 0.95}
                >
                  {storyDraft.length.toLocaleString()} / {STORY_MAX.toLocaleString()}
                </span>
                <button
                  type="submit"
                  class="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:bg-ink"
                  >Save story</button
                >
              </div>
            </form>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</main>
