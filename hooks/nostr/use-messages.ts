'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import type { NostrMessage, NostrResult } from '@/lib/nostr/types'

export function useMessages(contactPubkey: string) {
  const { adapter, session } = useNostr()
  const [messages, setMessages] = useState<NostrMessage[]>([])
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (!session.isAuthenticated || !contactPubkey) return

    let mounted = true

    adapter.getMessages(contactPubkey).then((msgs) => {
      if (mounted) setMessages(msgs)
    })

    const unsubscribe = adapter.subscribeToMessages(contactPubkey, (msg) => {
      if (mounted) {
        setMessages((prev) => [...prev, msg])
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [adapter, contactPubkey, session.isAuthenticated])

  const sendMessage = useCallback(
    async (text: string): Promise<NostrResult<NostrMessage>> => {
      if (!text.trim()) return { success: false, error: 'Empty message' }
      setIsSending(true)

      // Optimistic update
      const optimistic: NostrMessage = {
        id: `optimistic-${Date.now()}`,
        text,
        sender: 'me',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const result = await adapter.sendMessage(contactPubkey, text)
        if (result.success) {
          // Replace optimistic with real
          setMessages((prev) =>
            prev.map((m) => (m.id === optimistic.id ? result.data : m))
          )
        } else {
          // Remove optimistic on failure
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        }
        return result
      } finally {
        setIsSending(false)
      }
    },
    [adapter, contactPubkey]
  )

  return { messages, sendMessage, isSending }
}
