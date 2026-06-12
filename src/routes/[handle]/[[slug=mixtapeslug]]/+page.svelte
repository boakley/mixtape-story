<script lang="ts">
  import BrandCap from '$lib/components/BrandCap.svelte';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import SongRow from '$lib/components/SongRow.svelte';
  import QrDialog from '$lib/components/QrDialog.svelte';
  import ViewToggle, { type View } from '$lib/components/ViewToggle.svelte';
  import InlineEdit from '$lib/components/InlineEdit.svelte';
  import ListenChooser from '$lib/components/ListenChooser.svelte';
  import { listenHref, writeListenPrefCookie, type ListenPref } from '$lib/listen';
  import type { DisplaySong } from '$lib/types';
  import { useStoredState } from '$lib/use-stored-state.svelte';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();

  // QR dialog opens via the `?qr=1` query param so the layout's ☰ menu
  // can trigger it cross-component (the menu lives in +layout.svelte;
  // page-level state isn't reachable from there). On dialog close we
  // strip the param so a refresh doesn't reopen the dialog.
  $effect(() => {
    if (page.url.searchParams.get('qr') === '1') qrOpen = true;
  });
  function closeQr(): void {
    qrOpen = false;
    const url = new URL(page.url);
    url.searchParams.delete('qr');
    goto(url.pathname + url.search, { replaceState: true, noScroll: true });
  }

  // Displayed mixtape title: falls back to "{display_name}'s mixtape"
  // when the creator hasn't set a custom name. The fallback keeps every
  // existing mixtape's title intact without a backfill, and reactively
  // follows display-name changes if the creator updates that.
  const mixtapeTitle = $derived(data.mixtapeName ?? `${data.displayName}'s mixtape`);

  // Inline-edit open/close state for the two editable header fields.
  let editingName = $state(false);
  let editingDescription = $state(false);

  // Narrow the discriminated form payload for each editor's error path.
  const nameForm = $derived(
    form && typeof form === 'object' && 'name' in form ? form.name : null
  );
  const descriptionForm = $derived(
    form && typeof form === 'object' && 'description' in form ? form.description : null
  );

  const view = useStoredState<View>(
    'mixtapestory:view',
    'compact',
    (raw) => (raw === 'expanded' || raw === 'compact' ? raw : undefined)
  );

  // First-visit auto-open + hint. On a visitor's first time on any
  // mixtape page (per device — localStorage), we auto-open the first
  // song that has a story and attach a one-line hint. The marker
  // persists globally rather than per-handle: once a visitor's been
  // shown the gesture on any mixtape, they don't need to be taught
  // again. Dismissal triggers on any toggle, Listen tap, or view-mode
  // change — all of which mean the visitor "got it."
  const hasHinted = useStoredState<boolean>(
    'mixtapestory:hinted',
    false,
    (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined)
  );

  // Index of the first song with non-empty story text, or -1 if none.
  // Drives both auto-open and hint placement.
  const firstStoryIdx = $derived(
    data.songs.findIndex((s) => s.storyText.trim().length > 0)
  );

  // Auto-open + hint are only meaningful in compact view. In expanded
  // view every story is already visible — nothing to teach.
  const showAutoHint = $derived(
    !hasHinted.value && firstStoryIdx !== -1 && view.value === 'compact'
  );

  function dismissHint(): void {
    if (!hasHinted.value) hasHinted.value = true;
  }

  let qrOpen = $state(false);

  const mixtapePath = $derived(
    data.mixtapeSlug ? `/${data.handle}/${data.mixtapeSlug}` : `/${data.handle}`
  );
  const mixtapeUrl = $derived(`https://mixtapestory.com${mixtapePath}`);

  // Visitor "Listen with" preference. Seeded from the server-read cookie
  // (so SSR hrefs match on first paint), then updated client-side by
  // the chooser modal (which writes the cookie via writeListenPrefCookie).
  // The $effect re-syncs when the server value changes (e.g., navigating
  // between mixtapes); a local click doesn't change data.viewerPref so
  // it won't be clobbered.
  let listenPref = $state<ListenPref | null>(untrack(() => data.viewerPref));
  $effect(() => {
    listenPref = data.viewerPref;
  });

  // First-Listen chooser modal. Pops when the visitor taps a Listen
  // link with no stored preference, or when they explicitly pick
  // "Listen with" from the ☰ menu (?listen=set query param).
  let showListenChooser = $state(false);
  // The song the visitor was trying to listen to when the modal popped.
  // After they pick a service, we open that song's per-service URL in
  // a new tab. null when the modal was triggered from the menu (no
  // pending song — just set the preference).
  let pendingListenSong: DisplaySong | null = $state(null);

  function handleListenAttempt(song: DisplaySong): boolean {
    if (listenPref) return false; // Already chose, let the click navigate.
    pendingListenSong = song;
    showListenChooser = true;
    return true; // Intercept — SongRow will preventDefault.
  }

  function handleListenPick(pref: ListenPref): void {
    writeListenPrefCookie(pref);
    listenPref = pref;
    if (pendingListenSong) {
      const url = listenHref(pendingListenSong, pref);
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      pendingListenSong = null;
    }
  }

  // Layout ☰ "Listen with" item routes to /{handle}?listen=set. Watch
  // for it and pop the modal (no pending song — just pref-setting).
  // On modal close we strip the param so a refresh doesn't re-open.
  $effect(() => {
    if (page.url.searchParams.get('listen') === 'set') {
      pendingListenSong = null;
      showListenChooser = true;
    }
  });
  $effect(() => {
    if (!showListenChooser && page.url.searchParams.get('listen') === 'set') {
      const url = new URL(page.url);
      url.searchParams.delete('listen');
      goto(url.pathname + url.search, { replaceState: true, noScroll: true });
    }
  });

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

  // Visitor CTA: only shown to someone who doesn't already have their own
  // mixtape. Owners and signed-in users with handles see nothing; new
  // visitors get the invitation. Variant ("make" vs "claim") depends on
  // whether they're signed in but un-handled vs not signed in at all.
  type Cta = { label: string; href: string } | null;
  const visitorCta = $derived<Cta>(
    isOwner
      ? null
      : data.user && data.viewerHandle
        ? null
        : data.user
          ? { label: 'Claim your own handle →', href: '/onboarding' }
          : { label: 'Make your own →', href: '/login' }
  );

  // Native share sheet on mobile (iOS Safari, Chrome, etc), with a WhatsApp
  // click-to-chat fallback for desktop browsers without navigator.share.
  function handleShare() {
    const url = mixtapeUrl;
    const title = mixtapeTitle;
    const text = `${title} — ${url}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ title, text: title, url }).catch(() => {
        // User cancelled or error — silent.
      });
      return;
    }
    // Fallback: open WhatsApp Web/Desktop with pre-filled text.
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined') window.open(wa, '_blank', 'noopener,noreferrer');
  }
</script>

<svelte:head>
  <title>{mixtapeTitle} — mixtapestory.com</title>
  <meta name="description" content={ogDescription} />
  <meta property="og:title" content={mixtapeTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={mixtapeUrl} />
  {#if !data.mixtapeSlug}
    <!-- og:image points directly at the Storage URL where the render-og Edge
         Function writes the pre-rendered PNG. Direct (not via our /og/{handle}
         SvelteKit endpoint) because some social-platform preview engines don't
         follow redirects, and Storage already returns the right Content-Type
         and cache headers. Primary-only: per-mixtape images are a documented
         fast-follow, so group-born mixtapes unfurl text-only for now. -->
    <meta
      property="og:image"
      content="https://kudxongbgeaylfpcmick.supabase.co/storage/v1/object/public/og-images/{data.handle}.png"
    />
    <meta property="og:image:width" content="1080" />
    <meta property="og:image:height" content="1080" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta
      name="twitter:image"
      content="https://kudxongbgeaylfpcmick.supabase.co/storage/v1/object/public/og-images/{data.handle}.png"
    />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
  <meta name="twitter:title" content={mixtapeTitle} />
  <meta name="twitter:description" content={ogDescription} />
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <!-- Cap row: brand link left, Share right. The global ☰ from
         +layout.svelte floats at the same right edge — pr-12 reserves
         48px (w-9 ☰ + 12px gap) so Share lands cleanly to the left of
         it instead of underneath. Managing-this-mixtape items (Edit,
         QR, Listen with) live inside that menu contextually. -->
    <div class="flex items-center justify-between pr-12">
      <BrandCap />
      <button
        type="button"
        onclick={handleShare}
        class="inline-flex items-center gap-1.5 text-sm text-ink hover:text-accent"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" x2="12" y1="2" y2="15" />
        </svg>
        <span class="underline decoration-accent decoration-2 underline-offset-4">Share</span>
      </button>
    </div>

    <!-- Title row: h1 + pencil (owner) or InlineEdit when actively editing. -->
    {#if editingName}
      <InlineEdit
        bind:open={editingName}
        label="Mixtape title"
        formAction="?/editName"
        fieldName="name"
        initialValue={mixtapeTitle}
        maxLength={100}
        inputClass="text-3xl leading-tight sm:text-4xl"
        errorMessage={nameForm && 'error' in nameForm ? nameForm.error : undefined}
      />
    {:else}
      <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">
        {mixtapeTitle}{#if isOwner}<button
            type="button"
            onclick={() => (editingName = true)}
            aria-label="Edit mixtape title"
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

    {#if data.mixtapeSlug}
      <p class="mt-1 text-sm text-ink-muted">
        A mixtape by <a
          href="/{data.handle}"
          class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
          >{data.displayName}</a
        >
      </p>
    {/if}

    <!-- Description: asymmetric. Visitor + empty → nothing renders, costs
         zero vertical space. Owner + empty → quiet "Add a description"
         prompt. With value → muted one-liner + pencil (owner). -->
    {#if editingDescription}
      <InlineEdit
        bind:open={editingDescription}
        label="Mixtape description"
        formAction="?/editDescription"
        fieldName="description"
        initialValue={data.mixtapeDescription}
        maxLength={500}
        multiline
        inputClass="text-sm"
        errorMessage={descriptionForm && 'error' in descriptionForm
          ? descriptionForm.error
          : undefined}
      />
    {:else if data.mixtapeDescription}
      <p class="mt-2 text-sm text-ink-muted">
        {data.mixtapeDescription}{#if isOwner}<button
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
    {:else if isOwner}
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

    <!-- Meta row: merged single line + ViewToggle. Visitor count auto-
         drops on narrow viewports via sm:inline (and is creator-only
         anyway). -->
    <div class="mt-3 flex items-baseline justify-between gap-3">
      <p class="text-sm text-ink-muted" data-testid="mixtape-meta">
        {data.songs.length} {data.songs.length === 1 ? 'song' : 'songs'}{yearRange
          ? ` · ${yearRange}`
          : ''}{#if isOwner && data.visitorCount !== null}<span
            class="hidden sm:inline"
          > · {data.visitorCount}
            {data.visitorCount === 1 ? 'visitor' : 'visitors'}</span>{/if}
      </p>
      <ViewToggle
        bind:view={
          () => view.value,
          (v) => {
            view.value = v;
            dismissHint();
          }
        }
      />
    </div>
  </header>

  {#if qrOpen}
    <QrDialog url={mixtapeUrl} title={mixtapeTitle} onClose={closeQr} />
  {/if}

  <ListenChooser bind:open={showListenChooser} onPick={handleListenPick} />

  {#if data.songs.length === 0}
    <p class="text-ink-muted">No songs yet.</p>
  {:else}
    {#each data.songs as song, i (song.id)}
      <SongRow
        {song}
        view={view.value}
        {listenPref}
        initiallyExpanded={showAutoHint && i === firstStoryIdx}
        showHint={showAutoHint && i === firstStoryIdx}
        onInteract={dismissHint}
        onListenAttempt={handleListenAttempt}
      />
    {/each}
  {/if}

  <footer class="mt-10 border-t border-rule pt-6 text-sm text-ink-muted">
    {#if visitorCta}
      <p class="mb-2">
        Inspired by this?{' '}
        <a
          href={visitorCta.href}
          class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
        >
          {visitorCta.label}
        </a>
      </p>
    {/if}
    <div class="flex items-baseline justify-between gap-3 text-xs">
      <p>mixtapestory.com — Share the songs, share the stories.</p>
      <a href="/privacy" class="shrink-0 underline decoration-rule underline-offset-4 hover:text-accent"
        >Privacy</a
      >
    </div>
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
