<script lang="ts">
  import { onMount } from 'svelte';

  type Pending = {
    id: string;
    owner_handle: string | null;
    position: number;
    title: string;
    artist: string | null;
    source_url: string | null;
    added_at: string;
    attempts: number;
  };
  type Failed = {
    id: string;
    owner_handle: string | null;
    title: string;
    artist: string | null;
    source_url: string | null;
    attempts: number;
    last_error: string | null;
    last_attempt: string | null;
  };
  type Resolved = {
    id: string;
    owner_handle: string | null;
    title: string;
    artist: string | null;
    songlink_url: string | null;
    resolved_at: string | null;
  };
  type Snapshot = {
    stats: {
      pending: number;
      failed: number;
      resolved_last_hour: number;
      resolved_last_day: number;
      cache_size: number;
    };
    pending: Pending[];
    failed: Failed[];
    recently_resolved: Resolved[];
  };

  let snapshot = $state<Snapshot | null>(null);
  let loadError = $state<string | null>(null);
  let retrying = $state<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch('/api/admin/queue');
      if (!res.ok) {
        loadError = `HTTP ${res.status}`;
        return;
      }
      snapshot = (await res.json()) as Snapshot;
      loadError = null;
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  async function retry(id: string) {
    retrying = id;
    await fetch(`/api/admin/queue/${id}/retry`, { method: 'POST' });
    retrying = null;
    await refresh();
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  });

  function fmt(ts: string | null) {
    return ts ? new Date(ts).toLocaleString() : '';
  }
</script>

<svelte:head>
  <title>Admin queue — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6">
    <p class="text-xs uppercase tracking-wider text-ink-muted">
      <a href="/" class="hover:text-accent">mixtapestory.com</a>
    </p>
    <h1 class="mt-2 text-3xl text-ink">Resolution queue</h1>
    <p class="text-sm text-ink-muted">Refreshes every 30s.</p>
  </header>

  {#if loadError}
    <p class="rounded-md border border-rule bg-paper p-3 text-sm text-accent">
      Couldn't load queue: {loadError}
    </p>
  {/if}

  {#if snapshot}
    <section class="mb-8 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
      <div class="rounded-md border border-rule p-3">
        <p class="text-xs uppercase tracking-wider text-ink-muted">Pending</p>
        <p class="mt-1 text-2xl text-ink">{snapshot.stats.pending}</p>
      </div>
      <div class="rounded-md border border-rule p-3">
        <p class="text-xs uppercase tracking-wider text-ink-muted">Failed</p>
        <p class="mt-1 text-2xl text-ink">{snapshot.stats.failed}</p>
      </div>
      <div class="rounded-md border border-rule p-3">
        <p class="text-xs uppercase tracking-wider text-ink-muted">Done · 1h</p>
        <p class="mt-1 text-2xl text-ink">{snapshot.stats.resolved_last_hour}</p>
      </div>
      <div class="rounded-md border border-rule p-3">
        <p class="text-xs uppercase tracking-wider text-ink-muted">Done · 1d</p>
        <p class="mt-1 text-2xl text-ink">{snapshot.stats.resolved_last_day}</p>
      </div>
      <div class="rounded-md border border-rule p-3">
        <p class="text-xs uppercase tracking-wider text-ink-muted">Cache</p>
        <p class="mt-1 text-2xl text-ink">{snapshot.stats.cache_size}</p>
      </div>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-lg text-ink">Pending ({snapshot.pending.length})</h2>
      {#if snapshot.pending.length === 0}
        <p class="text-sm text-ink-muted">Queue is empty.</p>
      {:else}
        <ul class="divide-y divide-rule rounded-md border border-rule">
          {#each snapshot.pending as row}
            <li class="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span class="w-32 truncate text-ink-muted">
                {#if row.owner_handle}
                  <a href="/{row.owner_handle}/edit" class="hover:text-accent">@{row.owner_handle}</a>
                {/if}
              </span>
              <span class="min-w-0 flex-1 truncate text-ink">
                #{row.position} {row.title}
                {#if row.artist}<span class="text-ink-muted"> · {row.artist}</span>{/if}
              </span>
              <span class="text-xs text-ink-muted">{fmt(row.added_at)} · att {row.attempts}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-lg text-ink">Failed ({snapshot.failed.length})</h2>
      {#if snapshot.failed.length === 0}
        <p class="text-sm text-ink-muted">Nothing failed.</p>
      {:else}
        <ul class="divide-y divide-rule rounded-md border border-rule">
          {#each snapshot.failed as row}
            <li class="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span class="w-32 truncate text-ink-muted">
                {#if row.owner_handle}
                  <a href="/{row.owner_handle}/edit" class="hover:text-accent">@{row.owner_handle}</a>
                {/if}
              </span>
              <span class="min-w-0 flex-1 truncate text-ink">
                {row.title}
                {#if row.artist}<span class="text-ink-muted"> · {row.artist}</span>{/if}
                {#if row.last_error}
                  <span class="ml-2 text-xs text-accent">{row.last_error}</span>
                {/if}
              </span>
              <button
                type="button"
                disabled={retrying === row.id}
                onclick={() => retry(row.id)}
                class="rounded-md border border-rule px-2 py-1 text-xs text-ink hover:bg-rule hover:text-accent disabled:opacity-50"
              >
                {retrying === row.id ? 'Retrying…' : 'Retry'}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h2 class="mb-3 text-lg text-ink">Recently resolved</h2>
      {#if snapshot.recently_resolved.length === 0}
        <p class="text-sm text-ink-muted">Nothing yet.</p>
      {:else}
        <ul class="divide-y divide-rule rounded-md border border-rule">
          {#each snapshot.recently_resolved as row}
            <li class="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span class="w-32 truncate text-ink-muted">
                {#if row.owner_handle}
                  <a href="/{row.owner_handle}" class="hover:text-accent">@{row.owner_handle}</a>
                {/if}
              </span>
              <span class="min-w-0 flex-1 truncate text-ink">
                {row.title}
                {#if row.artist}<span class="text-ink-muted"> · {row.artist}</span>{/if}
              </span>
              <span class="text-xs text-ink-muted">{fmt(row.resolved_at)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else if !loadError}
    <p class="text-sm text-ink-muted">Loading…</p>
  {/if}
</main>
