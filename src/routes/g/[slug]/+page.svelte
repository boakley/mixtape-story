<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
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
  {:else if data.mixtapes.length === 0}
    <section class="rounded-md border border-rule bg-paper p-5">
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
    <div>
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

      {#if data.isMember && !data.viewerHasGroupMixtape}
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
      {:else if data.isMember && data.viewerHasGroupMixtape}
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
