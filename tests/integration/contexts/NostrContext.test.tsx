import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { NostrProvider, useNostr } from '@/contexts/NostrContext'
import type { VaultData } from '@/lib/nostr/types'

// Mock vaultSync to control vault behavior in tests
vi.mock('@/lib/nostr/vault-sync', () => ({
  vaultSync: {
    checkVaultExists: vi.fn(),
    fetchVault: vi.fn(),
    createVault: vi.fn(),
    updateVault: vi.fn(),
    setRelayUrls: vi.fn(),
  },
}))

// Mock welshman relay-manager for connection status checks
vi.mock('@/lib/welshman/relay-manager', () => ({
  connectToRelays: vi.fn(),
  publishEvent: vi.fn().mockResolvedValue({}),
  fetchEvents: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockReturnValue({ abort: vi.fn(), signal: { aborted: false } }),
  getConnectedRelays: vi.fn().mockReturnValue([]),
  closeAllRelays: vi.fn(),
  getFailedRelays: vi.fn().mockReturnValue([]),
}))

// Mock createNostrAdapter to return a simple mock
vi.mock('@/lib/nostr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nostr')>()
  return {
    ...actual,
    createNostrAdapter: vi.fn(() => ({
      getChats: vi.fn().mockResolvedValue([]),
      getMessages: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn(),
      subscribeToMessages: vi.fn(() => () => {}),
      getContacts: vi.fn().mockResolvedValue([]),
      addContact: vi.fn(),
      removeContact: vi.fn(),
      getProfile: vi.fn().mockResolvedValue(null),
      updateProfile: vi.fn(),
      getRelays: vi.fn().mockReturnValue([]),
      setRelays: vi.fn(),
    })),
  }
})

import { vaultSync } from '@/lib/nostr/vault-sync'
import { store, StorageKey } from '@/lib/storage'

const MOCK_VAULT: VaultData = {
  version: 1,
  identities: [],
  updatedAt: Date.now(),
}

// Helper component to expose context values
function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useNostr>) => void }) {
  const ctx = useNostr()
  onRender(ctx)
  return <div data-testid="consumer" />
}

function renderWithProvider() {
  const captured: ReturnType<typeof useNostr>[] = []
  const result = render(
    <NostrProvider>
      <TestConsumer onRender={(ctx) => { captured.push(ctx) }} />
    </NostrProvider>
  )
  return { result, captured }
}

describe('NostrProvider - initial state', () => {
  it('starts unauthenticated when no session in localStorage', () => {
    const { captured } = renderWithProvider()
    const ctx = captured[captured.length - 1]
    expect(ctx.session.isAuthenticated).toBe(false)
    expect(ctx.session.username).toBeNull()
    expect(ctx.session.currentPubkey).toBeNull()
  })

  it('restores session in locked state when privkeys are lost (no auto-logout)', async () => {
    store.set(StorageKey.SESSION, {
      isAuthenticated: true,
      username: 'alice',
      currentPubkey: 'a'.repeat(64),
      vaultData: null,
    })

    const { captured } = renderWithProvider()

    // Session is kept but marked locked — the user unlocks with their password
    const ctx = captured[captured.length - 1]
    expect(ctx.session.isAuthenticated).toBe(true)
    expect(ctx.session.locked).toBe(true)
    expect(localStorage.getItem(StorageKey.SESSION)).not.toBeNull()
  })
})

describe('login', () => {
  beforeEach(() => {
    vi.mocked(vaultSync.fetchVault).mockResolvedValue(MOCK_VAULT)
  })

  it('returns success and updates session on valid vault', async () => {
    const { captured } = renderWithProvider()

    let result: Awaited<ReturnType<ReturnType<typeof useNostr>['login']>> | undefined
    await act(async () => {
      result = await captured[captured.length - 1].login('alice', 'password123')
    })

    expect(result!.success).toBe(true)
    const ctx = captured[captured.length - 1]
    expect(ctx.session.isAuthenticated).toBe(true)
    expect(ctx.session.username).toBe('alice')
  })

  it('returns failure when vault not found', async () => {
    vi.mocked(vaultSync.fetchVault).mockResolvedValue(null)
    const { captured } = renderWithProvider()

    let result: Awaited<ReturnType<ReturnType<typeof useNostr>['login']>> | undefined
    await act(async () => {
      result = await captured[captured.length - 1].login('nobody', 'pass')
    })

    expect(result!.success).toBe(false)
    expect(!result!.success && result!.error).toBeTruthy()
  })

  it('persists session to localStorage on success', async () => {
    const { captured } = renderWithProvider()

    await act(async () => {
      await captured[captured.length - 1].login('bob', 'pass')
    })

    const stored = store.get<{ isAuthenticated?: boolean; username?: string }>(StorageKey.SESSION)
    expect(stored).not.toBeNull()
    expect(stored!.isAuthenticated).toBe(true)
    expect(stored!.username).toBe('bob')
  })
})

describe('register', () => {
  it('returns success when account does not exist', async () => {
    vi.mocked(vaultSync.checkVaultExists).mockResolvedValue(false)
    vi.mocked(vaultSync.createVault).mockResolvedValue(MOCK_VAULT)

    const { captured } = renderWithProvider()

    let result: Awaited<ReturnType<ReturnType<typeof useNostr>['register']>> | undefined
    await act(async () => {
      result = await captured[captured.length - 1].register('newuser', 'newpass')
    })

    expect(result!.success).toBe(true)
  })

  it('returns failure when account already exists', async () => {
    vi.mocked(vaultSync.checkVaultExists).mockResolvedValue(true)

    const { captured } = renderWithProvider()

    let result: Awaited<ReturnType<ReturnType<typeof useNostr>['register']>> | undefined
    await act(async () => {
      result = await captured[captured.length - 1].register('existing', 'pass')
    })

    expect(result!.success).toBe(false)
    expect(!result!.success && result!.error).toContain('already exists')
  })
})

describe('unlock', () => {
  beforeEach(() => {
    vi.mocked(vaultSync.fetchVault).mockResolvedValue(MOCK_VAULT)
  })

  // Simulates a page reload: first provider logs in (persisting the session),
  // then unmounts; a fresh provider restores the session without privkey refs.
  async function renderLockedSession(username: string, password: string) {
    const first = renderWithProvider()
    await act(async () => {
      await first.captured[first.captured.length - 1].login(username, password)
    })
    first.result.unmount()

    const second = renderWithProvider()
    const ctx = second.captured[second.captured.length - 1]
    expect(ctx.session.isAuthenticated).toBe(true)
    expect(ctx.session.locked).toBe(true)
    return second
  }

  it('unlocks with the correct password and restores vault data', async () => {
    const { captured } = await renderLockedSession('alice', 'password123')

    let result: Awaited<ReturnType<ReturnType<typeof useNostr>['unlock']>> | undefined
    await act(async () => {
      result = await captured[captured.length - 1].unlock('password123')
    })

    expect(result!.success).toBe(true)
    const ctx = captured[captured.length - 1]
    expect(ctx.session.locked).toBe(false)
    expect(ctx.session.vaultData).not.toBeNull()
  })

  it('rejects a wrong password and stays locked', async () => {
    const { captured } = await renderLockedSession('alice', 'password123')

    let result: Awaited<ReturnType<ReturnType<typeof useNostr>['unlock']>> | undefined
    await act(async () => {
      result = await captured[captured.length - 1].unlock('wrongpass')
    })

    expect(result!.success).toBe(false)
    expect(!result!.success && result!.error).toBe('Wrong password')
    expect(captured[captured.length - 1].session.locked).toBe(true)
  })
})

describe('logout', () => {
  it('clears session and localStorage', async () => {
    vi.mocked(vaultSync.fetchVault).mockResolvedValue(MOCK_VAULT)
    const { captured } = renderWithProvider()

    // Login first
    await act(async () => {
      await captured[captured.length - 1].login('alice', 'pass')
    })
    expect(captured[captured.length - 1].session.isAuthenticated).toBe(true)

    // Logout
    act(() => {
      captured[captured.length - 1].logout()
    })

    const ctx = captured[captured.length - 1]
    expect(ctx.session.isAuthenticated).toBe(false)
    expect(ctx.session.username).toBeNull()
    expect(localStorage.getItem('dodobox_session')).toBeNull()
  })
})
