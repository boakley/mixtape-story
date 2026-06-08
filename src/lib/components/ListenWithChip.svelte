<!--
  Visitor "Listen with" preference chip.

  Shows a horizontal strip:  "Listen with: Apple · Spotify · YouTube · Other"
  Click a service to set the preference (writes the LISTEN_PREF_COOKIE
  so server-side renders pick it up on subsequent loads). Click "Other"
  to mark the explicit "no service, send me to Odesli" choice so the
  first-Listen modal doesn't pop up later.

  `listenPref` is bindable so the parent can pass it to `listenHref()`
  per song. Parent typically seeds initial state from `data.viewerPref`
  (server-read cookie) and re-syncs via $effect on navigation.
-->
<script lang="ts">
  import {
    LISTEN_SERVICES,
    OTHER_LISTEN_TOOLTIP,
    writeListenPrefCookie,
    type ListenPref,
    type ListenService
  } from '$lib/listen';

  type Props = { listenPref?: ListenPref | null };
  let { listenPref = $bindable(null) }: Props = $props();

  const listenOptions: Array<{ key: ListenPref; label: string; tooltip: string }> = [
    ...(
      Object.entries(LISTEN_SERVICES) as Array<[ListenService, { label: string; tooltip: string }]>
    ).map(([key, svc]) => ({ key, label: svc.label, tooltip: svc.tooltip })),
    { key: 'other', label: 'Other', tooltip: OTHER_LISTEN_TOOLTIP }
  ];

  function setListenPref(key: ListenPref): void {
    listenPref = key;
    writeListenPrefCookie(key);
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
