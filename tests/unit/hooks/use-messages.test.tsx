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

function makeMessage(id: string, text: string, timestampMs = 1700000000000): NostrMessage {
  return {
    id,
    text,
    sender: 'them',
    timestamp: new Date(timestampMs),
    senderPubkey: CONTACT_PUBKEY,
  }
}

const PAGE_SIZE = 50
const REPLAY_MARGIN_SECONDS = 28 * 60 * 60

function makePage(prefix: string, count: number, startTsMs: number, stepMs = 1000): NostrMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage(`${prefix}-${i}`, `msg ${prefix}-${i}`, startTsMs + i * stepMs)
  )
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

describe('useMessages pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the first page with a limit and sets hasMore=false for a short page', async () => {
    const getMessages = vi.fn(async (): Promise<NostrMessage[]> => makePage('p1', 10, 1000000))
    const adapter = createTestAdapter({ getMessages })

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(10)
    })
    expect(getMessages).toHaveBeenCalledWith(CONTACT_PUBKEY, { limit: PAGE_SIZE })
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps hasMore=true when the first page is full', async () => {
    const getMessages = vi.fn(async (): Promise<NostrMessage[]> => makePage('p1', PAGE_SIZE, 1000000))
    const adapter = createTestAdapter({ getMessages })

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(PAGE_SIZE)
    })
    expect(result.current.hasMore).toBe(true)
  })

  it('loadOlder fetches with until = earliest - 28h and prepends older messages', async () => {
    const firstPage = makePage('p1', PAGE_SIZE, 2000000)
    const olderPage = makePage('p0', 20, 1000000)
    const getMessages = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(olderPage)
    const adapter = createTestAdapter({ getMessages })

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(PAGE_SIZE)
    })

    await act(async () => {
      await result.current.loadOlder()
    })

    const expectedUntil = Math.floor(2000000 / 1000) - REPLAY_MARGIN_SECONDS
    expect(getMessages).toHaveBeenNthCalledWith(2, CONTACT_PUBKEY, { until: expectedUntil, limit: PAGE_SIZE })
    expect(result.current.messages).toHaveLength(PAGE_SIZE + 20)
    // Older messages end up at the front
    expect(result.current.messages[0].id).toBe('p0-0')
    expect(result.current.hasMore).toBe(false) // short page => history exhausted
  })

  it('sets hasMore=false when the older page is all duplicates', async () => {
    const firstPage = makePage('p1', PAGE_SIZE, 2000000)
    // Relay replays events we already have (gift-wrap created_at overlap)
    const getMessages = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(firstPage.slice(0, PAGE_SIZE))
    const adapter = createTestAdapter({ getMessages })

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(PAGE_SIZE)
    })

    await act(async () => {
      await result.current.loadOlder()
    })

    expect(result.current.messages).toHaveLength(PAGE_SIZE)
    expect(result.current.hasMore).toBe(false)
  })

  it('does not issue concurrent loadOlder fetches', async () => {
    const firstPage = makePage('p1', PAGE_SIZE, 2000000)
    let resolveOlder: (msgs: NostrMessage[]) => void = () => {}
    const getMessages = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => new Promise<NostrMessage[]>((res) => { resolveOlder = res }))
    const adapter = createTestAdapter({ getMessages })

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(PAGE_SIZE)
    })

    // Fire two loadOlder calls while the first page fetch is still in flight
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.loadOlder()
    })
    expect(result.current.isLoadingOlder).toBe(true)
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(getMessages).toHaveBeenCalledTimes(2) // initial + one loadOlder only

    await act(async () => {
      resolveOlder(makePage('p0', 5, 1000000))
      await first
    })
    expect(result.current.messages).toHaveLength(PAGE_SIZE + 5)
    expect(result.current.isLoadingOlder).toBe(false)
  })
})
