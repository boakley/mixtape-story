<script lang="ts">
  import LandingHero from '$lib/components/poc/LandingHero.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };
  let { data }: Props = $props();

  // CTA shape depends on auth state. The same primary button serves three
  // different journeys; copy + destination shifts based on what the visitor
  // already has.
  const cta = $derived(
    data.user && data.viewerHandle
      ? { label: 'Continue to your mixtape →', href: `/${data.viewerHandle}` }
      : data.user
        ? { label: 'Claim your handle →', href: '/onboarding' }
        : { label: 'Make your own mixtape →', href: '/login' }
  );
</script>

<svelte:head>
  <title>mixtapestory.com — share the songs, share the stories</title>
  <meta
    name="description"
    content="Mixtape stories: a curated set of songs, each with writing about why that song matters. In private testing."
  />
  <meta property="og:title" content="mixtapestory.com" />
  <meta property="og:description" content="Share the songs, share the stories." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://mixtapestory.com/" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="mixtapestory.com" />
  <meta name="twitter:description" content="Share the songs, share the stories." />
</svelte:head>

<LandingHero {cta} />
