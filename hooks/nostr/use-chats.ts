'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import { createLogger } from '@/lib/logger'
import type { NostrChat } from '@/lib/nostr/types'
import { loadCachedChats } from '@/lib/nostr/contact-cache'

const log = createLogger('useChats')

export function useChats() {
  const { adapter, session } = useNostr()
  const [chats, setChats] = useState<NostrChat[]>(() =>
    session.currentPubkey ? loadCachedChats(session.currentPubkey) : []
  )
  const [isLoading, setIsLoading] = useState(session.isAuthenticated)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    log.debug(`refresh called, isAuthenticated=${session.isAuthenticated}`)
    if (!session.isAuthenticated) return
    setIsLoading(true)
    setError(null)
    try {
      log.debug('fetching chats...')
      const result = await adapter.getChats()
      log.debug(`fetched ${result.length} chats`)
      setChats(result)
    } catch (err) {
      log.error('fetch chats failed', err)
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [adapter, session.isAuthenticated])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { chats, isLoading, error, refresh }
}
