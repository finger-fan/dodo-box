import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNostrAdapter } from '@/lib/nostr/index'
import { EmptyNostrAdapter } from '@/lib/nostr/empty-adapter'
import type { NostrSession } from '@/lib/nostr/types'

describe('createNostrAdapter factory', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
  })

  it('returns EmptyNostrAdapter on SSR', () => {
    const adapter = createNostrAdapter()
    expect(adapter).toBeInstanceOf(EmptyNostrAdapter)
  })

  it('returns EmptyNostrAdapter when no session', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as unknown as Storage)
    const adapter = createNostrAdapter()
    expect(adapter).toBeInstanceOf(EmptyNostrAdapter)
  })

  it('returns EmptyNostrAdapter when session has no pubkey', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as unknown as Storage)
    const session: NostrSession = {
      isAuthenticated: true,
      username: 'test',
      currentPubkey: null,
      vaultData: null,
    }
    const adapter = createNostrAdapter(session)
    expect(adapter).toBeInstanceOf(EmptyNostrAdapter)
  })

  it('returns EmptyNostrAdapter when session has pubkey but no privkey', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => 'real',
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as unknown as Storage)
    const session: NostrSession = {
      isAuthenticated: true,
      username: 'test',
      currentPubkey: 'a'.repeat(64),
      vaultData: null,
    }
    const adapter = createNostrAdapter(session)
    expect(adapter).toBeInstanceOf(EmptyNostrAdapter)
  })
})
