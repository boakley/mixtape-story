<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import ViewToggle, { type View } from '$lib/components/ViewToggle.svelte';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();

  // Tab state. Default is the directory ("Member mixtapes"); choice
  // persists in localStorage so a visitor lands back on whichever tab
  // they prefer. SSR-safe: `localStorage` is read in onMount only.
  type Tab = 'mixtapes' | 'shared' | 'all';
  const TAB_KEY = 'group-tab';
  let activeTab = $state<Tab>('mixtapes');

  onMount(() => {
    try {
      const stored = localStorage.getItem(TAB_KEY);
      if (stored === 'mixtapes' || stored === 'shared' || stored === 'all') {
        activeTab = stored;
      }
    } catch {
      // private mode / SSR fallback — leave default.
    }
  });

  function setTab(t: Tab): void {
    activeTab = t;
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // ignore — read at next mount will just miss
    }
  }

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

  // Expanded/compact view for the song tabs. The ViewToggle component
  // owns the localStorage hookup; binding `view` here gives us read
  // access so the song snippet can branch on it. Shared key with the
  // personal mixtape page means a toggle on either page carries to both.
  let view = $state<View>('compact');

  // In compact view, individual songs can be expanded in-place by
  // clicking the title row (matches the personal-page SongRow pattern).
  let expandedSongsInCompact = $state(new Set<string>());

  function toggleCompactSong(key: string): void {
    const next = new Set(expandedSongsInCompact);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedSongsInCompact = next;
  }

  // "Songs we share" filter: songs picked by 2+ distinct contributors.
  const sharedSongs = $derived(data.songs.filter((s) => s.contributors.length >= 2));

  // Inline-edit state for the group's two editable header fields. Each
  // edit lives in its own form; the textarea / input is bound to the
  // matching $state so the char counter stays live, and the `start…`
  // helpers seed from current saved data (so cancel-and-re-edit doesn't
  // surface stale text from an earlier session).
  let editingDescription = $state(false);
  let descValue = $state('');
  const DESCRIPTION_MAX = 500;

  function startEditingDescription(): void {
    descValue = data.group.description;
    editingDescription = true;
  }

  let editingName = $state(false);
  let nameValue = $state('');
  const NAME_MAX = 100;

  function startEditingName(): void {
    nameValue = data.group.name;
    editingName = true;
  }

  // Focus the textarea when edit mode opens. Done via a use:action rather
  // than the `autofocus` attribute (which would trip svelte's a11y rule —
  // that rule targets page-load autofocus; here the focus is response to a
  // user click, which is fine, but the action is the cleaner expression).
  function focusOnMount(node: HTMLElement): void {
    node.focus();
  }

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86_400_000);
    if (d < 1) return 'today';
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  }

  function inviteUrl(code: string): string {
    const origin = page.url.origin;
    return `${origin}/g/${data.group.slug}/i/${code}`;
  }

  // Narrow the discriminated form payload so the template can access
  // either the copy-flow error or the invite-flow error without TS
  // complaints. `null`/`undefined` cases are handled by the template.
  const inviteForm = $derived(
    form && typeof form === 'object' && 'invite' in form ? form.invite : null
  );
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
    <p class="text-xs uppercase tracking-wider text-ink-muted">
      <a href="/" class="hover:text-accent">mixtapestory.com</a>
    </p>
    {#if editingName}
      <form
        method="POST"
        action="?/editName"
        class="mt-2"
        use:enhance={() => {
          return async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') editingName = false;
          };
        }}
      >
        <label class="sr-only" for="group-name-edit">Group name</label>
        <input
          id="group-name-edit"
          name="name"
          type="text"
          maxlength={NAME_MAX}
          bind:value={nameValue}
          use:focusOnMount
          class="block w-full rounded-md border border-rule bg-paper px-3 py-2 text-3xl leading-tight text-ink focus:border-accent focus:outline-none sm:text-4xl"
        />
        <div class="mt-2 flex items-center justify-between gap-3">
          <p class="text-xs text-ink-muted">{nameValue.length}/{NAME_MAX}</p>
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => (editingName = false)}
              class="rounded-md px-3 py-1 text-xs text-ink-muted hover:text-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded-md bg-ink px-3 py-1 text-xs text-paper hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
        {#if nameForm && 'error' in nameForm && nameForm.error}
          <p role="alert" class="mt-1 text-xs text-accent">{nameForm.error}</p>
        {/if}
      </form>
    {:else}
      <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">
        {data.group.name}{#if data.isSteward}<button
            type="button"
            onclick={startEditingName}
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
      <form
        method="POST"
        action="?/editDescription"
        class="mt-2"
        use:enhance={() => {
          return async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') editingDescription = false;
          };
        }}
      >
        <label class="sr-only" for="group-description-edit">Group description</label>
        <textarea
          id="group-description-edit"
          name="description"
          rows="3"
          maxlength={DESCRIPTION_MAX}
          bind:value={descValue}
          use:focusOnMount
          class="block w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        ></textarea>
        <div class="mt-2 flex items-center justify-between gap-3">
          <p class="text-xs text-ink-muted">{descValue.length}/{DESCRIPTION_MAX}</p>
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => (editingDescription = false)}
              class="rounded-md px-3 py-1 text-xs text-ink-muted hover:text-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded-md bg-ink px-3 py-1 text-xs text-paper hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
        {#if descriptionForm && 'error' in descriptionForm && descriptionForm.error}
          <p role="alert" class="mt-1 text-xs text-accent">{descriptionForm.error}</p>
        {/if}
      </form>
    {:else if data.group.description}
      <p class="mt-2 text-sm text-ink-muted">
        {data.group.description}{#if data.isSteward}<button
            type="button"
            onclick={startEditingDescription}
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
          onclick={startEditingDescription}
          class="underline decoration-rule underline-offset-2 hover:text-accent"
        >
          Add a description
        </button>
      </p>
    {/if}
    {#if data.isMember}
      <p class="mt-2 text-xs text-ink-muted" data-testid="group-meta">
        {data.memberCount} {data.memberCount === 1 ? 'member' : 'members'} · {data.activeMixtapeCount} {data.activeMixtapeCount === 1 ? 'mixtape' : 'mixtapes'}
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
        aria-selected={activeTab === 'mixtapes'}
        onclick={() => setTab('mixtapes')}
        class="-mb-px border-b-2 pb-2.5 pt-2 text-[13px] transition-colors {activeTab ===
        'mixtapes'
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-accent'}"
      >
        Member mixtapes
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'shared'}
        onclick={() => setTab('shared')}
        class="-mb-px border-b-2 pb-2.5 pt-2 text-[13px] transition-colors {activeTab === 'shared'
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-accent'}"
      >
        Songs we share
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'all'}
        onclick={() => setTab('all')}
        class="-mb-px border-b-2 pb-2.5 pt-2 text-[13px] transition-colors {activeTab === 'all'
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-accent'}"
      >
        All songs
      </button>
    </div>

    {#if activeTab === 'mixtapes'}
      {#if data.mixtapes.length === 0}
        <section class="mt-4 rounded-md border border-rule bg-paper p-5">
          <p class="text-sm text-ink">No mixtapes here yet.</p>
          <p class="mt-1 text-sm text-ink-muted">Be the first.</p>

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
              class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 border-b border-rule hover:text-accent"
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
                <div class="flex items-baseline justify-between gap-4">
                  <span class={mt.songCount === 0 ? 'italic text-ink-muted' : 'text-ink'}>
                    <span class="text-base">{mt.displayName}'s mixtape</span>
                    {#if mt.songCount > 0}
                      <span class="ml-1.5 text-xs text-ink-muted">
                        ({mt.songCount} {mt.songCount === 1 ? 'song' : 'songs'})
                      </span>
                    {/if}
                  </span>
                  <span class="shrink-0 text-xs text-ink-muted">{timeAgo(mt.updatedAt)}</span>
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
    {:else if activeTab === 'shared'}
      {#if sharedSongs.length === 0}
        <p class="mt-6 text-sm italic text-ink-muted">No shared songs yet.</p>
      {:else}
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-sm text-ink-muted">
            {sharedSongs.length}
            {sharedSongs.length === 1 ? 'song' : 'songs'} picked by two or more of you.
          </p>
          <ViewToggle bind:view />

        </div>
        <div class="mt-2">
          {#each sharedSongs as song (song.dedupKey)}
            {@render songEntry(song)}
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'all'}
      {#if data.songs.length === 0}
        <section class="mt-4 rounded-md border border-rule bg-paper p-5">
          <p class="text-sm text-ink">No songs yet — be the first.</p>
        </section>
      {:else}
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-sm text-ink-muted">
            Every song picked by the group · newest first.
          </p>
          <ViewToggle bind:view />

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
    {@const showStories = view === 'expanded' || expandedSongsInCompact.has(song.dedupKey)}
    <article
      class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 {view === 'compact'
        ? 'py-1'
        : 'py-4 sm:py-5'}"
    >
      <div class="relative" aria-hidden="true">
        <span
          class="absolute left-1/2 w-px -translate-x-1/2 bg-rule {view === 'compact'
            ? '-top-1 -bottom-1'
            : '-top-4 -bottom-4 sm:-top-5 sm:-bottom-5'}"
        ></span>
        <span
          class="absolute left-1/2 -translate-x-1/2 rounded-full bg-accent ring-2 ring-paper {view ===
          'compact'
            ? 'top-[0.625rem] h-1.5 w-1.5'
            : 'top-[0.75rem] h-2.5 w-2.5 sm:top-[0.9375rem]'}"
        ></span>
      </div>
      <div class="min-w-0">
        {#if view === 'compact'}
          <!-- Compact: title-row is a button (click to expand stories in
               place); Listen sits adjacent so it stays one tap away even
               when the row is collapsed. Layout matches the personal-page
               SongRow compact mode. -->
          <div class="flex items-baseline justify-between gap-3">
            <button
              type="button"
              onclick={() => toggleCompactSong(song.dedupKey)}
              aria-expanded={showStories}
              title={showStories ? 'Hide stories' : 'Show stories'}
              class="group flex min-w-0 flex-1 items-start gap-2 text-left"
            >
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
              <span
                class="shrink-0 pt-1 text-ink-muted transition-transform group-hover:text-accent {showStories
                  ? 'rotate-90'
                  : ''}"
                aria-hidden="true"
              >
                <svg
                  width="14"
                  height="14"
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
            </button>
            {#if song.songlinkUrl}
              <a
                href={song.songlinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
              >
                → Listen
              </a>
            {/if}
          </div>
        {:else}
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="min-w-0 flex-1 text-xl leading-tight text-ink sm:text-2xl">{song.title}</h3>
            {#if song.songlinkUrl}
              <a
                href={song.songlinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
              >
                → Listen
              </a>
            {/if}
          </div>
          {#if song.artist}
            <p class="mt-1 text-sm text-ink-muted">{song.artist}</p>
          {/if}
        {/if}

        {#if showStories}
          <div class="space-y-5 {view === 'compact' ? 'mt-2 pb-2' : 'mt-3'}">
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
                <div class="prose-story mt-1 max-w-prose text-base leading-relaxed text-ink">
                  <!-- marked-rendered story: raw HTML escaped at parse time. -->
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
    </article>
  {/snippet}

  {#if data.isSteward}
    <section class="mt-10 rounded-md border border-rule bg-paper p-5">
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">Steward · Invite codes</h2>

      {#if data.invites.length === 0}
        <p class="mt-3 text-sm text-ink-muted">No active invite codes yet.</p>
      {:else}
        <ul class="mt-3 space-y-3">
          {#each data.invites as inv (inv.id)}
            <li class="rounded-md border border-rule bg-paper p-3" data-testid="invite-row" data-invite-code={inv.code}>
              <div class="flex items-baseline justify-between gap-3">
                <code class="text-sm text-ink">{inv.code}</code>
                <form method="POST" action="?/revokeInvite" use:enhance>
                  <input type="hidden" name="invite_id" value={inv.id} />
                  <button type="submit" class="text-xs text-ink-muted underline decoration-rule underline-offset-2 hover:text-accent">
                    Revoke
                  </button>
                </form>
              </div>
              <p class="mt-1 break-all text-xs text-ink-muted" data-testid="invite-url">{inviteUrl(inv.code)}</p>
              <p class="mt-1 text-xs text-ink-muted">
                {#if inv.expiresAt}Expires {new Date(inv.expiresAt).toLocaleDateString()}{:else}No expiry{/if}
                ·
                {#if inv.usesRemaining !== null}{inv.usesRemaining} {inv.usesRemaining === 1 ? 'use' : 'uses'} left{:else}Unlimited uses{/if}
              </p>
            </li>
          {/each}
        </ul>
      {/if}

      <form method="POST" action="?/createInvite" use:enhance class="mt-4 space-y-3">
        <label class="block">
          <span class="text-xs uppercase tracking-wider text-ink-muted">Code</span>
          <input
            type="text"
            name="code"
            required
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            value={inviteForm && 'code' in inviteForm ? inviteForm.code ?? '' : ''}
            class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink focus:border-accent focus:outline-none"
            placeholder="spring2026"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="text-xs uppercase tracking-wider text-ink-muted">Expires in (days)</span>
            <input
              type="number"
              name="expires_in_days"
              min="1"
              max="365"
              value={inviteForm && 'expiresInDays' in inviteForm ? inviteForm.expiresInDays ?? '' : ''}
              class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              placeholder="optional"
            />
          </label>
          <label class="block">
            <span class="text-xs uppercase tracking-wider text-ink-muted">Use cap</span>
            <input
              type="number"
              name="uses_cap"
              min="1"
              max="1000"
              value={inviteForm && 'usesCap' in inviteForm ? inviteForm.usesCap ?? '' : ''}
              class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              placeholder="optional"
            />
          </label>
        </div>

        {#if inviteForm && 'error' in inviteForm && inviteForm.error}
          <p role="alert" class="text-sm text-accent">{inviteForm.error}</p>
        {/if}

        <button type="submit" class="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90">
          Mint invite
        </button>
      </form>
    </section>
  {/if}

  <footer class="mt-10 border-t border-rule pt-6 text-sm text-ink-muted">
    <p class="text-xs">mixtapestory.com — Share the songs, share the stories.</p>
  </footer>
</main>
