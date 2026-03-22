// index.ts - Nostr adapter factory

export * from './types'
export * from './key-derivation'
export * from './vault-crypto'
export * from './vault-sync'
export * from './events'
export * from './empty-adapter'
export * from './real-adapter'

import { EmptyNostrAdapter } from './empty-adapter'
import { RealNostrAdapter } from './real-adapter'
import type { INostrAdapter, NostrSession } from './types'

export function createNostrAdapter(session?: NostrSession): INostrAdapter {
  if (typeof window === 'undefined') return new EmptyNostrAdapter()

  if (!session?.currentPubkey) return new EmptyNostrAdapter()

  const sessionWithKey = session as NostrSession & { currentPrivkey?: string }
  if (!sessionWithKey.currentPrivkey) return new EmptyNostrAdapter()

  return new RealNostrAdapter(session)
}
