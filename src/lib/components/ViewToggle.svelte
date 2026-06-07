<!--
  Shared expanded/compact toggle.

  Owns the localStorage hookup so the choice persists across both the
  personal mixtape page (`/{handle}`) and the group landing's song tabs
  (`/g/{slug}`). Reading from `mixtapestory:view`, the same key used since
  the personal page introduced this toggle — toggling on one page carries
  to the other, which is the "consistent across pages" behavior we want.

  Pure presentation otherwise: `view` is bindable so consumers can react
  (passing it down to `<SongRow view={view} />`, gating an `{#if}`, etc.).
-->
<script lang="ts" module>
  export type View = 'expanded' | 'compact';
</script>

<script lang="ts">
  type Props = { view?: View };
  let { view = $bindable('compact') }: Props = $props();

  const STORAGE_KEY = 'mixtapestory:view';

  // Read once on client mount; SSR keeps the default. Private-mode /
  // disabled-storage browsers fall through silently.
  $effect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'compact' || saved === 'expanded') view = saved;
    } catch {
      // ignore
    }
  });

  function setView(next: View): void {
    view = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }
</script>

<div class="inline-flex shrink-0 rounded-full border border-rule p-0.5 text-xs">
  <button
    type="button"
    onclick={() => setView('expanded')}
    aria-pressed={view === 'expanded'}
    class="rounded-full px-3 py-1 transition-colors {view === 'expanded'
      ? 'bg-ink text-paper'
      : 'text-ink-muted hover:text-ink'}"
  >
    Expanded
  </button>
  <button
    type="button"
    onclick={() => setView('compact')}
    aria-pressed={view === 'compact'}
    class="rounded-full px-3 py-1 transition-colors {view === 'compact'
      ? 'bg-ink text-paper'
      : 'text-ink-muted hover:text-ink'}"
  >
    Compact
  </button>
</div>
