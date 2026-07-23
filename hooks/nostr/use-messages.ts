'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import { createLogger } from '@/lib/logger'
import type { NostrMessage } from '@/lib/nostr/types'
import { detectGaps, insertGapIndicators, type ChatItem, type SeqGap } from '@/lib/nostr/gap-detection'

const log = createLogger('useMessages')

function sortMessages(a: NostrMessage, b: NostrMessage): number {
  const timeDiff = a.timestamp.getTime() - b.timestamp.getTime()
  if (timeDiff !== 0) return timeDiff
  if (a.senderPubkey && a.senderPubkey === b.senderPubkey) {
    return (a.seq ?? 0) - (b.seq ?? 0)
  }
  return 0
}

export function useMessages(contactPubkey: string) {
  const { adapter, session } = useNostr()
  const [messages, setMessages] = useState<NostrMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [recoveringGaps, setRecoveringGaps] = useState<Set<string>>(new Set())
  const sendQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)

  useEffect(() => {
    log.debug(`useMessages effect: isAuthenticated=${session.isAuthenticated}, contactPubkey=${contactPubkey?.slice(0, 16)}...`)
    if (!session.isAuthenticated || !contactPubkey) return

    let mounted = true
    let unsubscribe: (() => void) | undefined
    try {
      log.info(`Fetching messages for ${contactPubkey.slice(0, 16)}...`)

      adapter.getMessages(contactPubkey).then((msgs) => {
        if (!mounted) return
        log.debug(`Got ${msgs?.length || 0} messages`)
        // Merge with existing messages (subscription may have already added some
        // via the shared Tracker, so using the value form would overwrite them)
        setMessages(prev => {
          if (prev.length === 0) return msgs
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = msgs.filter(m => !existingIds.has(m.id))
          return newMsgs.length > 0 ? [...prev, ...newMsgs].sort(sortMessages) : prev
        })
      }).catch((err) => {
        log.error('adapter.getMessages failed', err)
      })

      log.debug('Subscribing to messages...')
      unsubscribe = adapter.subscribeToMessages(contactPubkey, (msg) => {
        try {
          if (mounted) {
            log.debug(`Received new message: ${msg.id?.slice(0, 8)}...`)
            setMessages((prev) => [...prev, msg])
          }
        } catch (err) {
          log.error('subscribeToMessages callback failed', err)
        }
      })
    } catch (err) {
      log.error('useMessages effect failed', err)
    }

    return () => {
      log.debug('useMessages cleanup')
      mounted = false
      try {
        unsubscribe?.()
      } catch (err) {
        log.error('useMessages unsubscribe failed', err)
      }
    }
  }, [adapter, contactPubkey, session.isAuthenticated])

  const chatItems = useMemo((): ChatItem[] => {
    try {
      const gaps = detectGaps(messages)
      const items = insertGapIndicators(messages, gaps)
      // Apply recovering/unrecoverable status
      return items.map((item) => {
        if ('type' in item && (item as { type: string }).type === 'gap') {
          const gapItem = item as ChatItem & { type: 'gap'; id: string }
          if (recoveringGaps.has(gapItem.id)) {
            return { ...gapItem, status: 'recovering' as const }
          }
        }
        return item
      })
    } catch (err) {
      log.error('chatItems computation failed (detectGaps/insertGapIndicators)', err)
      return []
    }
  }, [messages, recoveringGaps])

  const recoverGap = useCallback(async (gap: SeqGap) => {
    const gapId = `gap-${gap.senderPubkey}-${gap.afterSeq}-${gap.beforeSeq}`
    setRecoveringGaps(prev => new Set([...prev, gapId]))

    try {
      const recovered = await adapter.recoverMessages(
        contactPubkey,
        Math.floor(gap.afterTimestamp.getTime() / 1000) - 1,
        Math.floor(gap.beforeTimestamp.getTime() / 1000) + 1
      )

      if (recovered.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = recovered.filter(m => !existingIds.has(m.id))
          if (newMsgs.length === 0) return prev
          return [...prev, ...newMsgs].sort(sortMessages)
        })
      }
    } catch (error) {
      log.error('recoverGap failed', error)
    }

    setRecoveringGaps(prev => {
      const next = new Set(prev)
      next.delete(gapId)
      return next
    })
  }, [adapter, contactPubkey])

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
        sendStatus: 'pending',
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const result = await adapter.sendMessage(contactPubkey, text)
        if (result.success) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? result.data : m))
          )
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? { ...m, sendStatus: 'failed' as const } : m))
          )
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, sendStatus: 'failed' as const } : m))
        )
      }
    }

    isProcessingRef.current = false
    setIsSending(false)
  }, [adapter, contactPubkey])

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return

      sendQueueRef.current.push(text)
      await processQueue()
    },
    [processQueue]
  )

  const retrySend = useCallback(async (messageId: string) => {
    const failedMsg = messages.find(m => m.id === messageId && m.sendStatus === 'failed')
    if (!failedMsg) return

    // Mark as pending
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, sendStatus: 'pending' as const } : m)
    )

    try {
      const result = await adapter.sendMessage(contactPubkey, failedMsg.text)
      if (result.success) {
        setMessages(prev =>
          prev.map(m => m.id === messageId ? result.data : m)
        )
      } else {
        setMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, sendStatus: 'failed' as const } : m)
        )
      }
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, sendStatus: 'failed' as const } : m)
      )
    }
  }, [adapter, contactPubkey, messages])

  return { messages, chatItems, sendMessage, isSending, recoverGap, retrySend }
}
