<!--
  Visitor "Listen with" preference chip.

  Shows a horizontal strip:  "Listen with: Apple Music · Spotify · YouTube · Other"
  Click a service to set the preference (writes the LISTEN_PREF_COOKIE
  so server-side renders pick it up on subsequent loads). Click "Other"
  to clear the preference and fall back to the Odesli universal link.

  `listenPref` is bindable so the parent can pass it to `listenHref()`
  per song. Parent typically seeds initial state from `data.viewerPref`
  (server-read cookie) and re-syncs via $effect on navigation.
-->
<script lang="ts">
  import {
    LISTEN_PREF_COOKIE,
    LISTEN_SERVICES,
    OTHER_LISTEN_TOOLTIP,
    type ListenPref
  } from '$lib/listen';

  type Props = { listenPref?: ListenPref | null };
  let { listenPref = $bindable(null) }: Props = $props();

  const listenOptions: Array<{ key: ListenPref | null; label: string; tooltip: string }> = [
    ...(
      Object.entries(LISTEN_SERVICES) as Array<[ListenPref, { label: string; tooltip: string }]>
    ).map(([key, svc]) => ({ key, label: svc.label, tooltip: svc.tooltip })),
    { key: null, label: 'Other', tooltip: OTHER_LISTEN_TOOLTIP }
  ];

  function setListenPref(key: ListenPref | null): void {
    listenPref = key;
    if (key) {
      document.cookie = `${LISTEN_PREF_COOKIE}=${key}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } else {
      document.cookie = `${LISTEN_PREF_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }
  }
</script>

<p class="text-sm text-ink-muted">
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
          : 'text-ink-muted hover:text-accent'}>{opt.label}</button>{/each}</span>
</p>
