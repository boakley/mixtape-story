<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Claim your handle — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
  <p class="text-xs uppercase tracking-wider text-ink-muted">
    <a href="/" class="hover:text-accent">mixtapestory.com</a>
  </p>
  <h1 class="mt-2 text-3xl leading-tight text-ink">Claim a handle</h1>
  <p class="mt-2 text-sm text-ink-muted">
    Signed in as <span class="text-ink">{data.email}</span>. Pick the URL slug for your mixtape page.
  </p>

  <form method="POST" use:enhance class="mt-8 space-y-3">
    <label class="block">
      <span class="text-xs uppercase tracking-wider text-ink-muted">Handle</span>
      <div class="mt-1 flex items-center rounded-md border border-rule bg-paper">
        <span class="px-3 py-2 text-sm text-ink-muted">mixtapestory.com/</span>
        <input
          type="text"
          name="handle"
          required
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          value={form?.handle ?? ''}
          class="flex-1 rounded-r-md border-0 bg-transparent px-1 py-2 text-base text-ink focus:outline-none"
          placeholder="bryan"
        />
      </div>
    </label>

    <label class="block">
      <span class="text-xs uppercase tracking-wider text-ink-muted">Display name</span>
      <input
        type="text"
        name="display_name"
        required
        value={form?.displayName ?? ''}
        class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink focus:border-accent focus:outline-none"
        placeholder="Bryan"
      />
    </label>

    {#if form?.error}
      <p class="text-sm text-accent">{form.error}</p>
    {/if}

    <button
      type="submit"
      class="w-full rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
    >
      Claim
    </button>
  </form>
</main>
