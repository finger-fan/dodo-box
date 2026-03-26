// events.ts - Nostr event building (thin wrapper over welshman/crypto)

import {
  signEvent,
  buildProfileEvent,
  buildFollowListEvent,
  buildDirectMessageEvent,
  createGiftWrap as welshmanCreateGiftWrap,
  decryptGiftWrap as welshmanDecryptGiftWrap,
  buildVaultEvent,
} from '@/lib/welshman/crypto'
import type { NostrEvent } from './types'
import type { SignedEvent, HashedEvent } from '@welshman/util'
import {
  KIND_PROFILE,
  KIND_FOLLOWS,
  KIND_DIRECT_MESSAGE,
  KIND_DM_WRAP,
  KIND_VAULT,
} from './types'

export { KIND_PROFILE, KIND_FOLLOWS, KIND_DIRECT_MESSAGE, KIND_DM_WRAP, KIND_VAULT }

// Re-export welshman-backed functions with compatible signatures
export { signEvent, buildProfileEvent, buildFollowListEvent, buildDirectMessageEvent, buildVaultEvent }

/**
 * NIP-17 Gift Wrap (async wrapper for backward compatibility).
 */
export async function createGiftWrap(
  innerEvent: NostrEvent,
  recipientPubkey: string,
  senderPrivkeyHex: string
): Promise<NostrEvent> {
  const result = await welshmanCreateGiftWrap(
    innerEvent as unknown as HashedEvent,
    recipientPubkey,
    senderPrivkeyHex
  )
  return result as unknown as NostrEvent
}

/**
 * Decrypt NIP-17 Gift Wrap (async wrapper for backward compatibility).
 */
export async function decryptGiftWrap(
  wrapEvent: NostrEvent,
  recipientPrivkeyHex: string
): Promise<NostrEvent | null> {
  const result = await welshmanDecryptGiftWrap(
    wrapEvent as unknown as SignedEvent,
    recipientPrivkeyHex
  )
  return result as unknown as NostrEvent | null
}

export { verifyEvent } from 'nostr-tools'
