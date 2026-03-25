// events.ts - Nostr 事件构建与签名

import {
  finalizeEvent,
  verifyEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
} from 'nostr-tools'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils'
import type { NostrEvent } from './types'
import {
  KIND_PROFILE,
  KIND_FOLLOWS,
  KIND_DIRECT_MESSAGE,
  KIND_DM_WRAP,
  KIND_VAULT,
  VAULT_EVENT_D_TAG,
} from './types'

export { KIND_PROFILE, KIND_FOLLOWS, KIND_DIRECT_MESSAGE, KIND_DM_WRAP, KIND_VAULT }

export function signEvent(
  kind: number,
  content: string,
  tags: string[][],
  privkeyHex: string
): NostrEvent {
  const privkey = hexToBytes(privkeyHex)
  const event = finalizeEvent(
    {
      kind,
      content,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    },
    privkey
  )
  return event as NostrEvent
}

export function buildProfileEvent(
  profile: Record<string, string>,
  privkeyHex: string
): NostrEvent {
  return signEvent(KIND_PROFILE, JSON.stringify(profile), [], privkeyHex)
}

export function buildFollowListEvent(
  contacts: ReadonlyArray<{ pubkey: string; petname?: string }>,
  privkeyHex: string
): NostrEvent {
  const tags = contacts.map(c => ['p', c.pubkey, '', c.petname || ''])
  return signEvent(KIND_FOLLOWS, '', tags, privkeyHex)
}

export function buildDirectMessageEvent(
  content: string,
  recipientPubkey: string,
  senderPrivkeyHex: string,
  seq?: number
): NostrEvent {
  const tags: string[][] = [['p', recipientPubkey]]
  if (seq !== undefined) {
    tags.push(['seq', String(seq)])
  }
  return signEvent(KIND_DIRECT_MESSAGE, content, tags, senderPrivkeyHex)
}

/**
 * NIP-17 Gift Wrap: 将 kind 14 DM 包装成 kind 1059
 */
export function createGiftWrap(
  innerEvent: NostrEvent,
  recipientPubkey: string
): NostrEvent {
  const wrapPrivkey = generateSecretKey()
  const wrapPrivkeyHex = bytesToHex(wrapPrivkey)

  const conversationKey = nip44.getConversationKey(
    wrapPrivkey,
    recipientPubkey
  )
  const encryptedContent = nip44.encrypt(JSON.stringify(innerEvent), conversationKey)

  return signEvent(
    KIND_DM_WRAP,
    encryptedContent,
    [['p', recipientPubkey]],
    wrapPrivkeyHex
  )
}

/**
 * 解密 NIP-17 Gift Wrap
 */
export function decryptGiftWrap(
  wrapEvent: NostrEvent,
  recipientPrivkeyHex: string
): NostrEvent | null {
  try {
    const recipientPrivkey = hexToBytes(recipientPrivkeyHex)
    const conversationKey = nip44.getConversationKey(recipientPrivkey, wrapEvent.pubkey)
    const decrypted = nip44.decrypt(wrapEvent.content, conversationKey)
    const innerEvent = JSON.parse(decrypted) as NostrEvent
    return innerEvent
  } catch (error) {
    console.error('[Events] decryptGiftWrap failed:', error)
    return null
  }
}

export function buildVaultEvent(
  encryptedContent: string,
  privkeyHex: string
): NostrEvent {
  return signEvent(
    KIND_VAULT,
    encryptedContent,
    [['d', VAULT_EVENT_D_TAG]],
    privkeyHex
  )
}

export { verifyEvent }
