<script lang="ts">
  type Cta = { label: string; href: string };
  type Props = { cta: Cta };
  let { cta }: Props = $props();
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-12 sm:px-6 sm:py-16">
  <h1 class="text-4xl leading-tight text-ink sm:text-5xl">
    mixtapestory<span class="text-accent">.</span>com
  </h1>

  <p class="mt-4 text-xl leading-snug text-ink sm:text-2xl">
    Share the songs, share the stories.
  </p>

  <p class="mt-6 max-w-prose text-base leading-relaxed text-ink-muted">
    For many of us, music is the soundtrack to our lives. Knowing someone's soundtrack
    helps us see what it's like to be them, if only briefly.
  </p>

  <p class="mt-4 max-w-prose text-base leading-relaxed text-ink-muted">
    Do you remember the first time you heard your favorite song? What you were hearing
    when you met your high school sweetheart? When you danced with your spouse for the
    very first time? The last time? Do you remember your first live concert?
  </p>

  <p class="mt-6 max-w-prose font-serif text-xl italic leading-snug text-ink sm:text-2xl">
    What are your mixtape stories?
  </p>

  <p class="mt-6">
    <a
      href={cta.href}
      class="inline-block rounded-md bg-accent px-5 py-2.5 text-base text-paper hover:bg-ink"
    >
      {cta.label}
    </a>
  </p>

  <p class="mt-4 text-sm">
    <a
      href="/bryan"
      class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
    >See Bryan's mixtape →</a>
  </p>

  <p class="mt-12 text-xs italic text-ink-muted">In private testing.</p>
</main>
