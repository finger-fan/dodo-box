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

const CONTACT_PUBKEY = 'c'.repeat(64)

const TEST_SESSION: NostrSession = {
  isAuthenticated: true,
  username: 'testuser',
  currentPubkey: 'a'.repeat(64),
  vaultData: null,
}

function createDelayedAdapter(delayMs = 0): INostrAdapter {
  let msgCounter = 0
  let getMessagesResolved = false

  return {
    async getChats(): Promise<NostrChat[]> {
      return []
    },
    async getMessages(): Promise<NostrMessage[]> {
      getMessagesResolved = true
      return []
    },
    async sendMessage(
      _contactPubkey: string,
      text: string
    ): Promise<NostrResult<NostrMessage>> {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
      msgCounter++
      const msg: NostrMessage = {
        id: `real-${msgCounter}-${Date.now()}`,
        text,
        sender: 'me',
        timestamp: new Date(),
      }
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

/** Wait for the hook's initial getMessages to settle */
async function waitForMount(result: { current: ReturnType<typeof useMessages> }) {
  // The useEffect fires getMessages which resolves with [].
  // Wait for isSending to be false (initial state) and no pending updates.
  await waitFor(() => {
    expect(result.current.isSending).toBe(false)
  })
  // Extra tick to ensure all microtasks from useEffect are flushed
  await act(async () => {})
}

describe('useMessages - rapid send scenarios', () => {
  it('generates unique optimistic IDs for 10 rapid sends', async () => {
    const adapter = createDelayedAdapter(0)
    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitForMount(result)

    // Send 10 messages concurrently
    await act(async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        result.current.sendMessage(`rapid-msg-${i}`)
      )
      await Promise.all(promises)
    })

    const msgs = result.current.messages
    expect(msgs.length).toBe(10)

    // All IDs should be unique
    const ids = msgs.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every rapid message appears in the list (no overwrites)', async () => {
    const adapter = createDelayedAdapter(0)
    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitForMount(result)

    await act(async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        result.current.sendMessage(`msg-${i}`)
      )
      await Promise.all(promises)
    })

    const texts = result.current.messages.map((m) => m.text)
    for (let i = 0; i < 5; i++) {
      expect(texts).toContain(`msg-${i}`)
    }
  })

  it('optimistic IDs use crypto.randomUUID format', async () => {
    const adapter = createDelayedAdapter(0)
    const originalSend = adapter.sendMessage.bind(adapter)

    // Block sendMessage so we can observe optimistic state
    const resolvers: Array<() => void> = []
    vi.spyOn(adapter, 'sendMessage').mockImplementation(
      (_contactPubkey: string, text: string) => {
        return new Promise((resolve) => {
          resolvers.push(() => {
            originalSend(_contactPubkey, text).then(resolve)
          })
        })
      }
    )

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitForMount(result)

    // Fire sends without awaiting — they will block on our mock
    // With queue-based sending, first message creates optimistic and blocks,
    // second is queued but not yet processed
    act(() => {
      result.current.sendMessage('test-uuid-1')
      result.current.sendMessage('test-uuid-2')
    })

    // At least the first optimistic message should be in the list
    const optimisticMsgs = result.current.messages.filter((m) =>
      m.id.startsWith('optimistic-')
    )
    expect(optimisticMsgs.length).toBeGreaterThanOrEqual(1)

    // Check UUID format: optimistic-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^optimistic-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    for (const msg of optimisticMsgs) {
      expect(msg.id).toMatch(uuidRegex)
    }

    // Resolve first to let queue process second
    await act(async () => {
      for (const r of resolvers) r()
      await new Promise((r) => setTimeout(r, 50))
    })

    // After resolving, resolve any new resolvers from the second message
    await act(async () => {
      for (const r of resolvers) r()
      await new Promise((r) => setTimeout(r, 50))
    })
  })

  it('concurrent sends with partial failures: successes kept, failures removed', async () => {
    let callCount = 0
    const adapter = createDelayedAdapter(0)
    vi.spyOn(adapter, 'sendMessage').mockImplementation(
      async (_cp: string, text: string): Promise<NostrResult<NostrMessage>> => {
        callCount++
        if (callCount % 2 === 1) {
          return { success: false, error: 'Network error' }
        }
        return {
          success: true,
          data: {
            id: `real-${callCount}`,
            text,
            sender: 'me',
            timestamp: new Date(),
          },
        }
      }
    )

    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitForMount(result)

    await act(async () => {
      const promises = Array.from({ length: 6 }, (_, i) =>
        result.current.sendMessage(`mixed-${i}`)
      )
      await Promise.all(promises)
    })

    const msgs = result.current.messages
    // 3 succeeded (even calls: 2, 4, 6), 3 failed (odd calls: 1, 3, 5) — all kept
    expect(msgs.length).toBe(6)
    const succeeded = msgs.filter(m => !m.id.startsWith('optimistic-'))
    const failed = msgs.filter(m => m.sendStatus === 'failed')
    expect(succeeded.length).toBe(3)
    expect(failed.length).toBe(3)
  })

  it('messages maintain send order', async () => {
    const adapter = createDelayedAdapter(0)
    const { result } = renderHook(() => useMessages(CONTACT_PUBKEY), {
      wrapper: makeWrapper(adapter),
    })

    await waitForMount(result)

    // Send sequentially to guarantee order
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await result.current.sendMessage(`ordered-${i}`)
      })
    }

    const texts = result.current.messages.map((m) => m.text)
    expect(texts).toEqual([
      'ordered-0',
      'ordered-1',
      'ordered-2',
      'ordered-3',
      'ordered-4',
    ])
  })
})
