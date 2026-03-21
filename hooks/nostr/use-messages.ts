'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import type { NostrMessage, NostrResult } from '@/lib/nostr/types'

export function useMessages(contactPubkey: string) {
  const { adapter, session } = useNostr()
  const [messages, setMessages] = useState<NostrMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const sendQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)

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

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    setIsSending(true)

    while (sendQueueRef.current.length > 0) {
      const text = sendQueueRef.current.shift()!

      // Optimistic update
      const optimisticId = `optimistic-${crypto.randomUUID()}`
      const optimistic: NostrMessage = {
        id: optimisticId,
        text,
        sender: 'me',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const result = await adapter.sendMessage(contactPubkey, text)
        if (result.success) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? result.data : m))
          )
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      }
    }

    isProcessingRef.current = false
    setIsSending(false)
  }, [adapter, contactPubkey])

  const sendMessage = useCallback(
    async (text: string): Promise<NostrResult<NostrMessage>> => {
      if (!text.trim()) return { success: false, error: 'Empty message' }

      sendQueueRef.current = [...sendQueueRef.current, text]
      processQueue()

      return { success: true, data: { id: '', text, sender: 'me', timestamp: new Date() } }
    },
    [processQueue]
  )

  return { messages, sendMessage, isSending }
}
