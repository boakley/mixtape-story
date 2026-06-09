<!--
  /privacy — the minimal, honest version: what the app actually
  collects, where it lives, and how to get it deleted. Written from a
  real inventory of the code (cookies, tables, third-party calls), not
  boilerplate; update it when the data practices change. Email-to-delete
  is the deletion path at this scale; a self-service /account page is a
  documented fast-follow (docs/design-deletion.md).
-->
<script lang="ts">
  import BrandCap from '$lib/components/BrandCap.svelte';
</script>

<svelte:head>
  <title>Privacy — mixtapestory.com</title>
  <meta
    name="description"
    content="What mixtapestory.com collects, where it lives, and how to have it deleted."
  />
</svelte:head>

<main class="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
  <header class="mb-6 sm:mb-8">
    <BrandCap />
    <h1 class="mt-2 text-3xl leading-tight text-ink sm:text-4xl">Privacy</h1>
    <p class="mt-2 text-sm text-ink-muted">
      mixtapestory.com is a small, personal web app. This page says what it keeps and why.
    </p>
  </header>

  <section class="space-y-8 text-base leading-relaxed text-ink">
    <div>
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">What we collect</h2>
      <ul class="mt-2 space-y-2 text-sm">
        <li>Your email address — used only to send you a one-time sign-in link.</li>
        <li>Your handle and display name.</li>
        <li>What you make: your mixtape, the songs you pick, the stories you write.</li>
        <li>
          Visitor counts. When someone opens a mixtape we record an anonymous random ID and a
          first/last visit time so the creator can see how many people have read it. We do not
          store IP addresses or browser fingerprints.
        </li>
      </ul>
    </div>

    <div>
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">Cookies</h2>
      <ul class="mt-2 space-y-2 text-sm">
        <li>A session cookie that keeps you signed in.</li>
        <li>One that remembers which music service you chose for Listen links.</li>
        <li>One holding the anonymous random ID behind the visitor count.</li>
      </ul>
      <p class="mt-2 text-sm">No advertising cookies. No cross-site tracking.</p>
    </div>

    <div>
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">Where it lives</h2>
      <p class="mt-2 text-sm">
        Data is stored in a Postgres database managed by Supabase. The site is served by
        Cloudflare Pages. Sign-in emails are delivered by Resend. Song searches are sent
        server-side to Apple's music catalog, and Listen links route through Songlink/Odesli to
        your streaming service. Those services see only what is needed to do their job.
      </p>
    </div>

    <div>
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">What we don't do</h2>
      <p class="mt-2 text-sm">
        No ads. No selling or sharing data. No analytics trackers following you around the web.
      </p>
    </div>

    <div>
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">Deletion</h2>
      <p class="mt-2 text-sm">
        Email
        <a
          href="mailto:bryan@mixtapestory.com"
          class="underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
          >bryan@mixtapestory.com</a
        >
        and your account and everything in it — mixtape, stories, visit history — will be deleted
        within 30 days.
      </p>
    </div>

    <div>
      <h2 class="text-xs uppercase tracking-wider text-ink-muted">Changes</h2>
      <p class="mt-2 text-sm">
        If the product's data practices change, this page changes with them. Last updated June
        2026.
      </p>
    </div>
  </section>

  <footer class="mt-10 border-t border-rule pt-6 text-sm text-ink-muted">
    <p class="text-xs">mixtapestory.com — Share the songs, share the stories.</p>
  </footer>
</main>
