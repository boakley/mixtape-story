<!--
  First-Listen chooser: the modal that pops on the first Listen tap
  when the visitor has no stored preference. Three deep-linkable
  services + an "Other service" escape hatch that picks Odesli
  explicitly (so we never re-prompt).

  Implementation uses the native <dialog> element + showModal(), which
  gives us a real backdrop, a focus trap, Esc-to-close, and
  focus-return-to-opener for free. The component is pure
  presentation: the caller passes `onPick(pref)` and writes the cookie
  itself — that keeps the modal usable from both the click-intercept
  path on the mixtape page and the explicit "Listen with" menu item
  in the layout ☰.
-->
<script lang="ts">
  import { LISTEN_SERVICES, type ListenPref } from '$lib/listen';

  type Props = {
    /** Bindable: parent flips true to open; modal flips false on
     *  pick / Esc / backdrop click. */
    open: boolean;
    /** Called with the user's choice. Caller persists + acts on it. */
    onPick: (pref: ListenPref) => void;
  };
  let { open = $bindable(false), onPick }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();

  // Mirror the bindable `open` into the native dialog's showModal/
  // close so the dialog opens/closes in response to parent state. The
  // dialog's own close event (Esc, backdrop click via the form-method-
  // dialog convention) also flips `open` back to false so parent
  // state stays in sync.
  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    else if (!open && dialogEl.open) dialogEl.close();
  });

  function pick(pref: ListenPref): void {
    onPick(pref);
    open = false;
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={() => (open = false)}
  aria-labelledby="listen-chooser-title"
  aria-describedby="listen-chooser-desc"
  class="m-auto w-full max-w-sm rounded-2xl border border-rule bg-paper p-6 shadow-xl backdrop:bg-ink/30"
>
  <h2 id="listen-chooser-title" class="text-lg font-medium text-ink">
    Where do you listen?
  </h2>
  <p id="listen-chooser-desc" class="mt-2 text-sm leading-snug text-ink-muted">
    Pick a service and we'll open songs there directly — straight to the song.
    Skip it and you'll land on a chooser page instead.
  </p>

  <div class="mt-5 flex flex-col gap-2">
    <button
      type="button"
      onclick={() => pick('apple')}
      class="rounded-md border border-rule bg-paper px-4 py-3 text-left text-sm text-ink hover:border-accent hover:text-accent"
    >
      {LISTEN_SERVICES.apple.label}
    </button>
    <button
      type="button"
      onclick={() => pick('spotify')}
      class="rounded-md border border-rule bg-paper px-4 py-3 text-left text-sm text-ink hover:border-accent hover:text-accent"
    >
      {LISTEN_SERVICES.spotify.label}
    </button>
    <button
      type="button"
      onclick={() => pick('youtube')}
      class="rounded-md border border-rule bg-paper px-4 py-3 text-left text-sm text-ink hover:border-accent hover:text-accent"
    >
      {LISTEN_SERVICES.youtube.label}
    </button>
  </div>

  <button
    type="button"
    onclick={() => pick('other')}
    class="mt-4 text-xs text-ink-muted underline decoration-rule underline-offset-2 hover:text-accent"
  >
    Other service — show me the chooser →
  </button>

  <p class="mt-4 text-xs text-ink-muted">
    Change this anytime from the menu.
  </p>
</dialog>
