<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Create a group — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
  <p class="text-xs uppercase tracking-wider text-ink-muted">
    <a href="/" class="hover:text-accent">mixtapestory.com</a>
  </p>
  <h1 class="mt-2 text-3xl leading-tight text-ink">Start a group</h1>
  <p class="mt-2 text-sm text-ink-muted">
    Signed in as <a href="/u/{data.handle}" class="text-ink hover:text-accent">{data.handle}</a>. Members will join with an invite code you share.
  </p>

  <form method="POST" use:enhance class="mt-8 space-y-4">
    <label class="block">
      <span class="text-xs uppercase tracking-wider text-ink-muted">URL slug</span>
      <div class="mt-1 flex items-center rounded-md border border-rule bg-paper">
        <span class="px-3 py-2 text-sm text-ink-muted">mixtapestory.com/g/</span>
        <input
          type="text"
          name="slug"
          required
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          value={form?.slug ?? ''}
          aria-invalid={form?.error ? 'true' : undefined}
          aria-describedby={form?.error ? 'create-group-error' : undefined}
          class="flex-1 rounded-r-md border-0 bg-transparent px-1 py-2 text-base text-ink focus:outline-none"
          placeholder="writing-meditation"
        />
      </div>
    </label>

    <label class="block">
      <span class="text-xs uppercase tracking-wider text-ink-muted">Display name</span>
      <input
        type="text"
        name="name"
        required
        value={form?.name ?? ''}
        aria-invalid={form?.error ? 'true' : undefined}
        aria-describedby={form?.error ? 'create-group-error' : undefined}
        class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink focus:border-accent focus:outline-none"
        placeholder="Writing Meditation"
      />
    </label>

    <label class="block">
      <span class="text-xs uppercase tracking-wider text-ink-muted">Description</span>
      <textarea
        name="description"
        rows="3"
        value={form?.description ?? ''}
        aria-invalid={form?.error ? 'true' : undefined}
        aria-describedby={form?.error ? 'create-group-error' : undefined}
        class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink focus:border-accent focus:outline-none"
        placeholder="A small group sharing songs and the stories that explain them."
      ></textarea>
      <span class="mt-1 block text-xs text-ink-muted">Editable later. Shown on the group's landing page.</span>
    </label>

    {#if form?.error}
      <p id="create-group-error" role="alert" class="text-sm text-accent">{form.error}</p>
    {/if}

    <button
      type="submit"
      class="w-full rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
    >
      Create group
    </button>
  </form>
</main>
