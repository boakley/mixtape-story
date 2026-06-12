<script lang="ts">
  type Cta = { label: string; href: string };
  type Props = {
    cta: Cta;
    /** Optional "see an example" link below the CTA. Omit to hide. */
    example?: Cta;
  };
  let { cta, example }: Props = $props();
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

  {#if example}
    <p class="mt-4 text-sm">
      <a
        href={example.href}
        class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
      >{example.label}</a>
    </p>
  {/if}

  <!-- The ten-second orientation, three beats. A zoomed-in
       /how-it-works page is parked in docs/mockups/ (the handle is
       already reserved); link it from here when it ships. -->
  <section aria-labelledby="how-it-works-cap" class="mt-12 border-t border-rule pt-6">
    <p id="how-it-works-cap" class="text-xs uppercase tracking-wider text-ink-muted">
      How it works
    </p>
    <ol class="mt-4 space-y-3">
      <li class="grid grid-cols-[1.25rem_1fr] gap-2">
        <span class="font-mono text-xs leading-6 text-accent" aria-hidden="true">1</span>
        <span>
          <span class="block text-sm font-medium text-ink">Pick your songs</span>
          <span class="block text-sm text-ink-muted"
            >Paste a list, or search — we match them to an online catalog.</span
          >
        </span>
      </li>
      <li class="grid grid-cols-[1.25rem_1fr] gap-2">
        <span class="font-mono text-xs leading-6 text-accent" aria-hidden="true">2</span>
        <span>
          <span class="block text-sm font-medium text-ink">Write why they matter</span>
          <span class="block text-sm text-ink-muted"
            >A memory, a person, a year. The story is the point.</span
          >
        </span>
      </li>
      <li class="grid grid-cols-[1.25rem_1fr] gap-2">
        <span class="font-mono text-xs leading-6 text-accent" aria-hidden="true">3</span>
        <span>
          <span class="block text-sm font-medium text-ink">Share one link</span>
          <span class="block text-sm text-ink-muted"
            >Friends open each song in their own music app. No account needed to listen.</span
          >
        </span>
      </li>
    </ol>
  </section>

  <p class="mt-12 text-xs text-ink-muted">
    <a href="/privacy" class="underline decoration-rule underline-offset-4 hover:text-accent"
      >Privacy</a
    >
  </p>
</main>
