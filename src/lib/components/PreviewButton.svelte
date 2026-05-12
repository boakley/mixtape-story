<script lang="ts">
  // Inline 30-second iTunes preview. Renders a small ▷/❚❚ toggle plus a hidden
  // <audio> element. Used as a placeholder Listen affordance while the Odesli
  // universal URL is still being resolved (or failed to resolve).

  type Props = { url: string };
  let { url }: Props = $props();

  let audioEl: HTMLAudioElement | undefined = $state();
  let playing = $state(false);

  function toggle() {
    if (!audioEl) return;
    if (playing) {
      audioEl.pause();
    } else {
      audioEl.play().catch(() => {
        playing = false;
      });
    }
  }
</script>

<span class="inline-flex shrink-0 items-center gap-1.5 text-sm">
  <button
    type="button"
    onclick={toggle}
    aria-label={playing ? 'Pause preview' : 'Play 30-second preview'}
    title={playing ? 'Pause preview' : 'Preview (30s)'}
    class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-rule text-ink-muted hover:border-accent hover:text-accent"
  >
    {#if playing}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="2" y="1.5" width="2" height="7" fill="currentColor" />
        <rect x="6" y="1.5" width="2" height="7" fill="currentColor" />
      </svg>
    {:else}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.5 1.5 L8.5 5 L2.5 8.5 Z" fill="currentColor" />
      </svg>
    {/if}
  </button>
  <span class="text-ink-muted">Preview</span>
  <!-- svelte-ignore a11y_media_has_caption -->
  <audio
    bind:this={audioEl}
    src={url}
    preload="none"
    onplay={() => (playing = true)}
    onpause={() => (playing = false)}
    onended={() => (playing = false)}
  ></audio>
</span>
