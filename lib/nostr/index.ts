// index.ts - Nostr 适配器工厂

export * from './types'
export * from './key-derivation'
export * from './vault-crypto'
export * from './vault-sync'
export * from './events'
export * from './mock-adapter'
export * from './real-adapter'
export * from './storage'

import { MockNostrAdapter } from './mock-adapter'
import { RealNostrAdapter } from './real-adapter'
import type { INostrAdapter, NostrSession } from './types'

export function createNostrAdapter(session?: NostrSession): INostrAdapter {
  if (typeof window === 'undefined') return new MockNostrAdapter()

  const envMock = process.env.NEXT_PUBLIC_NOSTR_MOCK
  const localMock = localStorage.getItem('dodobox_nostr_mock')

  const isMock =
    envMock === 'true' ||
    (localMock === 'true' && envMock !== 'false')

  if (isMock) return new MockNostrAdapter()
  if (!session?.currentPubkey) return new MockNostrAdapter()

  const sessionWithKey = session as NostrSession & { currentPrivkey?: string }
  if (!sessionWithKey.currentPrivkey) return new MockNostrAdapter()

  return new RealNostrAdapter(session)
}
