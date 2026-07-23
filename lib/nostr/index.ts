// index.ts - Nostr adapter factory

export * from './types'
export * from './key-derivation'
export * from './vault-crypto'
export * from './vault-sync'
export * from './events'
export * from './empty-adapter'
export * from './real-adapter'
export * from './mock-telegram-adapter'

import { EmptyNostrAdapter } from './empty-adapter'
import { RealNostrAdapter } from './real-adapter'
import { MockTelegramAdapter } from './mock-telegram-adapter'
import type { INostrAdapter, NostrSession } from './types'

export type AdapterMode = 'real' | 'mock-telegram' | 'empty'

import { store, StorageKey } from '@/lib/storage'

export function getAdapterMode(): AdapterMode {
  if (typeof window === 'undefined') return 'empty'
  return store.get(StorageKey.ADAPTER_MODE, 'real') as AdapterMode
}

export function setAdapterMode(mode: AdapterMode) {
  if (typeof window === 'undefined') return
  store.set(StorageKey.ADAPTER_MODE, mode)
}

export function createNostrAdapter(session?: NostrSession, relayUrls?: string[]): INostrAdapter {
  if (typeof window === 'undefined') return new EmptyNostrAdapter()

  const mode = getAdapterMode()

  if (mode === 'mock-telegram') {
    return new MockTelegramAdapter()
  }

  if (!session?.currentPubkey) return new EmptyNostrAdapter()

  const sessionWithKey = session as NostrSession & { currentPrivkey?: string }
  if (!sessionWithKey.currentPrivkey) return new EmptyNostrAdapter()

  return new RealNostrAdapter(session, relayUrls)
}
