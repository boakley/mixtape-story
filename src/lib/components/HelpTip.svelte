<!--
  Small `(?)` info icon that opens a popover on click. Click-to-toggle
  rather than hover so the affordance works on touch devices too.

  Closes on:
  - Click outside the icon or popover
  - Esc key while focus is inside the popover area
  - Click the icon again

  Positions the popover above the icon by default; flips below if there
  isn't enough room. The popover is a child of the host so it inherits
  the page's font and color tokens automatically.
-->
<script lang="ts">
  type Props = {
    /** Short label for the field this tip refers to. Used in aria-label. */
    label: string;
    /** Body text; one or two sentences. Plain text only. */
    children: import('svelte').Snippet;
  };

  let { label, children }: Props = $props();

  let open = $state(false);
  let containerEl: HTMLSpanElement | undefined = $state();

  function toggle(): void {
    // We don't stopPropagation here: each HelpTip's document-click
    // handler relies on the bubbling click to close *other* open tips
    // when a different (?) is clicked. The label-redirect concern that
    // motivated the earlier stopPropagation doesn't apply — when the
    // click target is a form control (this <button>), the wrapping
    // <label> doesn't redirect.
    open = !open;
  }

  function close(): void {
    open = false;
  }

  function handleDocumentClick(e: MouseEvent): void {
    if (!open) return;
    if (containerEl && e.target instanceof Node && !containerEl.contains(e.target)) {
      close();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (open && e.key === 'Escape') {
      close();
      // Return focus to the trigger so keyboard users keep their place.
      (containerEl?.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  }
</script>

<svelte:document onclick={handleDocumentClick} onkeydown={handleKeydown} />

<span bind:this={containerEl} class="relative inline-flex items-center">
  <button
    type="button"
    onclick={toggle}
    aria-label="Help: {label}"
    aria-expanded={open}
    class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule text-[10px] leading-none text-ink-muted transition-colors hover:border-accent hover:text-accent {open
      ? 'border-accent text-accent'
      : ''}"
  >
    ?
  </button>
  {#if open}
    <span
      role="tooltip"
      class="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-rule bg-paper px-3 py-2 text-xs leading-snug text-ink shadow-md"
    >
      {@render children()}
      <!-- Small triangular notch below the popover, pointing at the icon. -->
      <span
        aria-hidden="true"
        class="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-rule bg-paper"
      ></span>
    </span>
  {/if}
</span>
