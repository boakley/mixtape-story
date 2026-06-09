<script lang="ts">
  import BrandCap from '$lib/components/BrandCap.svelte';
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';
  import ViewToggle, { type View } from '$lib/components/ViewToggle.svelte';
  import ListenWithChip from '$lib/components/ListenWithChip.svelte';
  import InlineEdit from '$lib/components/InlineEdit.svelte';
  import StewardSection from '$lib/components/StewardSection.svelte';
  import { listenHref, type ListenPref } from '$lib/listen';
  import { useStoredState } from '$lib/use-stored-state.svelte';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();

  // Tab state. Default is the directory ("Member mixtapes"); choice
  // persists across reloads via the useStoredState rune.
  type Tab = 'mixtapes' | 'shared' | 'all';
  const activeTab = useStoredState<Tab>(
    'mixtapestory:group-tab',
    'mixtapes',
    (raw) =>
      raw === 'mixtapes' || raw === 'shared' || raw === 'all' ? raw : undefined
  );

  // Per-(song, contributor) expansion state for the [more]/[less] toggle.
  // Set of `${dedupKey}|${handle}` strings; key is unique per story
  // because a song can have multiple stories (one per contributor).
  let expandedStoryKeys = $state(new Set<string>());

  function toggleStory(key: string): void {
    // Re-assign the Set so $state notices the mutation.
    const next = new Set(expandedStoryKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedStoryKeys = next;
  }

  // Expanded/compact view for the song tabs. Shared key with the
  // personal mixtape page means a toggle on either page carries to both.
  const view = useStoredState<View>(
    'mixtapestory:view',
    'compact',
    (raw) => (raw === 'expanded' || raw === 'compact' ? raw : undefined)
  );

  // Visitor "Listen with" preference. Same pattern as the personal page:
  // seed from server-read cookie so SSR hrefs and chip active state match
  // on first paint; re-sync via $effect on navigation; the ListenWithChip
  // component handles the cookie write on click. listenHref(song, listenPref)
  // routes each → Listen accordingly.
  let listenPref = $state<ListenPref | null>(untrack(() => data.viewerPref));
  $effect(() => {
    listenPref = data.viewerPref;
  });

  // In compact view, individual songs can be expanded in-place by
  // clicking the title row (matches the personal-page SongRow pattern).
  let expandedSongsInCompact = $state(new Set<string>());

  function toggleCompactSong(key: string): void {
    const next = new Set(expandedSongsInCompact);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedSongsInCompact = next;
  }

  // Teaser line for a song row on Songs-we-share / All-songs tabs.
  // Natural-language list of the contributors who actually wrote a
  // story (contributors who just picked the song don't promise text).
  // Caps at 2 names + "and N others" so even a popular song reads
  // cleanly in one truncated line.
  function buildStoryTeaser(names: string[]): string {
    if (names.length === 0) return '';
    if (names.length === 1) return `Story by ${names[0]}`;
    if (names.length === 2) {
      // Easter egg: when the two storytellers are Jack and Diane (in
      // either order), echo the John Mellencamp song title instead of
      // alphabetical order. The seed-group demo lands on this pairing
      // for "Taxi" and "Tea for One"; in real groups the chance of two
      // storytellers being named Jack and Diane who'd mind the
      // reference is vanishingly small.
      const lc = new Set(names.map((n) => n.toLowerCase()));
      if (lc.has('jack') && lc.has('diane')) return 'Stories by Jack and Diane';
      return `Stories by ${names[0]} and ${names[1]}`;
    }
    if (names.length === 3) return `Stories by ${names[0]}, ${names[1]}, and ${names[2]}`;
    return `Stories by ${names[0]}, ${names[1]}, and ${names.length - 2} others`;
  }

  // "Songs we share" filter: songs picked by 2+ distinct contributors.
  const sharedSongs = $derived(data.songs.filter((s) => s.contributors.length >= 2));

  // Inline-edit open/closed state for the group's two editable header
  // fields. The InlineEdit component owns the value, char counter,
  // focus management, enhance hookup, and the close-on-success step;
  // we just hold the boolean that the pencil flips on.
  let editingName = $state(false);
  let editingDescription = $state(false);

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86_400_000);
    if (d < 1) return 'today';
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  }

  // Narrow the discriminated form payload so the template can access
  // the per-action error without TS complaints. The invite-flow
  // payload now lives inside StewardSection; only the InlineEdit
  // payloads stay here.
  const descriptionForm = $derived(
    form && typeof form === 'object' && 'description' in form ? form.description : null
  );
  const nameForm = $derived(
    form && typeof form === 'object' && 'name' in form ? form.name : null
  );
</script>

<svelte:head>
  <title>{data.group.name} — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <BrandCap />
    {#if editingName}
      <InlineEdit
        bind:open={editingName}
        label="Group name"
        formAction="?/editName"
        fieldName="name"
        initialValue={data.group.name}
        maxLength={100}
        inputClass="text-3xl leading-tight sm:text-4xl"
        errorMessage={nameForm && 'error' in nameForm ? nameForm.error : undefined}
      />
    {:else}
      <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">
        {data.group.name}{#if data.isSteward}<button
            type="button"
            onclick={() => (editingName = true)}
            aria-label="Edit group name"
            class="ml-2.5 inline-flex h-6 w-6 -translate-y-1 items-center justify-center align-middle text-ink-muted hover:text-accent"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 1.5l2.5 2.5L4 12.5H1.5V10L10 1.5z" />
              <path d="M8.5 3l2.5 2.5" />
            </svg>
          </button>{/if}
      </h1>
    {/if}

    {#if editingDescription}
      <InlineEdit
        bind:open={editingDescription}
        label="Group description"
        formAction="?/editDescription"
        fieldName="description"
        initialValue={data.group.description}
        maxLength={500}
        multiline
        inputClass="text-sm"
        errorMessage={descriptionForm && 'error' in descriptionForm ? descriptionForm.error : undefined}
      />
    {:else if data.group.description}
      <p class="mt-2 text-sm text-ink-muted">
        {data.group.description}{#if data.isSteward}<button
            type="button"
            onclick={() => (editingDescription = true)}
            aria-label="Edit description"
            class="ml-1.5 inline-flex h-5 w-5 -translate-y-px items-center justify-center align-middle text-ink-muted hover:text-accent"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 1.5l2.5 2.5L4 12.5H1.5V10L10 1.5z" />
              <path d="M8.5 3l2.5 2.5" />
            </svg>
          </button>{/if}
      </p>
    {:else if data.isSteward}
      <p class="mt-2 text-sm italic text-ink-muted">
        <button
          type="button"
          onclick={() => (editingDescription = true)}
          class="underline decoration-rule underline-offset-2 hover:text-accent"
        >
          Add a description
        </button>
      </p>
    {/if}
    {#if data.isMember}
      <!-- Single-line meta, same treatment as the mixtape page's
           {N songs · year range · M visitors} line. -->
      <p class="mt-2 text-sm text-ink-muted" data-testid="group-meta">
        {data.memberCount} {data.memberCount === 1 ? 'member' : 'members'} · {data.activeMixtapeCount}
        {data.activeMixtapeCount === 1 ? 'mixtape' : 'mixtapes'}
      </p>
    {/if}
  </header>

  {#if !data.isMember}
    <section class="rounded-md border border-rule bg-paper p-5">
      <p class="text-sm text-ink-muted">
        This is a members-only group. Paste an invite code or full invite URL to join.
      </p>
      <p class="mt-2 text-xs text-ink-muted">
        (Invite handling lands in the next step. For now, a steward can add you directly.)
      </p>
    </section>
  {:else}
    <!-- Tab strip. Underline pattern from docs/mockups/group-landing.html:
         active tab carries a 2px accent border at the bottom and ink text;
         inactive tabs are muted with hover-to-accent. The container's 1px
         rule sits along the row baseline; each tab's `-mb-px` pulls its
         own border down so the active 2px sits on top of (rather than
         beside) the 1px rule. -->
    <div
      class="mt-6 flex gap-4 border-b border-rule sm:gap-5"
      role="tablist"
      aria-label="Group views"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab.value === 'mixtapes'}
        onclick={() => (activeTab.value = 'mixtapes')}
        class="-mb-px border-b-2 pb-2.5 pt-2 text-[13px] transition-colors {activeTab.value ===
        'mixtapes'
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-accent'}"
      >
        Member mixtapes
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab.value === 'shared'}
        onclick={() => (activeTab.value = 'shared')}
        class="-mb-px border-b-2 pb-2.5 pt-2 text-[13px] transition-colors {activeTab.value === 'shared'
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-accent'}"
      >
        Songs we share
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab.value === 'all'}
        onclick={() => (activeTab.value = 'all')}
        class="-mb-px border-b-2 pb-2.5 pt-2 text-[13px] transition-colors {activeTab.value === 'all'
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-accent'}"
      >
        All songs
      </button>
    </div>

    {#if activeTab.value === 'mixtapes'}
      {#if data.mixtapes.length === 0}
        <section class="mt-4 rounded-md border border-rule bg-paper p-5">
          <p class="text-sm text-ink">No mixtapes here yet. Be the first.</p>

          {#if !data.viewerHasGroupMixtape}
            <form method="POST" action="?/shareWith" use:enhance class="mt-4">
              <button
                type="submit"
                class="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
              >
                Share my mixtape with this group →
              </button>
            </form>
            {#if form && 'error' in form && form.error}
              <p role="alert" class="mt-2 text-sm text-accent">{form.error}</p>
            {/if}
          {/if}
        </section>
      {:else}
        <div class="mt-4">
          {#each data.mixtapes as mt (mt.handle)}
            <a
              href="/{mt.handle}"
              data-testid="member-card"
              data-handle={mt.handle}
              title="Open {mt.displayName}'s mixtape"
              class="group grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 border-b border-rule"
            >
              <div class="relative" aria-hidden="true">
                <span
                  class="absolute -bottom-2 -top-2 left-1/2 w-px -translate-x-1/2 bg-rule"
                ></span>
                <span
                  class="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-paper"
                ></span>
              </div>
              <div class="py-2">
                <div class="flex items-baseline justify-between gap-3">
                  <span
                    class={mt.songCount === 0
                      ? 'italic text-ink-muted group-hover:text-accent'
                      : 'text-ink group-hover:text-accent'}
                  >
                    <span class="text-base">{mt.displayName}'s mixtape</span>
                    {#if mt.songCount > 0}
                      <span class="ml-1.5 text-xs text-ink-muted">
                        ({mt.songCount} {mt.songCount === 1 ? 'song' : 'songs'})
                      </span>
                    {/if}
                  </span>
                  <span class="flex shrink-0 items-baseline gap-2">
                    <span class="text-xs text-ink-muted">{timeAgo(mt.updatedAt)}</span>
                    <span
                      class="text-sm text-ink-muted transition-colors group-hover:text-accent"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </span>
                </div>
                {#if mt.songCount === 0 && mt.isViewer}
                  <p class="mt-0.5 text-xs italic text-ink-muted">
                    Add a song to make this visible to the group.
                  </p>
                {/if}
              </div>
            </a>
          {/each}

          {#if !data.viewerHasGroupMixtape}
            <form method="POST" action="?/shareWith" use:enhance class="mt-6">
              <button
                type="submit"
                class="text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
              >
                → Share my mixtape with this group
              </button>
            </form>
            {#if form && 'error' in form && form.error}
              <p role="alert" class="mt-2 text-sm text-accent">{form.error}</p>
            {/if}
          {:else}
            <form method="POST" action="?/unshareFrom" use:enhance class="mt-6">
              <button
                type="submit"
                class="text-sm text-ink-muted underline decoration-rule underline-offset-2 hover:text-accent"
              >
                Stop sharing my mixtape with this group
              </button>
            </form>
          {/if}
        </div>
      {/if}
    {:else if activeTab.value === 'shared'}
      {#if sharedSongs.length === 0}
        <p class="mt-6 text-sm italic text-ink-muted">No shared songs yet.</p>
      {:else}
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-sm text-ink-muted">
            {sharedSongs.length}
            {sharedSongs.length === 1 ? 'song' : 'songs'} picked by two or more of you.
          </p>
          <ViewToggle bind:view={view.value} />
        </div>
        <div class="mt-2">
          <ListenWithChip bind:listenPref />
        </div>
        <div class="mt-2">
          {#each sharedSongs as song (song.dedupKey)}
            {@render songEntry(song)}
          {/each}
        </div>
      {/if}
    {:else if activeTab.value === 'all'}
      {#if data.songs.length === 0}
        <section class="mt-4 rounded-md border border-rule bg-paper p-5">
          <p class="text-sm text-ink">No songs yet. Be the first.</p>
        </section>
      {:else}
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-sm text-ink-muted">
            Every song picked by the group · newest first.
          </p>
          <ViewToggle bind:view={view.value} />
        </div>
        <div class="mt-2">
          <ListenWithChip bind:listenPref />
        </div>
        <div class="mt-2">
          {#each data.songs as song (song.dedupKey)}
            {@render songEntry(song)}
          {/each}
        </div>
      {/if}
    {/if}
  {/if}

  {#snippet songEntry(song: PageData['songs'][number])}
    {@const songListenUrl = listenHref(song, listenPref)}
    <!-- "Has story" at group scale: at least one contributor's story
         block has rendered content. A song that's been picked but
         where no one's written about it isn't an expand target. -->
    {@const storyContributorNames = song.contributors
      .filter((c) => c.storyExcerptHtml.length > 0)
      .map((c) => c.displayName)}
    {@const hasStory = storyContributorNames.length > 0}
    {@const isExpanded = view.value === 'expanded' || expandedSongsInCompact.has(song.dedupKey)}
    {@const showStories = hasStory && isExpanded}
    {@const showTeaser = hasStory && !isExpanded}
    {@const storyId = `group-story-${song.dedupKey}`}
    <article
      data-testid="song-entry"
      data-song-title={song.title}
      class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 py-2"
    >
      <!-- Rail + solid accent dot (song marker). Matches SongRow on the
           personal mixtape page, so the same vocabulary reads across
           both surfaces. -->
      <div class="relative" aria-hidden="true">
        <span class="absolute -bottom-2 -top-2 left-1/2 w-px -translate-x-1/2 bg-rule"></span>
        <span
          class="absolute left-1/2 top-[0.4375rem] h-2 w-2 -translate-x-1/2 rounded-full bg-accent ring-2 ring-paper"
        ></span>
      </div>

      <div class="min-w-0">
        <!-- Title row: title-area (button when expandable, div when not)
             + right-aligned Listen. The title-area wraps the title AND
             the stories below so both are bounded by where Listen sits
             — no ragged right edges running under Listen. -->
        <div class="flex items-baseline gap-3">
          <div class="min-w-0 flex-1">
            {#if hasStory}
              <button
                type="button"
                onclick={() => toggleCompactSong(song.dedupKey)}
                aria-expanded={isExpanded}
                aria-controls={storyId}
                class="group flex w-full min-w-0 items-baseline gap-2 text-left"
              >
                <span
                  class="inline-flex w-3 shrink-0 justify-center text-ink-muted transition-transform {isExpanded
                    ? 'rotate-90 text-accent'
                    : ''}"
                  aria-hidden="true"
                >
                  <svg
                    width="11"
                    height="11"
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
                    <span class="font-medium text-ink group-hover:text-accent">{song.title}</span>
                    {#if song.artist}
                      <span class="hidden text-ink-muted sm:inline"> · {song.artist}</span>
                    {/if}
                  </span>
                  {#if song.artist}
                    <span class="block truncate text-sm text-ink-muted sm:hidden">{song.artist}</span>
                  {/if}
                  <!-- Teaser inside the title-content span so its right
                       edge is bounded by where Listen sits. -->
                  {#if showTeaser}
                    <span class="mt-1 block truncate text-sm text-ink-muted">
                      {buildStoryTeaser(storyContributorNames)}
                    </span>
                  {/if}
                </span>
              </button>
            {:else}
              <!-- Non-expandable: chevron column preserved (invisible) so
                   the title still aligns with expandable rows. -->
              <div class="flex min-w-0 items-baseline gap-2">
                <span
                  class="invisible inline-flex w-3 shrink-0 justify-center"
                  aria-hidden="true"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="4 2 10 7 4 12" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1 leading-snug">
                  <span class="block truncate text-base">
                    <span class="font-medium text-ink">{song.title}</span>
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

            <!-- Stories: stacked, each prefixed "from {DisplayName}". The
                 whole block sits inside the title-area + uses the accent
                 left-rule treatment from SongRow so the writing is
                 visually distinct from the head row. -->
            {#if showStories}
              <div
                id={storyId}
                class="ml-5 mt-3 space-y-5 border-l-2 border-accent pl-3"
              >
                {#each song.contributors as c (c.handle)}
                  {@const storyKey = `${song.dedupKey}|${c.handle}`}
                  {@const storyExpanded = expandedStoryKeys.has(storyKey)}
                  <div>
                    <p class="text-xs text-ink-muted">
                      from <a href="/{c.handle}" class="text-ink hover:text-accent">{c.displayName}</a>
                    </p>
                    {#if c.memoryYear}
                      <p class="mt-1 text-sm italic text-ink-muted">
                        This song reminds me of {c.memoryYear}.
                      </p>
                    {/if}
                    <div class="prose-story mt-1 text-base leading-relaxed text-ink">
                      <!-- marked output: raw HTML disabled at parse time. -->
                      {#if storyExpanded}
                        {@html c.storyFullHtml}
                      {:else}
                        {@html c.storyExcerptHtml}
                      {/if}
                      {#if c.storyIsTruncated}
                        <button
                          type="button"
                          onclick={() => toggleStory(storyKey)}
                          class="ml-1 text-sm text-ink-muted hover:text-accent"
                        >
                          [{storyExpanded ? 'less' : 'more'}]
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Listen, right-aligned in every state. `→` is aria-hidden
               and unstyled; only the label is underlined. stopPropagation
               so tapping it never toggles the row. -->
          {#if songListenUrl}
            <a
              href={songListenUrl}
              onclick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noopener noreferrer"
              class="shrink-0 text-sm text-ink hover:text-accent"
            >
              <span aria-hidden="true">→ </span><span
                class="underline decoration-accent decoration-2 underline-offset-4">Listen</span>
            </a>
          {/if}
        </div>
      </div>
    </article>
  {/snippet}

  {#if data.isSteward}
    <StewardSection slug={data.group.slug} invites={data.invites} {form} />
  {/if}

  <footer class="mt-10 border-t border-rule pt-6 text-sm text-ink-muted">
    <div class="flex items-baseline justify-between gap-3 text-xs">
      <p>mixtapestory.com — Share the songs, share the stories.</p>
      <a href="/privacy" class="shrink-0 underline decoration-rule underline-offset-4 hover:text-accent"
        >Privacy</a
      >
    </div>
  </footer>
</main>
