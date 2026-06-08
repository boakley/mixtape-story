<!--
  Inline-edit form used by the steward's name + description editors on
  the group landing.

  Scope is deliberately narrow: just the form portion (input/textarea
  + char counter + Save/Cancel + enhance hookup). The idle view (e.g.
  the h1 and the pencil button that opens the form) stays in the
  parent because its markup varies meaningfully between fields — an
  h1 with a large pencil for name vs. a paragraph with an inline
  baseline-aligned pencil for description.

  The component is rendered only when `open` is true; the parent does
  the `{#if open}` wrap. `open` is bindable so a successful save can
  flip it back to false from the enhance success callback (see
  reference_sveltekit_enhance_cleanup memory: clearing state in the
  cancel button's onclick is fine because no submit is happening, but
  clearing on a successful submit must wait for enhance to fire).

  Caller passes the action-specific error message string (already
  narrowed from the form payload) rather than the raw payload, so the
  component doesn't need to know about the discriminated key (`name`,
  `description`, `invite`, ...).
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';

  type Props = {
    /** Bindable: form is shown when true; flips to false on Cancel or
     *  on successful Save. */
    open: boolean;
    /** Used as the input's sr-only label and the field id prefix. */
    label: string;
    /** SvelteKit form action path, e.g. '?/editName'. */
    formAction: string;
    /** name attribute on the input/textarea — must match what the
     *  server action's request.formData().get(...) expects. */
    fieldName: string;
    /** Initial value, displayed and editable. */
    initialValue: string;
    /** Hard max for both client maxlength and the char counter. */
    maxLength: number;
    /** Render a 3-row textarea instead of a single-line input. */
    multiline?: boolean;
    /** Extra Tailwind for the input/textarea — typically font size
     *  classes so the input visually matches the field it replaces
     *  (e.g. text-3xl for an h1 name field). */
    inputClass?: string;
    /** Server-side error string for this field, already narrowed from
     *  the action's form payload. Empty/undefined = no error. */
    errorMessage?: string | undefined;
  };

  let {
    open = $bindable(),
    label,
    formAction,
    fieldName,
    initialValue,
    maxLength,
    multiline = false,
    inputClass = '',
    errorMessage
  }: Props = $props();

  // `untrack` makes the "captures only initial value" intent explicit —
  // the input is supposed to be seeded once from the current saved
  // value, then track user edits. Parent prop changes shouldn't blow
  // away in-flight edits.
  let value = $state(untrack(() => initialValue));
  const fieldId = $derived(`inline-edit-${fieldName}`);

  // Focus the input/textarea when the form mounts. Done via a use:
  // action rather than autofocus to avoid svelte's a11y rule (that
  // rule targets page-load autofocus; here focus is response to a
  // user click, so an action is the cleaner expression).
  function focusOnMount(node: HTMLElement): void {
    node.focus();
  }
</script>

<form
  method="POST"
  action={formAction}
  class="mt-2"
  use:enhance={() => {
    return async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success') open = false;
    };
  }}
>
  <label class="sr-only" for={fieldId}>{label}</label>
  {#if multiline}
    <textarea
      id={fieldId}
      name={fieldName}
      rows="3"
      maxlength={maxLength}
      bind:value
      use:focusOnMount
      class="block w-full rounded-md border border-rule bg-paper px-3 py-2 text-ink focus:border-accent focus:outline-none {inputClass}"
    ></textarea>
  {:else}
    <input
      id={fieldId}
      name={fieldName}
      type="text"
      maxlength={maxLength}
      bind:value
      use:focusOnMount
      class="block w-full rounded-md border border-rule bg-paper px-3 py-2 text-ink focus:border-accent focus:outline-none {inputClass}"
    />
  {/if}
  <div class="mt-2 flex items-center justify-between gap-3">
    <p class="text-xs text-ink-muted">{value.length}/{maxLength}</p>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (open = false)}
        class="rounded-md px-3 py-1 text-xs text-ink-muted hover:text-accent"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-md bg-ink px-3 py-1 text-xs text-paper hover:opacity-90"
      >
        Save
      </button>
    </div>
  </div>
  {#if errorMessage}
    <p role="alert" class="mt-1 text-xs text-accent">{errorMessage}</p>
  {/if}
</form>
