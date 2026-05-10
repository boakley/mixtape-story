<script lang="ts">
  import { quotes } from '$lib/quotes';

  type Props = { handles: string[] };
  let { handles }: Props = $props();

  const ROTATE_MS = 5 * 60 * 1000; // 5 minutes; tunable

  let index = $state(0);
  const current = $derived(quotes[index]);

  $effect(() => {
    // SSR/prerender freezes index=0; pick a fresh random on mount.
    index = Math.floor(Math.random() * quotes.length);

    if (quotes.length <= 1) return;
    const interval = setInterval(() => {
      let next = Math.floor(Math.random() * quotes.length);
      if (next === index) next = (next + 1) % quotes.length;
      index = next;
    }, ROTATE_MS);

    return () => clearInterval(interval);
  });
</script>

<section class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-12 sm:px-6 sm:py-16">
  <div class="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-rule px-3 py-1 text-xs uppercase tracking-wider text-ink-muted">
    <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
    <span>In private testing</span>
  </div>

  <h1 class="text-4xl leading-tight text-ink sm:text-5xl">
    mixtapestory<span class="text-accent">.</span>com
  </h1>

  <p class="mt-4 text-xl leading-snug text-ink sm:text-2xl">
    Share the songs, share the stories.
  </p>

  <p class="mt-6 max-w-prose text-base leading-relaxed text-ink-muted">
    A small place for mixtape stories — a curated set of songs, each with writing about why
    that song matters. The mixtape is the artifact; the stories are what make it personal.
  </p>

  {#if handles.length > 0}
    <p class="mt-8 text-sm text-ink-muted">
      {handles.length === 1 ? 'A first example' : 'Examples'}:
      {#each handles as handle, i}
        <a
          href="/{handle}"
          class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
          >/{handle}</a
        >{#if i < handles.length - 1}<span class="text-ink-muted"> · </span>{/if}
      {/each}
    </p>
  {/if}

  {#if current}
    <figure class="mt-12 max-w-prose border-t border-rule pt-8">
      <blockquote class="text-base italic leading-relaxed text-ink">
        “{current.quote}”
      </blockquote>
      <figcaption class="mt-2 text-sm text-ink-muted">— {current.author}</figcaption>
    </figure>
  {/if}
</section>
