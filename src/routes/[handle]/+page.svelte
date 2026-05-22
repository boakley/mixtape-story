<script lang="ts">
  import { untrack } from 'svelte';
  import SongRow from '$lib/components/SongRow.svelte';
  import QrDialog from '$lib/components/QrDialog.svelte';
  import {
    LISTEN_PREF_COOKIE,
    LISTEN_SERVICES,
    OTHER_LISTEN_TOOLTIP,
    type ListenPref
  } from '$lib/listen';
  import type { PageData } from './$types';

  type Props = { data: PageData };
  let { data }: Props = $props();

  type View = 'expanded' | 'compact';
  const STORAGE_KEY = 'mixtapestory:view';

  let view = $state<View>('compact');
  let qrOpen = $state(false);

  const mixtapeUrl = $derived(`https://mixtapestory.com/${data.handle}`);

  // Visitor "Listen with" preference. Seeded from the server-read cookie (so
  // SSR hrefs and the chip's active state match on first paint), then updated
  // client-side on click — no reload needed, the per-song Listen hrefs
  // recompute reactively from this. The $effect re-syncs when the server value
  // changes (e.g. navigating between mixtapes); a local click doesn't change
  // data.viewerPref so it won't be clobbered.
  let listenPref = $state<ListenPref | null>(untrack(() => data.viewerPref));
  $effect(() => {
    listenPref = data.viewerPref;
  });

  const listenOptions: Array<{ key: ListenPref | null; label: string; tooltip: string }> = [
    ...(Object.entries(LISTEN_SERVICES) as Array<[ListenPref, { label: string; tooltip: string }]>).map(
      ([key, svc]) => ({ key, label: svc.label, tooltip: svc.tooltip })
    ),
    { key: null, label: 'Other', tooltip: OTHER_LISTEN_TOOLTIP }
  ];

  function setListenPref(key: ListenPref | null) {
    listenPref = key;
    if (key) {
      document.cookie = `${LISTEN_PREF_COOKIE}=${key}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } else {
      document.cookie = `${LISTEN_PREF_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }
  }

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
    const url = `https://mixtapestory.com/${data.handle}`;
    const title = `${data.displayName}'s mixtape`;
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
      <div>
        <p class="text-sm text-ink-muted">
          {data.songs.length} songs{yearRange ? ` · ${yearRange}` : ''}
        </p>
        {#if isOwner && data.visitorCount !== null}
          <p class="mt-0.5 text-xs text-ink-muted">
            {data.visitorCount}
            {data.visitorCount === 1 ? 'visitor' : 'visitors'}
          </p>
        {/if}
      </div>

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

    <p class="mt-3 text-sm text-ink-muted">
      <span id="listen-with-label" class="mr-1">Listen with:</span><span
        role="group"
        aria-labelledby="listen-with-label"
      >{#each listenOptions as opt, i}{#if i > 0}<span
            aria-hidden="true"
            class="mx-2 align-middle text-base text-ink-muted">·</span>{/if}<button
            type="button"
            onclick={() => setListenPref(opt.key)}
            aria-pressed={listenPref === opt.key}
            title={opt.tooltip}
            class={listenPref === opt.key
              ? 'text-ink underline decoration-accent decoration-2 underline-offset-4'
              : 'text-ink-muted hover:text-accent'}
          >{opt.label}</button>{/each}</span>
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {#if isOwner}
        <a
          href="/{data.handle}/edit"
          class="inline-flex items-center gap-1.5 text-ink hover:text-accent"
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
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
          <span class="underline decoration-accent decoration-2 underline-offset-4">Edit mixtape</span>
        </a>
      {/if}
      <button
        type="button"
        onclick={handleShare}
        class="inline-flex items-center gap-1.5 text-ink hover:text-accent"
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
      <button
        type="button"
        onclick={() => (qrOpen = true)}
        class="inline-flex items-center gap-1.5 text-ink hover:text-accent"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="1.1">
            <rect x="1" y="1" width="4" height="4" rx="0.5" />
            <rect x="9" y="1" width="4" height="4" rx="0.5" />
            <rect x="1" y="9" width="4" height="4" rx="0.5" />
          </g>
          <g fill="currentColor">
            <rect x="2.4" y="2.4" width="1.2" height="1.2" />
            <rect x="10.4" y="2.4" width="1.2" height="1.2" />
            <rect x="2.4" y="10.4" width="1.2" height="1.2" />
            <rect x="9" y="9" width="1.4" height="1.4" />
            <rect x="11.6" y="9" width="1.4" height="1.4" />
            <rect x="9" y="11.6" width="1.4" height="1.4" />
            <rect x="11.6" y="11.6" width="1.4" height="1.4" />
          </g>
        </svg>
        <span class="underline decoration-accent decoration-2 underline-offset-4">QR code</span>
      </button>
    </div>
  </header>

  {#if qrOpen}
    <QrDialog url={mixtapeUrl} title="{data.displayName}'s mixtape" onClose={() => (qrOpen = false)} />
  {/if}

  {#if data.songs.length === 0}
    <p class="text-ink-muted">No songs yet.</p>
  {:else}
    {#each data.songs as song (song.id)}
      <SongRow {song} {view} {listenPref} />
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
    <p class="text-xs">mixtapestory.com — in private testing.</p>
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
