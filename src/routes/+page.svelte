<script lang="ts">
  import LandingHero from '$lib/components/poc/LandingHero.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };
  let { data }: Props = $props();
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

<LandingHero handles={data.handles} />
