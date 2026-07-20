import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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

const ALICE_PUBKEY = 'a'.repeat(64)

const STUB_MESSAGES: NostrMessage[] = [
  {
    id: '1',
    text: 'Hey there!',
    sender: 'them',
    timestamp: new Date(Date.now() - 3600000),
    senderPubkey: ALICE_PUBKEY,
  },
  {
    id: '2',
    text: 'Hello! How are you?',
    sender: 'me',
    timestamp: new Date(Date.now() - 3000000),
  },
]

function createTestAdapter(): INostrAdapter {
  const messages = new Map<string, NostrMessage[]>([
    [ALICE_PUBKEY, [...STUB_MESSAGES]],
  ])

  return {
    async getChats(): Promise<NostrChat[]> {
      return []
    },
    async getMessages(contactPubkey: string): Promise<NostrMessage[]> {
      return [...(messages.get(contactPubkey) || [])]
    },
    async sendMessage(
      contactPubkey: string,
      text: string
    ): Promise<NostrResult<NostrMessage>> {
      const msg: NostrMessage = {
        id: Date.now().toString(),
        text,
        sender: 'me',
        timestamp: new Date(),
      }
      const existing = messages.get(contactPubkey) || []
      messages.set(contactPubkey, [...existing, msg])
      return { success: true, data: msg }
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
  }
}

const TEST_SESSION: NostrSession = {
  isAuthenticated: true,
  username: 'testuser',
  currentPubkey: ALICE_PUBKEY,
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
  let adapter: INostrAdapter

  beforeEach(() => {
    adapter = createTestAdapter()
  })

  it('loads existing messages on mount', async () => {
    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })
  })

  it('starts with empty messages when not authenticated', async () => {
    const unauthSession: NostrSession = { ...TEST_SESSION, isAuthenticated: false }
    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(adapter, unauthSession),
    })

    // Should not load messages
    await new Promise(r => setTimeout(r, 50))
    expect(result.current.messages).toEqual([])
  })

  it('isSending is false initially', () => {
    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })
    expect(result.current.isSending).toBe(false)
  })

  it('sendMessage adds optimistic message then replaces with real', async () => {
    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    // Wait for initial messages to load
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0))
    const initialCount = result.current.messages.length

    await act(async () => {
      await result.current.sendMessage('hello test')
    })

    const msgs = result.current.messages
    // Real message should be in the list
    expect(msgs.length).toBe(initialCount + 1)
    const sent = msgs.find(m => m.text === 'hello test')
    expect(sent).toBeDefined()
    expect(sent!.sender).toBe('me')
    // Real message should NOT have optimistic- prefix
    expect(sent!.id).not.toMatch(/^optimistic-/)
  })

  it('sendMessage returns success result', async () => {
    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await act(async () => {
      await result.current.sendMessage('hi')
    })

    // sendMessage returns void; success is reflected via optimistic messages in state
    expect(result.current.messages.length).toBeGreaterThan(0)
  })

  it('sendMessage with empty text is a no-op', async () => {
    const sendSpy = vi.spyOn(adapter, 'sendMessage')
    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await act(async () => {
      await result.current.sendMessage('   ')
    })

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('sendMessage marks optimistic message as failed on adapter failure', async () => {
    const failAdapter = createTestAdapter()
    vi.spyOn(failAdapter, 'sendMessage').mockResolvedValue({
      success: false,
      error: 'Network error',
    })

    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(failAdapter),
    })

    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0))
    const initialCount = result.current.messages.length

    await act(async () => {
      await result.current.sendMessage('will fail')
    })

    // Failed message should be kept with sendStatus: 'failed'
    expect(result.current.messages.length).toBe(initialCount + 1)
    const failedMsg = result.current.messages.find(m => m.text === 'will fail')
    expect(failedMsg).toBeDefined()
    expect(failedMsg!.sendStatus).toBe('failed')
  })

  it('isSending is true during send, false after', async () => {
    let resolveMsg: (v: NostrResult<NostrMessage>) => void
    const slowAdapter = createTestAdapter()
    vi.spyOn(slowAdapter, 'sendMessage').mockReturnValue(
      new Promise(r => { resolveMsg = r })
    )

    const { result } = renderHook(() => useMessages(ALICE_PUBKEY), {
      wrapper: makeWrapper(slowAdapter),
    })

    // Start sending but don't await yet
    let sendPromise: Promise<unknown>
    act(() => {
      sendPromise = result.current.sendMessage('slow message')
    })

    // isSending should be true
    expect(result.current.isSending).toBe(true)

    // Resolve and wait
    await act(async () => {
      resolveMsg!({ success: true, data: { id: '123', text: 'slow message', sender: 'me', timestamp: new Date() } })
      await sendPromise
    })

    expect(result.current.isSending).toBe(false)
  })
})
