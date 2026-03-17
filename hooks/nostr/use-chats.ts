'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import type { NostrChat } from '@/lib/nostr/types'

export function useChats() {
  const { adapter, session } = useNostr()
  const [chats, setChats] = useState<NostrChat[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!session.isAuthenticated) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await adapter.getChats()
      setChats(result)
    } catch (err) {
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
