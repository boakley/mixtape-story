<!--
  PARKED 2026-06-12: built, reviewed, held back from v1 (the landing
  strip shipped alone). To revive: move to
  src/routes/how-it-works/+page.svelte — the handle is already
  reserved and the strip's "More about how it works" link comes back
  in LandingHero. Design mockup: ~/mixtape-how-it-works-mockup.html.

  /how-it-works — the landing strip's three beats at full zoom, one
  short paragraph and one illustration each. The illustrations are
  markup styled with the design tokens, not raster screenshots, so
  they age with the design instead of rotting (the phantom-class
  lesson applied to docs). The WhatsApp frame's greens are the one
  set of off-token colors — they imitate the chat app, not us.
  `how-it-works` is on the reserved-handles list; this route lives in
  handle space.
-->
<script lang="ts">
  import BrandCap from '$lib/components/BrandCap.svelte';
</script>

<svelte:head>
  <title>How it works — mixtapestory.com</title>
  <meta
    name="description"
    content="Pick your songs, write why they matter, share one link. How mixtapestory.com works."
  />
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <BrandCap />
    <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">How it works</h1>
    <p class="mt-2 max-w-prose text-sm text-ink-muted">
      A mixtape is a handful of songs and the stories behind them. Making one takes an evening,
      not a weekend.
    </p>
  </header>

  <section class="space-y-10">
    <div>
      <h2 class="text-lg font-medium text-ink">
        <span class="mr-2 font-mono text-sm text-accent" aria-hidden="true">1</span>Pick your songs
      </h2>
      <p class="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        Paste a list from anywhere — a playlist, an email, your head. Each line is matched against
        an online catalog of millions of songs; you confirm before anything is added.
      </p>
      <figure class="mt-4 max-w-sm rounded-lg border border-rule bg-paper p-4 shadow-sm">
        <figcaption class="text-[9px] uppercase tracking-wider text-ink-muted">
          The editor — paste a list
        </figcaption>
        <div
          class="mt-2 rounded-md border border-rule px-3 py-2 font-mono text-xs leading-relaxed text-ink"
          aria-hidden="true"
        >
          "Angel from Montgomery" John Prine<br />
          "Wing" Patti Smith<br />
          "When the Levee Breaks" Led Zeppelin
        </div>
        <span
          class="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs text-paper"
          aria-hidden="true">Find songs</span
        >
      </figure>
    </div>

    <div>
      <h2 class="text-lg font-medium text-ink">
        <span class="mr-2 font-mono text-sm text-accent" aria-hidden="true">2</span>Write why they
        matter
      </h2>
      <p class="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        Each song can carry a story — a memory, a person, the year it pins. Not every song needs
        one. The ones that have them are why anyone reads a mixtape twice.
      </p>
      <figure class="mt-4 max-w-sm rounded-lg border border-rule bg-paper p-4 shadow-sm">
        <figcaption class="text-[9px] uppercase tracking-wider text-ink-muted">
          A song with its story
        </figcaption>
        <div class="mt-2" aria-hidden="true">
          <p class="flex items-baseline gap-2 text-sm">
            <span class="h-2 w-2 shrink-0 self-center rounded-full bg-accent"></span>
            <span class="font-medium text-ink">Over and Out</span>
            <span class="text-ink-muted">· Flim &amp; The BB's</span>
          </p>
          <div class="ml-4 mt-1 border-l-2 border-accent pl-3 text-xs leading-relaxed text-ink">
            <p class="italic text-ink-muted">This song reminds me of 1989.</p>
            <p class="mt-1">
              I was still in my jazz period when I first heard this on the compilation CD…
            </p>
          </div>
        </div>
      </figure>
    </div>

    <div>
      <h2 class="text-lg font-medium text-ink">
        <span class="mr-2 font-mono text-sm text-accent" aria-hidden="true">3</span>Share one link
      </h2>
      <p class="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        Your mixtape lives at one address. Paste it into any chat and it unfurls; whoever taps a
        song lands in <em>their</em> streaming service, not yours. Nobody needs an account to
        listen or read.
      </p>
      <figure
        class="mt-4 max-w-[19rem] rounded-xl bg-[#e7ffdb] p-2.5 shadow"
        aria-hidden="true"
      >
        <div class="overflow-hidden rounded-lg bg-[#d9f2cc]">
          <div class="border-b border-[#c9e2bc] bg-paper px-3 py-2">
            <p class="text-[8px] uppercase tracking-wider text-ink-muted">mixtapestory.com</p>
            <p class="font-serif text-base text-ink">Bryan's mixtape</p>
            <p class="text-[10px] text-ink-muted">
              Bachman-Turner Overdrive · Flim &amp; The BB's · Prince · Bruce Springsteen…
            </p>
          </div>
          <div class="px-3 py-1.5">
            <p class="text-[11px] font-semibold text-ink">mixtapestory.com</p>
            <p class="text-[10px] text-[#4a634a]">Share the songs, share the stories.</p>
          </div>
        </div>
        <p class="px-1 pt-1.5 text-xs text-ink">made this for the group — mixtapestory.com/bryan</p>
        <p class="pr-1 text-right text-[9px] text-[#6a826a]">9:41 PM</p>
      </figure>
    </div>
  </section>

  <p class="mt-12">
    <a
      href="/login"
      class="inline-block rounded-md bg-accent px-5 py-2.5 text-base text-paper hover:bg-ink"
    >
      Make your own mixtape →
    </a>
  </p>

  <footer class="mt-10 border-t border-rule pt-6 text-sm text-ink-muted">
    <div class="flex items-baseline justify-between gap-3 text-xs">
      <p>mixtapestory.com — Share the songs, share the stories.</p>
      <a
        href="/privacy"
        class="shrink-0 underline decoration-rule underline-offset-4 hover:text-accent">Privacy</a
      >
    </div>
  </footer>
</main>
