<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16 text-center">
  <p class="text-xs uppercase tracking-wider text-ink-muted">{page.status}</p>
  {#if page.status === 404}
    <h1 class="mt-6 font-serif text-2xl leading-relaxed text-ink sm:text-3xl">
      You step in the stream,<br />
      But the water has moved on.<br />
      No mixtape is here.
    </h1>
  {:else}
    <h1 class="mt-3 font-serif text-3xl text-ink sm:text-4xl">Something went wrong.</h1>
  {/if}
  <p class="mt-8 text-ink-muted">
    <a href="/" class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent">
      Back to mixtapestory.com
    </a>
  </p>
</main>
