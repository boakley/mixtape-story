<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16 text-center">
  <p class="text-xs uppercase tracking-wider text-ink-muted">{page.status}</p>
  <h1 class="mt-3 font-serif text-3xl text-ink sm:text-4xl">
    {page.status === 404 ? 'No mixtape here.' : 'Something went wrong.'}
  </h1>
  <p class="mt-6 text-ink-muted">
    <a href="/" class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent">
      Back to mixtapestory.com
    </a>
  </p>
</main>
