<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  type Props = { form: ActionData };
  let { form }: Props = $props();
</script>

<svelte:head>
  <title>Sign in — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
  <p class="text-xs uppercase tracking-wider text-ink-muted">
    <a href="/" class="hover:text-accent">mixtapestory.com</a>
  </p>
  <h1 class="mt-2 text-3xl leading-tight text-ink">Sign in</h1>
  <p class="mt-2 text-sm text-ink-muted">
    Enter your email and we'll send a one-time link.
  </p>

  {#if form?.sent}
    <div class="mt-8 rounded-md border border-rule p-4 text-sm text-ink">
      <p>Check your email for a sign-in link.</p>
      <p class="mt-2 text-ink-muted">
        Sent to <span class="text-ink">{form.email}</span>. The link works once.
      </p>
      <p class="mt-2 text-ink-muted">You can close this window.</p>
    </div>
  {:else}
    <form method="POST" use:enhance class="mt-8 space-y-3">
      <label class="block">
        <span class="text-xs uppercase tracking-wider text-ink-muted">Email</span>
        <input
          type="email"
          name="email"
          required
          autocomplete="email"
          value={form?.email ?? ''}
          class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink focus:border-accent focus:outline-none"
        />
      </label>

      {#if form?.error}
        <p class="text-sm text-accent">{form.error}</p>
      {/if}

      <button
        type="submit"
        class="w-full rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
      >
        Send link
      </button>
    </form>
  {/if}
</main>
