'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNostr } from '@/contexts/NostrContext'
import type { NostrProfile, NostrResult } from '@/lib/nostr/types'

export function useProfile(pubkeyHex?: string) {
  const { adapter, session } = useNostr()
  const [profile, setProfile] = useState<NostrProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const targetPubkey = pubkeyHex || session.currentPubkey || undefined

  useEffect(() => {
    if (!targetPubkey) return
    let cancelled = false
    adapter.getProfile(targetPubkey).then((p) => {
      if (!cancelled) {
        setProfile(p)
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [adapter, targetPubkey])

  const updateProfile = useCallback(
    async (updates: Partial<NostrProfile>): Promise<NostrResult> => {
      const result = await adapter.updateProfile(updates)
      if (result.success && targetPubkey) {
        setProfile(prev => prev ? { ...prev, ...updates } : { pubkey: targetPubkey, ...updates })
      }
      return result
    },
    [adapter, targetPubkey]
  )

  return { profile, isLoading, updateProfile }
}
