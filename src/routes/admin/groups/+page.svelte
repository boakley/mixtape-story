<script lang="ts">
  import BrandCap from '$lib/components/BrandCap.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };
  let { data }: Props = $props();

  type SortKey = 'name' | 'activity';
  type FilterKey = 'all' | 'active' | 'empty';

  // Clicking a sortable header toggles direction if it's already the active
  // sort, otherwise switches to that sort with a sensible default direction
  // (names ascending, dates descending — the way you'd usually want each).
  function sortLink(key: SortKey): string {
    const sameKey = data.sort === key;
    const nextDir = sameKey
      ? data.dir === 'asc'
        ? 'desc'
        : 'asc'
      : key === 'name'
        ? 'asc'
        : 'desc';
    const params = new URLSearchParams();
    params.set('sort', key);
    params.set('dir', nextDir);
    if (data.filter !== 'all') params.set('filter', data.filter);
    return '?' + params.toString();
  }

  function filterLink(key: FilterKey): string {
    const params = new URLSearchParams();
    if (key !== 'all') params.set('filter', key);
    if (data.sort !== 'activity') params.set('sort', data.sort);
    if (data.dir !== 'desc') params.set('dir', data.dir);
    const qs = params.toString();
    return qs ? '?' + qs : './';
  }

  function indicator(key: SortKey): string {
    if (data.sort !== key) return '';
    return data.dir === 'asc' ? ' ↑' : ' ↓';
  }

  function fmt(ts: string): string {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  const filterTabs: Array<{ key: FilterKey; label: string; count: number }> = $derived([
    { key: 'all', label: 'All', count: data.counts.all },
    { key: 'active', label: 'Active', count: data.counts.active },
    { key: 'empty', label: 'Empty', count: data.counts.empty }
  ]);
</script>

<svelte:head>
  <title>All groups — admin</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6">
    <BrandCap />
    <h1 class="mt-2 text-3xl text-ink">All groups</h1>
    <p class="mt-1 text-sm text-ink-muted">{data.counts.all} total</p>
  </header>

  <nav aria-label="Filter groups" class="mb-4 inline-flex rounded-full border border-rule p-0.5 text-xs">
    {#each filterTabs as tab}
      <a
        href={filterLink(tab.key)}
        aria-current={data.filter === tab.key ? 'page' : undefined}
        class="rounded-full px-3 py-1 transition-colors {data.filter === tab.key
          ? 'bg-ink text-paper'
          : 'text-ink-muted hover:text-ink'}"
      >
        {tab.label} ({tab.count})
      </a>
    {/each}
  </nav>

  {#if data.rows.length === 0}
    <p class="text-sm text-ink-muted">No groups match this filter.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-rule text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th class="py-2 pr-4 text-left font-normal">
              <a href={sortLink('name')} class="hover:text-accent">Name{indicator('name')}</a>
            </th>
            <th class="py-2 pr-4 text-left font-normal">Slug</th>
            <th class="py-2 pr-4 text-left font-normal">Steward</th>
            <th class="py-2 pr-4 text-right font-normal">Members</th>
            <th class="py-2 pr-4 text-right font-normal">Mixtapes</th>
            <th class="py-2 pr-4 text-right font-normal">
              <a href={sortLink('activity')} class="hover:text-accent">Last activity{indicator('activity')}</a>
            </th>
            <th class="py-2 text-right font-normal">Created</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-rule">
          {#each data.rows as row (row.id)}
            <tr>
              <td class="py-2 pr-4 text-ink">{row.name}</td>
              <td class="py-2 pr-4">
                <a
                  href="/g/{row.slug}"
                  class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
                >/g/{row.slug}</a>
              </td>
              <td class="py-2 pr-4 text-ink-muted">
                {#if row.creatorHandle && row.creatorName}
                  {row.creatorName}
                  <a
                    href="/{row.creatorHandle}"
                    class="ml-1 text-ink-muted hover:text-accent"
                  >@{row.creatorHandle}</a>
                {:else}
                  —
                {/if}
              </td>
              <td class="py-2 pr-4 text-right tabular-nums text-ink">{row.memberCount}</td>
              <td class="py-2 pr-4 text-right tabular-nums text-ink">{row.activeMixtapeCount}</td>
              <td class="py-2 pr-4 text-right text-ink-muted">{fmt(row.lastActivity)}</td>
              <td class="py-2 text-right text-ink-muted">{fmt(row.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</main>
