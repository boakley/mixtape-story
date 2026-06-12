<script lang="ts">
  import { enhance } from '$app/forms';
  import BrandCap from '$lib/components/BrandCap.svelte';
  import HelpTip from '$lib/components/HelpTip.svelte';
  import type { ActionData, PageData } from './$types';

  type Props = { data: PageData; form: ActionData };
  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>New mixtape for {data.groupName} — mixtapestory.com</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
  <BrandCap />
  <h1 class="mt-2 text-3xl leading-tight text-ink">New mixtape for {data.groupName}</h1>
  <p class="mt-2 text-sm text-ink-muted">
    It will live at <span class="text-ink">mixtapestory.com/{data.handle}/{data.groupSlug}</span>
    and be shared with this group.
  </p>

  {#if data.alreadyExists}
    <p class="mt-4 text-sm text-ink-muted">
      You already have a mixtape named after this group —
      <a
        href="/{data.handle}/{data.groupSlug}"
        class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
        >it's here</a
      >.
    </p>
  {:else}
    <form method="POST" action="?/create" use:enhance class="mt-6 space-y-5">
      <div>
        <span class="inline-flex items-center gap-1.5">
          <label class="text-xs uppercase tracking-wider text-ink-muted" for="mixtape-name">
            Mixtape name
          </label>
          <HelpTip label="Mixtape name">
            How this mixtape appears in the group, in your menu, and as
            the page title. You can change it later.
          </HelpTip>
        </span>
        <input
          id="mixtape-name"
          type="text"
          name="name"
          required
          maxlength="100"
          value={form && 'error' in form ? '' : `${data.groupName} mixtape`}
          class="mt-1 w-full rounded-md border border-rule px-3 py-2 text-sm"
        />
      </div>

      <fieldset>
        <legend class="text-xs uppercase tracking-wider text-ink-muted">
          <span class="inline-flex items-center gap-1.5">
            Start from
            <HelpTip label="Start from">
              Blank starts empty. Copying brings every song and story
              across; the copy is fully yours afterward — edits here never
              touch the original.
            </HelpTip>
          </span>
        </legend>
        <div class="mt-2 space-y-2">
          <label class="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="start" value="blank" checked class="accent-[#b04a2f]" />
            Blank
          </label>
          {#each data.sources as source (source.id)}
            <label class="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="start" value={source.id} class="accent-[#b04a2f]" />
              Copy of {source.name}
            </label>
          {/each}
        </div>
      </fieldset>

      <button
        type="submit"
        class="rounded-md bg-accent px-4 py-2 text-sm text-paper hover:bg-ink"
      >
        Create mixtape
      </button>

      {#if form && 'error' in form && form.error}
        <p role="alert" class="text-sm text-accent">{form.error}</p>
      {/if}
    </form>
  {/if}
</main>
