<script lang="ts">
  type Props = { url: string; title: string; onClose: () => void };
  let { url, title, onClose }: Props = $props();

  // QR rendered as inline SVG, generated lazily (the qrcode lib is dynamically
  // imported by the parent's open handler, so it never touches the main bundle
  // or the server). dark = ink on a white field for maximum scan contrast.
  let svg = $state<string | null>(null);
  let pngHref = $state<string | null>(null);
  let failed = $state(false);
  let closeButton = $state<HTMLButtonElement>();

  $effect(() => {
    let cancelled = false;
    import('qrcode')
      .then(async ({ default: QRCode }) => {
        const [svgOut, png] = await Promise.all([
          QRCode.toString(url, {
            type: 'svg',
            margin: 1,
            color: { dark: '#1a1816', light: '#ffffff' }
          }),
          QRCode.toDataURL(url, {
            margin: 2,
            width: 720,
            color: { dark: '#1a1816', light: '#ffffff' }
          })
        ]);
        if (cancelled) return;
        svg = svgOut;
        pngHref = png;
      })
      .catch(() => {
        if (!cancelled) failed = true;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    closeButton?.focus();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  // Filename like "sams-mixtape-qr.png" from the title.
  const downloadName = $derived(
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-qr.png`
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-5"
  role="dialog"
  aria-modal="true"
  aria-labelledby="qr-dialog-title"
  tabindex="-1"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
  onkeydown={() => {}}
>
  <div class="w-full max-w-xs rounded-lg border border-rule bg-paper p-5 shadow-md">
    <div class="mb-3 flex items-baseline justify-between gap-3">
      <h2 id="qr-dialog-title" class="text-base text-ink">Scan to open</h2>
      <button
        type="button"
        bind:this={closeButton}
        onclick={onClose}
        aria-label="Close"
        class="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-ink-muted hover:text-accent"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 2 L12 12 M12 2 L2 12" />
        </svg>
      </button>
    </div>

    <div class="qr mx-auto aspect-square w-full max-w-[15rem] rounded-md bg-white p-3">
      {#if svg}
        <!-- qrcode SVG output: static, no script, no external refs. -->
        {@html svg}
      {:else if failed}
        <div class="flex h-full items-center justify-center text-center text-sm text-ink-muted">
          Couldn't generate a QR code.
        </div>
      {/if}
    </div>

    <p class="mt-3 break-all text-center text-xs text-ink-muted">{url}</p>

    {#if pngHref}
      <p class="mt-3 text-center text-sm">
        <a
          href={pngHref}
          download={downloadName}
          class="text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
        >
          Save image
        </a>
      </p>
    {/if}
  </div>
</div>

<style>
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
