/**
 * Generic pub/sub store. Module-scoped state, synchronous reads,
 * fan-out writes. Designed to back React hooks that need to share
 * state across consumers without a Context Provider.
 *
 * Why this exists: `useState` inside a custom hook gives each
 * caller its own state. Two `useSettings()` consumers get two
 * disjoint states; one of them setting theme doesn't propagate to
 * the other. A shared store fixes that.
 *
 * Kept generic (no React, no localStorage, no IPC) so the
 * subscribe/notify mechanics can be tested in pure Node.
 */

export interface Store<T> {
  get(): T
  set(next: T): void
  update(updater: (prev: T) => T): void
  subscribe(listener: (value: T) => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<(v: T) => void>()
  return {
    get: () => value,
    set(next) {
      if (Object.is(value, next)) return
      value = next
      for (const l of listeners) l(value)
    },
    update(updater) {
      const next = updater(value)
      if (Object.is(value, next)) return
      value = next
      for (const l of listeners) l(value)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
