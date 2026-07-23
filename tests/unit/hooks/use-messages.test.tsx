import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { useMessages } from '@/hooks/nostr/use-messages'
import { NostrContext } from '@/contexts/NostrContext'
import type {
  NostrSession,
  INostrAdapter,
  NostrChat,
  NostrMessage,
  NostrContact,
  NostrProfile,
  NostrResult,
} from '@/lib/nostr/types'

const TEST_PUBKEY = 'a'.repeat(64)
const CONTACT_PUBKEY = 'b'.repeat(64)

function makeMessage(id: string, text: string): NostrMessage {
  return {
    id,
    text,
    sender: 'them',
    timestamp: new Date(1700000000000),
    senderPubkey: CONTACT_PUBKEY,
  }
}

function createTestAdapter(
  overrides: Partial<INostrAdapter> = {}
): INostrAdapter {
  return {
    async getChats(): Promise<NostrChat[]> {
      return []
    },
    async getMessages(): Promise<NostrMessage[]> {
      return []
    },
    async sendMessage(): Promise<NostrResult<NostrMessage>> {
      return { success: false, error: 'Not implemented' }
    },
    subscribeToMessages(): () => void {
      return () => {}
    },
    async getContacts(): Promise<NostrContact[]> {
      return []
    },
    async addContact(): Promise<NostrResult<NostrContact>> {
      return { success: false, error: 'Not implemented' }
    },
    async removeContact(): Promise<NostrResult> {
      return { success: false, error: 'Not implemented' }
    },
    async getProfile(): Promise<NostrProfile | null> {
      return null
    },
    async updateProfile(): Promise<NostrResult> {
      return { success: true, data: undefined }
    },
    getRelays(): string[] {
      return []
    },
    async setRelays(): Promise<NostrResult> {
      return { success: true, data: undefined }
    },
    async recoverMessages(): Promise<NostrMessage[]> {
      return []
    },
    ...overrides,
  }
}

const TEST_SESSION: NostrSession = {
  isAuthenticated: true,
  username: 'testuser',
  currentPubkey: TEST_PUBKEY,
  vaultData: null,
}

function makeWrapper(adapter: INostrAdapter, session: NostrSession = TEST_SESSION) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NostrContext.Provider
        value={{
          session,
          adapter,
          login: vi.fn(),
          register: vi.fn(),
          unlock: vi.fn(),
          logout: vi.fn(),
          switchIdentity: vi.fn(),
          createIdentity: vi.fn(),
          deleteIdentity: vi.fn(),
          deleteAllIdentities: vi.fn(),
          updateIdentity: vi.fn(),
          adapterMode: 'mock-telegram',
          setAdapterMode: vi.fn(),
        }}
      >
        {children}
      </NostrContext.Provider>
    )
  }
}

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dedups subscription messages that were already fetched', async () => {
    const fetched = makeMessage('msg-1', 'hello')
    let subscriptionCallback: ((msg: NostrMessage) => void) | undefined

    const adapter = createTestAdapter({
      async getMessages(): Promise<NostrMessage[]> {
        return [fetched]
      },
      subscribeToMessages(_pubkey: string, cb: (msg: NostrMessage) => void): () => void {
        subscriptionCallback = cb
        return () => {}
      },
    })

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })
    expect(subscriptionCallback).toBeDefined()

    // The relay replays history on subscribe: the same event arrives again
    act(() => {
      subscriptionCallback!(fetched)
    })
    expect(result.current.messages).toHaveLength(1)

    // A genuinely new message is appended
    act(() => {
      subscriptionCallback!(makeMessage('msg-2', 'new message'))
    })
    expect(result.current.messages).toHaveLength(2)
  })
})
