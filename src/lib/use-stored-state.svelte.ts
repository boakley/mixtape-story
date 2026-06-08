// Small rune that wraps the localStorage-backed state pattern.
//
// Four call sites in the group landing + personal page share the same
// logic: $state with a default, $effect to hydrate from localStorage
// on the client, a setter that writes through. Centralizing here lets
// call sites shrink to one declaration and removes the chance of
// stale try/catch boilerplate drifting between them.
//
// Generic on T so the same helper covers string-shaped state (tabs,
// view) and boolean-shaped state (steward-section open/closed). The
// caller provides `parse` to turn the localStorage string back into T;
// `serialize` defaults to `String(value)` which is correct for both
// strings ("compact") and booleans ("true"/"false").
//
// SSR-safe: $effect only runs on the client, so initial server-render
// uses `defaultValue`. The localStorage write is wrapped in try/catch
// — private-mode browsers and disabled-storage paths are non-fatal (a
// next-mount read will just miss).

export type StoredState<T> = {
  get value(): T;
  set value(next: T);
};

export function useStoredState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string = String
): StoredState<T> {
  let current = $state<T>(defaultValue);

  $effect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return;
      const parsed = parse(stored);
      if (parsed !== undefined) current = parsed;
    } catch {
      // private mode / disabled — leave default
    }
  });

  return {
    get value() {
      return current;
    },
    set value(next: T) {
      current = next;
      try {
        localStorage.setItem(key, serialize(next));
      } catch {
        // ignore
      }
    }
  };
}
