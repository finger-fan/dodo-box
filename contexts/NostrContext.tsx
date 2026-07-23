'use client'

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'

import { deriveMasterKey, generateNewIdentityKey } from '@/lib/nostr/key-derivation'
import {
  encryptSecret,
  decryptSecret,
  createEmptyVaultData,
  addIdentityToVault,
  removeIdentityFromVault,
} from '@/lib/nostr/vault-crypto'
import { vaultSync } from '@/lib/nostr/vault-sync'
import { getConnectedRelays } from '@/lib/welshman/relay-manager'
import { createNostrAdapter, getAdapterMode, setAdapterMode, type AdapterMode } from '@/lib/nostr'
import { getRuntimeConfig, getDefaultRelays, getUserRelays } from '@/lib/runtime-config'
import { createLogger } from '@/lib/logger'
import { store, StorageKey } from '@/lib/storage'
import type {
  NostrSession,
  VaultData,
  VaultIdentity,
  INostrAdapter,
  NostrResult,
} from '@/lib/nostr/types'

const log = createLogger('NostrContext')

interface NostrContextValue {
  session: NostrSession
  adapter: INostrAdapter
  adapterMode: AdapterMode
  login(username: string, password: string): Promise<NostrResult<NostrSession>>
  register(username: string, password: string): Promise<NostrResult<NostrSession>>
  unlock(password: string): Promise<NostrResult>
  logout(): void
  switchIdentity(pubkey: string): Promise<NostrResult>
  createIdentity(name: string, slogan?: string): Promise<NostrResult<VaultIdentity>>
  deleteIdentity(pubkey: string): Promise<NostrResult>
  deleteAllIdentities(): Promise<NostrResult>
  updateIdentity(pubkey: string, updates: { name?: string; slogan?: string }): Promise<NostrResult>
  setAdapterMode(mode: AdapterMode): void
}

export const NostrContext = createContext<NostrContextValue | null>(null)

export function useNostr(): NostrContextValue {
  const ctx = useContext(NostrContext)
  if (!ctx) throw new Error('useNostr must be used within NostrProvider')
  return ctx
}

const EMPTY_SESSION: NostrSession = {
  isAuthenticated: false,
  username: null,
  currentPubkey: null,
  vaultData: null,
}

interface PersistedSession {
  isAuthenticated: boolean
  username: string | null
  currentPubkey: string | null
  vaultData: null
  masterPubkey?: string
}

function loadPersistedSession(): PersistedSession {
  if (typeof window === 'undefined') {
    return { ...EMPTY_SESSION, vaultData: null, masterPubkey: undefined }
  }
  const parsed = store.get<PersistedSession | null>(StorageKey.SESSION, null)
  if (!parsed) {
    log.debug('No session found in store')
    return { ...EMPTY_SESSION, vaultData: null, masterPubkey: undefined }
  }
  log.debug(`Parsed session: isAuthenticated=${parsed.isAuthenticated}, username=${parsed.username}, hasPubkey=${!!parsed.currentPubkey}`)
  return parsed
}

export function NostrProvider({ children }: { children: ReactNode }) {
  const initialAdapterMode = getAdapterMode()

  const [session, setSession] = useState<NostrSession>(() => {
    // In mock-telegram mode, auto-create a dummy session
    if (initialAdapterMode === 'mock-telegram') {
      if (typeof window !== 'undefined') {
        store.set(StorageKey.ACCOUNT_ACTIVE, true)
        store.set(StorageKey.CURRENT_USER, 'mock-user')
      }
      log.info('Initialized with mock-telegram mode')
      return {
        isAuthenticated: true,
        username: 'mock-user',
        currentPubkey: 'tg:mock',
        vaultData: null,
      }
    }

    const persisted = loadPersistedSession()
    if (persisted.isAuthenticated && persisted.currentPubkey) {
      // Private keys live only in memory refs and are lost on page reload.
      // Instead of logging out, restore the session in locked state and let
      // the user unlock it with their password (see unlock()).
      log.info(`Restored session from localStorage (locked): username=${persisted.username}, pubkey=${persisted.currentPubkey?.slice(0, 16)}...`)
      return {
        isAuthenticated: persisted.isAuthenticated,
        username: persisted.username,
        currentPubkey: persisted.currentPubkey,
        vaultData: null,
        locked: true,
      }
    }
    log.debug('No persisted session found, starting with empty session')
    return EMPTY_SESSION
  })
  // Private key lives ONLY in memory ref, never in React state
  const masterPrivkeyRef = useRef<string | null>(null)
  const masterPubkeyRef = useRef<string | null>(null)
  const identityPrivkeyRef = useRef<string | null>(null)
  const [adapter, setAdapter] = useState<INostrAdapter>(() => {
    if (initialAdapterMode === 'mock-telegram') {
      return createNostrAdapter({
        isAuthenticated: true,
        username: 'mock-user',
        currentPubkey: 'tg:mock',
        vaultData: null,
      } as NostrSession)
    }
    return createNostrAdapter()
  })
  const [currentAdapterMode, setCurrentAdapterMode] = useState<AdapterMode>(initialAdapterMode)

  const runtimeRelaysRef = useRef<string[] | null>(null)
  const configPromiseRef = useRef<Promise<string[]> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    configPromiseRef.current = getRuntimeConfig()
      .then(config => {
        runtimeRelaysRef.current = config.relays
        vaultSync.setRelayUrls(config.relays)
        return config.relays
      })
      .catch(err => {
        log.warn(`Failed to load runtime config, using defaults: ${err}`)
        const defaults = getDefaultRelays()
        runtimeRelaysRef.current = defaults
        vaultSync.setRelayUrls(defaults)
        return defaults
      })
  }, [])

  // Auto-lock when privkey is lost (session persisted but key in memory is gone).
  // We no longer log out here — the (main) layout shows an unlock screen instead.
  useEffect(() => {
    if (!session.isAuthenticated || session.locked) return
    if (identityPrivkeyRef.current || masterPrivkeyRef.current) return
    log.warn('Session authenticated but private keys lost — locking session')
    log.debug(`identityPrivkeyRef=${!!identityPrivkeyRef.current}, masterPrivkeyRef=${!!masterPrivkeyRef.current}`)
    queueMicrotask(() => {
      setSession(prev =>
        prev.isAuthenticated && !prev.locked ? { ...prev, locked: true } : prev
      )
    })
  }, [session])

  function persistSession(s: NostrSession & { masterPubkey?: string }) {
    if (typeof window === 'undefined') return
    store.set(StorageKey.SESSION, {
      isAuthenticated: s.isAuthenticated,
      username: s.username,
      currentPubkey: s.currentPubkey,
      masterPubkey: s.masterPubkey,
      vaultData: null,
    })
  }

  async function ensureRelays(): Promise<string[]> {
    const userRelays = getUserRelays()
    if (userRelays.length > 0) {
      runtimeRelaysRef.current = userRelays
      vaultSync.setRelayUrls(userRelays)
      return userRelays
    }
    if (runtimeRelaysRef.current) return runtimeRelaysRef.current
    if (configPromiseRef.current) return configPromiseRef.current
    const defaults = getDefaultRelays()
    runtimeRelaysRef.current = defaults
    vaultSync.setRelayUrls(defaults)
    return defaults
  }

  function buildAdapterForSession(
    newSession: NostrSession,
    privkey: string,
    relays?: string[]
  ): INostrAdapter {
    const sessionWithKey = { ...newSession, currentPrivkey: privkey }
    return createNostrAdapter(sessionWithKey, relays)
  }

  const login = useCallback(async (
    username: string,
    password: string
  ): Promise<NostrResult<NostrSession>> => {
    try {
      const masterKey = deriveMasterKey(username, password)
      masterPrivkeyRef.current = masterKey.privateKey
      masterPubkeyRef.current = masterKey.publicKey

      const relays = await ensureRelays()
      const vaultData = await vaultSync.fetchVault(
        masterKey.publicKey,
        masterKey.privateKey
      )

      if (!vaultData) {
        const connected = getConnectedRelays().length
        const error = connected === 0
          ? 'No relay connection. Check your network and try again.'
          : 'Account not found'
        return { success: false, error }
      }

      // Pick first identity or use master key as fallback
      const firstIdentity = vaultData.identities[0]
      let currentPubkey = masterKey.publicKey
      let currentPrivkey = masterKey.privateKey

      if (firstIdentity) {
        try {
          currentPrivkey = await decryptSecret(
            masterKey.privateKey,
            firstIdentity.encryptedSecret
          )
          currentPubkey = firstIdentity.pubkey
        } catch {
          // fallback to master key
        }
      }

      identityPrivkeyRef.current = currentPrivkey

      const newSession: NostrSession = {
        isAuthenticated: true,
        username,
        currentPubkey,
        vaultData,
      }

      setSession(newSession)
      persistSession({ ...newSession, masterPubkey: masterKey.publicKey })

      const newAdapter = buildAdapterForSession(newSession, currentPrivkey, relays)
      setAdapter(newAdapter)

      return { success: true, data: newSession }
    } catch (error) {
      masterPrivkeyRef.current = null
      masterPubkeyRef.current = null
      return { success: false, error: String(error) }
    }
  }, [])

  // Re-derive keys from the password after a page reload wiped the
  // memory-only privkey refs. Verifies against the persisted masterPubkey
  // so a wrong password fails fast without touching the relays.
  const unlock = useCallback(async (password: string): Promise<NostrResult> => {
    if (!session.isAuthenticated || !session.username) {
      return { success: false, error: 'No session to unlock' }
    }
    try {
      const masterKey = deriveMasterKey(session.username, password)

      const persisted = loadPersistedSession()
      if (persisted.masterPubkey && masterKey.publicKey !== persisted.masterPubkey) {
        return { success: false, error: 'Wrong password' }
      }

      masterPrivkeyRef.current = masterKey.privateKey
      masterPubkeyRef.current = masterKey.publicKey

      const relays = await ensureRelays()
      const vaultData = await vaultSync.fetchVault(
        masterKey.publicKey,
        masterKey.privateKey
      )

      if (!vaultData) {
        masterPrivkeyRef.current = null
        masterPubkeyRef.current = null
        const connected = getConnectedRelays().length
        const error = connected === 0
          ? 'No relay connection. Check your network and try again.'
          : 'Account not found'
        return { success: false, error }
      }

      // Restore the previously active identity, falling back to the first one
      let currentPubkey = masterKey.publicKey
      let currentPrivkey = masterKey.privateKey
      const activeIdentity =
        vaultData.identities.find(i => i.pubkey === session.currentPubkey) ??
        vaultData.identities[0]

      if (activeIdentity) {
        try {
          currentPrivkey = await decryptSecret(
            masterKey.privateKey,
            activeIdentity.encryptedSecret
          )
          currentPubkey = activeIdentity.pubkey
        } catch {
          // fallback to master key
        }
      }

      identityPrivkeyRef.current = currentPrivkey

      const newSession: NostrSession = {
        isAuthenticated: true,
        username: session.username,
        currentPubkey,
        vaultData,
        locked: false,
      }

      setSession(newSession)
      persistSession({ ...newSession, masterPubkey: masterKey.publicKey })
      setAdapter(buildAdapterForSession(newSession, currentPrivkey, relays))

      return { success: true, data: undefined }
    } catch (error) {
      masterPrivkeyRef.current = null
      masterPubkeyRef.current = null
      return { success: false, error: String(error) }
    }
  }, [session])

  const register = useCallback(async (
    username: string,
    password: string
  ): Promise<NostrResult<NostrSession>> => {
    try {
      const masterKey = deriveMasterKey(username, password)

      const relays = await ensureRelays()
      const exists = await vaultSync.checkVaultExists(masterKey.publicKey)
      if (exists) {
        return { success: false, error: 'Account already exists' }
      }

      masterPrivkeyRef.current = masterKey.privateKey
      const vaultData = await vaultSync.createVault(masterKey.privateKey)

      return { success: true, data: EMPTY_SESSION }
    } catch (error) {
      masterPrivkeyRef.current = null
      return { success: false, error: String(error) }
    }
  }, [])

  const logout = useCallback(() => {
    masterPrivkeyRef.current = null
    masterPubkeyRef.current = null
    identityPrivkeyRef.current = null
    setSession(EMPTY_SESSION)
    if (typeof window !== 'undefined') {
      store.remove(StorageKey.SESSION)
      store.remove(StorageKey.ACCOUNT_ACTIVE)
      store.remove(StorageKey.CURRENT_USER)
    }
    const newAdapter = createNostrAdapter()
    setAdapter(newAdapter)
    setCurrentAdapterMode(getAdapterMode())
  }, [])

  const switchIdentity = useCallback(async (pubkey: string): Promise<NostrResult> => {
    const masterPrivkey = masterPrivkeyRef.current
    if (!masterPrivkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    const identity = session.vaultData.identities.find(i => i.pubkey === pubkey)
    if (!identity) {
      return { success: false, error: 'Identity not found' }
    }

    try {
      const identityPrivkey = await decryptSecret(masterPrivkey, identity.encryptedSecret)
      identityPrivkeyRef.current = identityPrivkey

      const relays = await ensureRelays()
      const newSession: NostrSession = {
        ...session,
        currentPubkey: pubkey,
      }
      setSession(newSession)
      persistSession({ ...newSession, masterPubkey: masterPubkeyRef.current ?? undefined })

      const newAdapter = buildAdapterForSession(newSession, identityPrivkey, relays)
      setAdapter(newAdapter)

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const createIdentity = useCallback(async (name: string, slogan?: string): Promise<NostrResult<VaultIdentity>> => {
    const masterPrivkey = masterPrivkeyRef.current
    if (!masterPrivkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    try {
      const newKey = generateNewIdentityKey()
      const encryptedSecret = await encryptSecret(masterPrivkey, newKey.privateKey)

      const identity: VaultIdentity = {
        name,
        ...(slogan?.trim() ? { slogan: slogan.trim() } : {}),
        pubkey: newKey.publicKey,
        encryptedSecret,
        createdAt: Date.now(),
      }

     const updatedVault = addIdentityToVault(session.vaultData, identity)
      const relays = await ensureRelays()
     await vaultSync.updateVault(masterPrivkey, updatedVault)

      // If no identity was active before (e.g. first identity), activate the new one
      const hadActiveIdentity = session.vaultData.identities.some(
        i => i.pubkey === session.currentPubkey
      )

      let newSession: NostrSession = {
        ...session,
        vaultData: updatedVault,
      }

      if (!hadActiveIdentity) {
        identityPrivkeyRef.current = newKey.privateKey
        newSession = { ...newSession, currentPubkey: identity.pubkey }
        setSession(newSession)
        persistSession({ ...newSession, masterPubkey: masterPubkeyRef.current ?? undefined })
        setAdapter(buildAdapterForSession(newSession, newKey.privateKey, relays))
      } else {
        setSession(newSession)
      }

      return { success: true, data: identity }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const deleteIdentity = useCallback(async (pubkey: string): Promise<NostrResult> => {
    const masterPrivkey = masterPrivkeyRef.current
    if (!masterPrivkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    if (pubkey === session.currentPubkey) {
      return { success: false, error: 'Cannot delete active identity' }
    }

    try {
     const updatedVault = removeIdentityFromVault(session.vaultData, pubkey)
      await ensureRelays()
     await vaultSync.updateVault(masterPrivkey, updatedVault)

      setSession(prev => ({ ...prev, vaultData: updatedVault }))
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const deleteAllIdentities = useCallback(async (): Promise<NostrResult> => {
    const masterPrivkey = masterPrivkeyRef.current
    const masterPubkey = masterPubkeyRef.current
    if (!masterPrivkey || !masterPubkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    try {
      const updatedVault: VaultData = {
        ...session.vaultData,
        identities: [],
        updatedAt: Date.now(),
      }
      const relays = await ensureRelays()
      await vaultSync.updateVault(masterPrivkey, updatedVault)

      // Reset to "no active identity" — master key becomes the fallback, which
      // makes the (main) layout re-trigger the identity onboarding gate.
      identityPrivkeyRef.current = masterPrivkey
      const newSession: NostrSession = {
        ...session,
        currentPubkey: masterPubkey,
        vaultData: updatedVault,
      }
      setSession(newSession)
      persistSession({ ...newSession, masterPubkey })
      setAdapter(buildAdapterForSession(newSession, masterPrivkey, relays))

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const updateIdentity = useCallback(async (
    pubkey: string,
    updates: { name?: string; slogan?: string }
  ): Promise<NostrResult> => {
    const masterPrivkey = masterPrivkeyRef.current
    if (!masterPrivkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    try {
      const updatedIdentities = session.vaultData.identities.map(i => {
        if (i.pubkey !== pubkey) return i
        const next: VaultIdentity = { ...i }
        if (updates.name !== undefined) next.name = updates.name
        if (updates.slogan !== undefined) {
          const trimmed = updates.slogan.trim()
          if (trimmed) next.slogan = trimmed
          else delete next.slogan
        }
        return next
      })
     const updatedVault: VaultData = {
       ...session.vaultData,
       identities: updatedIdentities,
       updatedAt: Date.now(),
     }
      await ensureRelays()
     await vaultSync.updateVault(masterPrivkey, updatedVault)
      setSession(prev => ({ ...prev, vaultData: updatedVault }))
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const switchAdapterMode = useCallback((mode: AdapterMode) => {
    setAdapterMode(mode)
    setCurrentAdapterMode(mode)

    // In mock-telegram mode, bypass vault login
    if (mode === 'mock-telegram') {
      const mockSession: NostrSession = {
        isAuthenticated: true,
        username: 'mock-user',
        currentPubkey: 'tg:mock',
        vaultData: null,
      }
      setSession(mockSession)
      if (typeof window !== 'undefined') {
        store.set(StorageKey.ACCOUNT_ACTIVE, true)
        store.set(StorageKey.CURRENT_USER, 'mock-user')
      }
      setAdapter(createNostrAdapter(mockSession))
    } else {
      // Switch back to real mode — require re-login
      masterPrivkeyRef.current = null
      masterPubkeyRef.current = null
      identityPrivkeyRef.current = null
      setSession(EMPTY_SESSION)
      if (typeof window !== 'undefined') {
        store.remove(StorageKey.SESSION)
        store.remove(StorageKey.ACCOUNT_ACTIVE)
        store.remove(StorageKey.CURRENT_USER)
      }
      setAdapter(createNostrAdapter())
    }
  }, [])

  return (
    <NostrContext.Provider
      value={{
        session,
        adapter,
        adapterMode: currentAdapterMode,
        login,
        register,
        unlock,
        logout,
        switchIdentity,
        createIdentity,
        deleteIdentity,
        deleteAllIdentities,
        updateIdentity,
        setAdapterMode: switchAdapterMode,
      }}
    >
      {children}
    </NostrContext.Provider>
  )
}
