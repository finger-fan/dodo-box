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
import { createNostrAdapter } from '@/lib/nostr'
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
  login(username: string, password: string): Promise<NostrResult<NostrSession>>
  register(username: string, password: string): Promise<NostrResult<NostrSession>>
  logout(): void
  switchIdentity(pubkey: string): Promise<NostrResult>
  createIdentity(name: string): Promise<NostrResult<VaultIdentity>>
  deleteIdentity(pubkey: string): Promise<NostrResult>
  updateIdentityName(pubkey: string, name: string): Promise<NostrResult>
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
  const [session, setSession] = useState<NostrSession>(() => {
    const persisted = loadPersistedSession()
    if (persisted.isAuthenticated && persisted.currentPubkey) {
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
  const identityPrivkeyRef = useRef<string | null>(null)
  const [adapter, setAdapter] = useState<INostrAdapter>(() => createNostrAdapter())

  function persistSession(s: NostrSession & { masterPubkey?: string }) {
    if (typeof window === 'undefined') return
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
  }

  function buildAdapterForSession(
    newSession: NostrSession,
    privkey: string
  ): INostrAdapter {
    const sessionWithKey = { ...newSession, currentPrivkey: privkey }
    return createNostrAdapter(sessionWithKey)
  }

  const login = useCallback(async (
    username: string,
    password: string
  ): Promise<NostrResult<NostrSession>> => {
    try {
      const masterKey = deriveMasterKey(username, password)
      masterPrivkeyRef.current = masterKey.privateKey

      const vaultData = await vaultSync.fetchVault(
        masterKey.publicKey,
        masterKey.privateKey
      )

      if (!vaultData) {
        return { success: false, error: 'Account not found' }
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

      const newAdapter = buildAdapterForSession(newSession, currentPrivkey)
      setAdapter(newAdapter)

      return { success: true, data: newSession }
    } catch (error) {
      masterPrivkeyRef.current = null
      return { success: false, error: String(error) }
    }
  }, [])

  const register = useCallback(async (
    username: string,
    password: string
  ): Promise<NostrResult<NostrSession>> => {
    try {
      const masterKey = deriveMasterKey(username, password)

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
    identityPrivkeyRef.current = null
    setSession(EMPTY_SESSION)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      localStorage.removeItem('dodobox_account_active')
      localStorage.removeItem('dodobox_current_user')
    }
    const newAdapter = createNostrAdapter()
    setAdapter(newAdapter)
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

      const newSession: NostrSession = {
        ...session,
        currentPubkey: pubkey,
      }
      setSession(newSession)
      persistSession({ ...newSession })

      const newAdapter = buildAdapterForSession(newSession, identityPrivkey)
      setAdapter(newAdapter)

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const createIdentity = useCallback(async (name: string): Promise<NostrResult<VaultIdentity>> => {
    const masterPrivkey = masterPrivkeyRef.current
    if (!masterPrivkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    try {
      const newKey = generateNewIdentityKey()
      const encryptedSecret = await encryptSecret(masterPrivkey, newKey.privateKey)

      const identity: VaultIdentity = {
        name,
        pubkey: newKey.publicKey,
        encryptedSecret,
        createdAt: Date.now(),
      }

      const updatedVault = addIdentityToVault(session.vaultData, identity)
      await vaultSync.updateVault(masterPrivkey, updatedVault)

      const newSession: NostrSession = {
        ...session,
        vaultData: updatedVault,
      }
      setSession(newSession)

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
      await vaultSync.updateVault(masterPrivkey, updatedVault)

      setSession(prev => ({ ...prev, vaultData: updatedVault }))
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  const updateIdentityName = useCallback(async (
    pubkey: string,
    name: string
  ): Promise<NostrResult> => {
    const masterPrivkey = masterPrivkeyRef.current
    if (!masterPrivkey || !session.vaultData) {
      return { success: false, error: 'Session not unlocked' }
    }

    try {
      const updatedIdentities = session.vaultData.identities.map(i =>
        i.pubkey === pubkey ? { ...i, name } : i
      )
      const updatedVault: VaultData = {
        ...session.vaultData,
        identities: updatedIdentities,
        updatedAt: Date.now(),
      }
      await vaultSync.updateVault(masterPrivkey, updatedVault)
      setSession(prev => ({ ...prev, vaultData: updatedVault }))
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }, [session])

  return (
    <NostrContext.Provider
      value={{
        session,
        adapter,
        login,
        register,
        logout,
        switchIdentity,
        createIdentity,
        deleteIdentity,
        updateIdentityName,
      }}
    >
      {children}
    </NostrContext.Provider>
  )
}
