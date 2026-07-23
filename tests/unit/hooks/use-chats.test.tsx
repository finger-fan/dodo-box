import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { useChats } from '@/hooks/nostr/use-chats'
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

const STUB_CHATS: NostrChat[] = [
  {
    id: '1',
    pubkey: 'b'.repeat(64),
    name: 'Alice',
    lastMsg: 'Hey!',
    time: '10:00',
    unread: 2,
    avatar: '',
  },
  {
    id: '2',
    pubkey: 'c'.repeat(64),
    name: 'Bob',
    lastMsg: 'See you later',
    time: '09:30',
    unread: 0,
    avatar: '',
  },
]

function createTestAdapter(
  overrides: Partial<INostrAdapter> = {}
): INostrAdapter {
  return {
    async getChats(): Promise<NostrChat[]> {
      return [...STUB_CHATS]
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

describe('useChats', () => {
  let adapter: INostrAdapter

  beforeEach(() => {
    adapter = createTestAdapter()
  })

  it('starts with initial loading state', () => {
    const { result } = renderHook(() => useChats(), {
      wrapper: makeWrapper(adapter),
    })

    // isLoading starts false and becomes true once refresh() runs
    expect(result.current.chats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('fetches chats successfully', async () => {
    const { result } = renderHook(() => useChats(), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.chats).toHaveLength(2)
    expect(result.current.chats[0].name).toBe('Alice')
    expect(result.current.chats[1].name).toBe('Bob')
    expect(result.current.error).toBeNull()
  })

  it('returns empty chats when none exist', async () => {
    const emptyAdapter = createTestAdapter({
      async getChats(): Promise<NostrChat[]> {
        return []
      },
    })

    const { result } = renderHook(() => useChats(), {
      wrapper: makeWrapper(emptyAdapter),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.chats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('does not fetch when not authenticated', async () => {
    const getChatsSpy = vi.fn()
    const spyAdapter = createTestAdapter({
      getChats: getChatsSpy,
    })
    const unauthSession: NostrSession = {
      ...TEST_SESSION,
      isAuthenticated: false,
    }

    const { result } = renderHook(() => useChats(), {
      wrapper: makeWrapper(spyAdapter, unauthSession),
    })

    // Wait a tick to confirm no fetch was triggered
    await new Promise((r) => setTimeout(r, 50))
    expect(getChatsSpy).not.toHaveBeenCalled()
    expect(result.current.chats).toEqual([])
  })

  it('sets error on fetch failure', async () => {
    const failAdapter = createTestAdapter({
      async getChats(): Promise<NostrChat[]> {
        throw new Error('Connection failed')
      },
    })

    const { result } = renderHook(() => useChats(), {
      wrapper: makeWrapper(failAdapter),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.chats).toEqual([])
    expect(result.current.error).toBe('Error: Connection failed')
  })
})
