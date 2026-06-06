<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86_400_000);
    if (d < 1) return 'today';
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  }
</script>

<svelte:head>
  <title>{data.group.name} — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <p class="text-xs uppercase tracking-wider text-ink-muted">
      <a href="/" class="hover:text-accent">mixtapestory.com</a>
    </p>
    <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">{data.group.name}</h1>
    {#if data.group.description}
      <p class="mt-2 text-sm text-ink-muted">{data.group.description}</p>
    {/if}
    {#if data.isMember}
      <p class="mt-2 text-xs text-ink-muted">
        {data.memberCount} {data.memberCount === 1 ? 'member' : 'members'} · {data.mixtapes.length} {data.mixtapes.length === 1 ? 'mixtape' : 'mixtapes'}
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
  {:else if data.mixtapes.length === 0}
    <section class="rounded-md border border-rule bg-paper p-5">
      <p class="text-sm text-ink">No mixtapes here yet.</p>
      <p class="mt-1 text-sm text-ink-muted">Be the first.</p>

      {#if !data.viewerHasGroupMixtape}
        <form method="POST" action="?/moveIn" use:enhance class="mt-4">
          <button
            type="submit"
            class="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
          >
            {data.viewerHasPersonalMixtape ? 'Move my mixtape here →' : 'Add my mixtape here →'}
          </button>
        </form>
        {#if form && 'error' in form && form.error}
          <p role="alert" class="mt-2 text-sm text-accent">{form.error}</p>
        {/if}
      {/if}
    </section>
  {:else}
    <div>
      {#each data.mixtapes as mt (mt.handle)}
        <a
          href="/{mt.handle}"
          class="flex items-baseline justify-between gap-4 border-b border-rule py-3 hover:text-accent"
        >
          <div>
            <div class="text-base text-ink">{mt.displayName}'s mixtape</div>
            <div class="mt-0.5 text-xs text-ink-muted">{mt.songCount} {mt.songCount === 1 ? 'song' : 'songs'}</div>
          </div>
          <div class="text-xs text-ink-muted">{timeAgo(mt.updatedAt)}</div>
        </a>
      {/each}

      {#if data.isMember && !data.viewerHasGroupMixtape}
        <form method="POST" action="?/moveIn" use:enhance class="mt-6">
          <button
            type="submit"
            class="text-sm text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
          >
            {data.viewerHasPersonalMixtape ? '→ Move my mixtape here' : '→ Add my mixtape here'}
          </button>
        </form>
        {#if form && 'error' in form && form.error}
          <p role="alert" class="mt-2 text-sm text-accent">{form.error}</p>
        {/if}
      {/if}
    </div>
  {/if}

  <footer class="mt-10 border-t border-rule pt-6 text-sm text-ink-muted">
    <p class="text-xs">mixtapestory.com — Share the songs, share the stories.</p>
  </footer>
</main>
