// store-adapter.ts - Bridge welshman Svelte stores to React via useSyncExternalStore

import { useSyncExternalStore } from 'react'
import type { Readable } from 'svelte/store'

/**
 * React hook that bridges a welshman/Svelte Readable store to React.
 *
 * Svelte stores expose `{ subscribe }` which matches useSyncExternalStore's
 * subscribe signature (callback => unsubscribe). We wrap it to also provide
 * getSnapshot via a cached current value.
 *
 * @param store - A Svelte Readable store (from welshman)
 * @param serverValue - Value to return during SSR (when store is unavailable)
 */
export function useWelshmanStore<T>(
  store: Readable<T>,
  serverValue: T
): T {
  return useSyncExternalStore(
    (onChange) => {
      // Svelte subscribe calls the callback immediately with the current value,
      // then on every subsequent change. Returns an unsubscribe function.
      const unsubscribe = store.subscribe(onChange)
      return unsubscribe
    },
    () => {
      // getSnapshot: read current value by temporarily subscribing
      let value: T = serverValue
      const unsub = store.subscribe((v) => {
        value = v
      })
      unsub()
      return value
    },
    () => serverValue
  )
}

/**
 * Create a standalone snapshot getter for a Svelte store (non-hook usage).
 * Useful when you need the current value outside of React render.
 */
export function getStoreValue<T>(store: Readable<T>): T {
  let value: T
  const unsub = store.subscribe((v) => {
    value = v
  })
  unsub()
  return value!
}
