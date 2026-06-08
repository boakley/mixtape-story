<!--
  Shared Expanded/Compact pill toggle.

  Pure presentation since the localStorage hookup moved into the
  useStoredState rune. Consumers seed the state with the rune and pass
  the bindable property in — both the personal mixtape page (`/{handle}`)
  and the group landing's song tabs (`/g/{slug}`) do this so the choice
  carries between them via the `mixtapestory:view` key.
-->
<script lang="ts" module>
  export type View = 'expanded' | 'compact';
</script>

<script lang="ts">
  type Props = { view?: View };
  let { view = $bindable('compact') }: Props = $props();
</script>

<div class="inline-flex shrink-0 rounded-full border border-rule p-0.5 text-xs">
  <button
    type="button"
    onclick={() => (view = 'expanded')}
    aria-pressed={view === 'expanded'}
    class="rounded-full px-3 py-1 transition-colors {view === 'expanded'
      ? 'bg-ink text-paper'
      : 'text-ink-muted hover:text-ink'}"
  >
    Expanded
  </button>
  <button
    type="button"
    onclick={() => (view = 'compact')}
    aria-pressed={view === 'compact'}
    class="rounded-full px-3 py-1 transition-colors {view === 'compact'
      ? 'bg-ink text-paper'
      : 'text-ink-muted hover:text-ink'}"
  >
    Compact
  </button>
</div>
