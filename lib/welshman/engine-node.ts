// engine-node.ts - Node.js compatible welshman initialization
// Thin wrapper around engine.ts with nodeMode=true.
// Both CLI and web share the SAME pool/tracker singletons via engine.ts.

import { initEngine, destroyEngine } from './engine'

let initialized = false

/**
 * Initialize welshman for Node.js environments.
 * Skips Repository (IndexedDB) and WrapManager since they're browser-only.
 */
export function initNodeEngine(): void {
  if (initialized) return
  initEngine({ nodeMode: true })
  initialized = true
}

export function destroyNodeEngine(): void {
  destroyEngine()
  initialized = false
}
