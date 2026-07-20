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
import type {
  NostrSession,
  VaultData,
  VaultIdentity,
  INostrAdapter,
  NostrResult,
} from '@/lib/nostr/types'

const SESSION_STORAGE_KEY = 'dodobox_session'

interface NostrContextValue {
  session: NostrSession
  adapter: INostrAdapter
  adapterMode: AdapterMode
  login(username: string, password: string): Promise<NostrResult<NostrSession>>
  register(username: string, password: string): Promise<NostrResult<NostrSession>>
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
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return { ...EMPTY_SESSION, vaultData: null, masterPubkey: undefined }
    return JSON.parse(raw) as PersistedSession
  } catch {
    return { ...EMPTY_SESSION, vaultData: null, masterPubkey: undefined }
  }
}

export function NostrProvider({ children }: { children: ReactNode }) {
  const initialAdapterMode = getAdapterMode()

  const [session, setSession] = useState<NostrSession>(() => {
    // In mock-telegram mode, auto-create a dummy session
    if (initialAdapterMode === 'mock-telegram') {
      if (typeof window !== 'undefined') {
        localStorage.setItem('dodobox_account_active', 'true')
        localStorage.setItem('dodobox_current_user', 'mock-user')
      }
      return {
        isAuthenticated: true,
        username: 'mock-user',
        currentPubkey: 'tg:mock',
        vaultData: null,
      }
    }

    const persisted = loadPersistedSession()
    if (persisted.isAuthenticated && persisted.currentPubkey) {
      // Note: On page refresh, private keys will be lost (memory-only refs).
      // The useEffect below handles auto-logout for this case.
      return {
        isAuthenticated: persisted.isAuthenticated,
        username: persisted.username,
        currentPubkey: persisted.currentPubkey,
        vaultData: null,
      }
    }
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
        console.warn('[NostrContext] Failed to load runtime config, using defaults:', err)
        const defaults = getDefaultRelays()
        runtimeRelaysRef.current = defaults
        vaultSync.setRelayUrls(defaults)
        return defaults
      })
  }, [])

  // Auto-logout on page refresh when privkey is lost (session persisted but key in memory is gone)
  useEffect(() => {
    if (!session.isAuthenticated) return
    if (identityPrivkeyRef.current || masterPrivkeyRef.current) return
    // Session was restored from localStorage but private keys are lost — defer state updates
    queueMicrotask(() => {
      masterPrivkeyRef.current = null
      masterPubkeyRef.current = null
      identityPrivkeyRef.current = null
     setSession(EMPTY_SESSION)
     if (typeof window !== 'undefined') {
        localStorage.setItem('dodobox_refresh_logout', 'true')
        localStorage.removeItem(SESSION_STORAGE_KEY)
        localStorage.removeItem('dodobox_account_active')
        localStorage.removeItem('dodobox_current_user')
      }
      setAdapter(createNostrAdapter())
    })
  }, [session])

  function persistSession(s: NostrSession & { masterPubkey?: string }) {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          isAuthenticated: s.isAuthenticated,
          username: s.username,
          currentPubkey: s.currentPubkey,
          masterPubkey: s.masterPubkey,
          vaultData: null,
        })
      )
    } catch (err) {
      console.warn('[NostrContext] Failed to persist session to localStorage:', err)
    }
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
      localStorage.removeItem(SESSION_STORAGE_KEY)
      localStorage.removeItem('dodobox_account_active')
      localStorage.removeItem('dodobox_current_user')
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
        localStorage.setItem('dodobox_account_active', 'true')
        localStorage.setItem('dodobox_current_user', 'mock-user')
      }
      setAdapter(createNostrAdapter(mockSession))
    } else {
      // Switch back to real mode — require re-login
      masterPrivkeyRef.current = null
      masterPubkeyRef.current = null
      identityPrivkeyRef.current = null
      setSession(EMPTY_SESSION)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SESSION_STORAGE_KEY)
        localStorage.removeItem('dodobox_account_active')
        localStorage.removeItem('dodobox_current_user')
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
