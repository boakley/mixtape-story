<!--
  Collapsible "Steward · {N} active invite codes" panel that lives at
  the bottom of the group landing. Encapsulates everything steward-
  only on this page:

  - Persistent collapsed/expanded state (defaults closed; persists open
    via the mixtapestory:steward-open localStorage key).
  - The active-invites list with per-row Revoke buttons (POST → ?/revokeInvite).
  - The mint-invite form (POST → ?/createInvite) with HelpTip popovers on
    each of the three labeled fields.

  Caller passes `form` raw and the component narrows internally to the
  `invite` payload — keeps the parent from having to derive
  inviteForm for a value it no longer uses anywhere else.

  This whole section will move to /g/{slug}/manage eventually (per
  docs/PHASE-3-groups.md). The collapse here is a stopgap so the
  invite UI doesn't dominate the page on every steward visit.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import HelpTip from './HelpTip.svelte';
  import { useStoredState } from '$lib/use-stored-state.svelte';

  type Invite = {
    id: string;
    code: string;
    createdAt: string;
    expiresAt: string | null;
    usesRemaining: number | null;
  };
  type InviteFormPayload = {
    code?: string;
    expiresInDays?: string;
    usesCap?: string;
    error?: string;
    /** The success-return shape: `{ invite: { ok: true } }`. We don't
     *  consume it but include it here so ActionData's discriminated
     *  cases all assign cleanly into this type. */
    ok?: boolean;
  };
  type Props = {
    slug: string;
    invites: Invite[];
    /** Raw ActionData from the page; component narrows to the `invite`
     *  key internally. Untyped further than the discriminated key
     *  because ActionData is route-specific. */
    form: { invite?: InviteFormPayload } | null | undefined;
  };

  let { slug, invites, form }: Props = $props();

  const inviteForm = $derived(
    form && typeof form === 'object' && 'invite' in form ? form.invite : null
  );

  const stewardOpen = useStoredState<boolean>(
    'mixtapestory:steward-open',
    false,
    (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined)
  );

  function toggleStewardSection(): void {
    stewardOpen.value = !stewardOpen.value;
  }

  function inviteUrl(code: string): string {
    return `${page.url.origin}/g/${slug}/i/${code}`;
  }
</script>

<section class="mt-10 rounded-md border border-rule bg-paper">
  <button
    type="button"
    onclick={toggleStewardSection}
    aria-expanded={stewardOpen.value}
    aria-controls="steward-section-body"
    class="group flex w-full items-center justify-between gap-3 rounded-t-md px-5 py-3 text-left hover:bg-rule/20 {stewardOpen.value
      ? ''
      : 'rounded-b-md'}"
  >
    <span class="text-xs uppercase tracking-wider text-ink-muted">
      Steward · {invites.length === 0
        ? 'No active invite codes'
        : `${invites.length} active invite ${invites.length === 1 ? 'code' : 'codes'}`}
    </span>
    <span
      class="text-ink-muted transition-transform group-hover:text-accent {stewardOpen.value
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

  {#if stewardOpen.value}
    <div id="steward-section-body" class="border-t border-rule px-5 pb-5 pt-4">
      {#if invites.length === 0}
        <p class="text-sm text-ink-muted">No active invite codes yet.</p>
      {:else}
        <ul class="space-y-3">
          {#each invites as inv (inv.id)}
            <li
              class="rounded-md border border-rule bg-paper p-3"
              data-testid="invite-row"
              data-invite-code={inv.code}
            >
              <div class="flex items-baseline justify-between gap-3">
                <code class="text-sm text-ink">{inv.code}</code>
                <form method="POST" action="?/revokeInvite" use:enhance>
                  <input type="hidden" name="invite_id" value={inv.id} />
                  <button
                    type="submit"
                    class="text-xs text-ink-muted underline decoration-rule underline-offset-2 hover:text-accent"
                  >
                    Revoke
                  </button>
                </form>
              </div>
              <p class="mt-1 break-all text-xs text-ink-muted" data-testid="invite-url">
                {inviteUrl(inv.code)}
              </p>
              <p class="mt-1 text-xs text-ink-muted">
                {#if inv.expiresAt}Expires {new Date(inv.expiresAt).toLocaleDateString()}{:else}No expiry{/if}
                ·
                {#if inv.usesRemaining !== null}{inv.usesRemaining}
                  {inv.usesRemaining === 1 ? 'use' : 'uses'} left{:else}Unlimited uses{/if}
              </p>
            </li>
          {/each}
        </ul>
      {/if}

      <form method="POST" action="?/createInvite" use:enhance class="mt-4 space-y-3">
        <label class="block">
          <span class="inline-flex items-center gap-1.5">
            <span class="text-xs uppercase tracking-wider text-ink-muted">Code</span>
            <HelpTip label="Code">
              A short label members type to join — like "spring2026" or
              "kitchen-table". Lowercase letters, digits, and hyphens;
              4–32 characters.
            </HelpTip>
          </span>
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
            <span class="inline-flex items-center gap-1.5">
              <span class="text-xs uppercase tracking-wider text-ink-muted">Expires in (days)</span>
              <HelpTip label="Expires in (days)">
                How long this code stays valid. Leave blank for no expiry.
                Max 365 days.
              </HelpTip>
            </span>
            <input
              type="number"
              name="expires_in_days"
              min="1"
              max="365"
              value={inviteForm && 'expiresInDays' in inviteForm
                ? inviteForm.expiresInDays ?? ''
                : ''}
              class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              placeholder="optional"
            />
          </label>
          <label class="block">
            <span class="inline-flex items-center gap-1.5">
              <span class="text-xs uppercase tracking-wider text-ink-muted">Use cap</span>
              <HelpTip label="Use cap">
                Maximum number of people who can redeem this code. Leave
                blank for unlimited. Max 1000.
              </HelpTip>
            </span>
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

        <button
          type="submit"
          class="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
        >
          Mint invite
        </button>
      </form>
    </div>
  {/if}
</section>
