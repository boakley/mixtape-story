<script lang="ts">
  import { enhance } from '$app/forms';
  import HelpTip from '$lib/components/HelpTip.svelte';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>
    {data.status === 'welcome' ? `You're invited to ${data.group.name}` : 'Invite — mixtapestory.com'}
  </title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
  <p class="text-xs uppercase tracking-wider text-ink-muted">
    <a href="/" class="hover:text-accent">mixtapestory.com</a>
  </p>

  {#if data.status === 'welcome'}
    <h1 class="mt-2 text-3xl leading-tight text-ink">You've been invited to {data.group.name}.</h1>
    <p class="mt-3 text-sm text-ink-muted">
      Mixtapestory is a place to share songs and the stories that explain them.
      Enter your email to join — we'll send a link.
    </p>

    {#if form?.sent}
      <p class="mt-8 rounded-md border border-rule bg-paper p-4 text-sm text-ink">
        Check <span class="text-ink">{form.email}</span> for the magic link.
        It'll bring you right back to this invite.
      </p>
      <p class="mt-3 text-xs text-ink-muted">
        Tip: you can open the email on a different device — the invite rides along in the link.
      </p>
    {:else}
      <form method="POST" action="?/requestInvite" use:enhance class="mt-8 space-y-3">
        <label class="block">
          <span class="inline-flex items-center gap-1.5">
            <span class="text-xs uppercase tracking-wider text-ink-muted">Email</span>
            <HelpTip label="Email">
              We email you a one-time link to confirm. The invite rides
              along, so you can open the email on any device.
            </HelpTip>
          </span>
          <input
            type="email"
            name="email"
            required
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            value={form?.email ?? ''}
            aria-invalid={form?.error ? 'true' : undefined}
            aria-describedby={form?.error ? 'invite-error' : undefined}
            class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink focus:border-accent focus:outline-none"
            placeholder="you@example.com"
          />
        </label>

        {#if form?.error}
          <p id="invite-error" role="alert" class="text-sm text-accent">{form.error}</p>
        {/if}

        <button
          type="submit"
          class="w-full rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
        >
          Send me a link
        </button>
      </form>
    {/if}
  {:else if data.status === 'invalid'}
    <h1 class="mt-2 text-2xl leading-tight text-ink">This invite is no longer active.</h1>
    <p class="mt-2 text-sm text-ink-muted">
      Ask the group's leader for a new link.
    </p>
  {:else}
    <h1 class="mt-2 text-2xl leading-tight text-ink">Couldn't accept the invite.</h1>
    <p class="mt-2 text-sm text-ink-muted">
      Something went wrong. Try the link again, or ask the group's leader to resend it.
    </p>
  {/if}
</main>
