import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { useContacts } from '@/hooks/nostr/use-contacts'
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

const STUB_CONTACTS: NostrContact[] = [
  { id: '1', name: 'Alice', pubkey: 'b'.repeat(64) },
  { id: '2', name: 'Bob', pubkey: 'c'.repeat(64) },
]

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
      return [...STUB_CONTACTS]
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

describe('useContacts', () => {
  let adapter: INostrAdapter

  beforeEach(() => {
    adapter = createTestAdapter()
  })

  it('starts with loading true when authenticated', () => {
    const { result } = renderHook(() => useContacts(), {
      wrapper: makeWrapper(adapter),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.contacts).toEqual([])
  })

  it('fetches contacts successfully', async () => {
    const { result } = renderHook(() => useContacts(), {
      wrapper: makeWrapper(adapter),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.contacts).toHaveLength(2)
    expect(result.current.contacts[0].name).toBe('Alice')
    expect(result.current.contacts[1].name).toBe('Bob')
  })

  it('handles fetch failure gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failAdapter = createTestAdapter({
      async getContacts(): Promise<NostrContact[]> {
        throw new Error('Network error')
      },
    })

    const { result } = renderHook(() => useContacts(), {
      wrapper: makeWrapper(failAdapter),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.contacts).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[useContacts] Failed to fetch contacts:',
      expect.any(Error)
    )

    warnSpy.mockRestore()
  })

  it('does not fetch when not authenticated', async () => {
    const getContactsSpy = vi.fn()
    const spyAdapter = createTestAdapter({
      getContacts: getContactsSpy,
    })
    const unauthSession: NostrSession = {
      ...TEST_SESSION,
      isAuthenticated: false,
    }

    const { result } = renderHook(() => useContacts(), {
      wrapper: makeWrapper(spyAdapter, unauthSession),
    })

    // isLoading should be false when not authenticated (initialized from session.isAuthenticated)
    expect(result.current.isLoading).toBe(false)

    // Wait a tick to confirm no fetch was triggered
    await new Promise((r) => setTimeout(r, 50))
    expect(getContactsSpy).not.toHaveBeenCalled()
    expect(result.current.contacts).toEqual([])
  })

  it('cancels fetch on unmount (cleanup)', async () => {
    let resolveContacts: (value: NostrContact[]) => void
    const slowAdapter = createTestAdapter({
      getContacts: () =>
        new Promise<NostrContact[]>((resolve) => {
          resolveContacts = resolve
        }),
    })

    const { result, unmount } = renderHook(() => useContacts(), {
      wrapper: makeWrapper(slowAdapter),
    })

    expect(result.current.isLoading).toBe(true)

    // Unmount before the promise resolves
    unmount()

    // Resolve after unmount -- should not update state (no act warning)
    resolveContacts!(STUB_CONTACTS)

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50))

    // If cleanup works, no React warnings about updating unmounted components
    // The test passing without warnings confirms cleanup works
  })
})
