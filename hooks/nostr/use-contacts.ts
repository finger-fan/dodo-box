'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import { createLogger } from '@/lib/logger'
import type { NostrContact, NostrResult } from '@/lib/nostr/types'

const log = createLogger('useContacts')

export function useContacts() {
  const { adapter, session } = useNostr()
  const [contacts, setContacts] = useState<NostrContact[]>([])
  const [isLoading, setIsLoading] = useState(session.isAuthenticated)

  useEffect(() => {
    if (!session.isAuthenticated) return
    let cancelled = false
    adapter.getContacts().then((result) => {
      if (!cancelled) {
        setContacts(result)
      }
    }).catch((err) => {
      log.warn(`Failed to fetch contacts: ${err}`)
    }).finally(() => {
      if (!cancelled) {
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [adapter, session.isAuthenticated])

  const addContact = useCallback(
    async (pubkeyOrProtocol: string): Promise<NostrResult<NostrContact>> => {
      const result = await adapter.addContact(pubkeyOrProtocol)
      if (result.success) {
        setContacts((prev) => [result.data, ...prev])
      }
      return result
    },
    [adapter]
  )

  const removeContact = useCallback(
    async (pubkey: string): Promise<NostrResult> => {
      const result = await adapter.removeContact(pubkey)
      if (result.success) {
        setContacts((prev) => prev.filter((c) => c.pubkey !== pubkey))
      }
      return result
    },
    [adapter]
  )

  return { contacts, isLoading, addContact, removeContact }
}
