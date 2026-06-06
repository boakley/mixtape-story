<script lang="ts">
  import type { PageData } from './$types';

  type Props = { data: PageData };
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>Invite — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
  <p class="text-xs uppercase tracking-wider text-ink-muted">
    <a href="/" class="hover:text-accent">mixtapestory.com</a>
  </p>

  {#if data.status === 'invalid'}
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
