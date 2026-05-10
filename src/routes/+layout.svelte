<script lang="ts">
  import '../app.css';
  import type { LayoutData } from './$types';

  type Props = { data: LayoutData; children: () => unknown };
  let { data, children }: Props = $props();
</script>

{@render children()}

{#if data.user}
  <div
    class="fixed bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-rule bg-paper px-3 py-1 text-xs text-ink-muted shadow-sm"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
    <span class="truncate max-w-[16rem]">{data.user.email}</span>
    <form method="POST" action="/logout" class="contents">
      <button type="submit" class="text-ink hover:text-accent">Sign out</button>
    </form>
  </div>
{/if}
