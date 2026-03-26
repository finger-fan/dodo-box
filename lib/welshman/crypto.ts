// crypto.ts - Welshman signer/Nip59 based event signing and gift wrap
// Replaces the gift wrap logic in lib/nostr/events.ts

import { Nip59, Nip01Signer } from '@welshman/signer'
import { makeEvent, type SignedEvent, type HashedEvent, type StampedEvent } from '@welshman/util'
import { DIRECT_MESSAGE, WRAP, PROFILE, FOLLOWS, HANDLER_INFORMATION } from '@welshman/util'
import { getPubkey, sign as signRaw, prep } from '@welshman/util'

/**
 * Create a Nip01Signer from a hex private key.
 */
export function createSigner(privkeyHex: string): Nip01Signer {
  return Nip01Signer.fromSecret(privkeyHex)
}

/**
 * Create a Nip59 instance for gift wrapping DMs.
 */
export function createNip59(privkeyHex: string): Nip59 {
  return Nip59.fromSecret(privkeyHex)
}

/**
 * Sign a Nostr event using welshman's synchronous signing.
 */
export function signEvent(
  kind: number,
  content: string,
  tags: string[][],
  privkeyHex: string
): SignedEvent {
  const pubkey = getPubkey(privkeyHex)
  const event = prep(makeEvent(kind, { content, tags }), pubkey)
  return signRaw(event, privkeyHex) as SignedEvent
}

/**
 * Build a kind-0 profile event.
 */
export function buildProfileEvent(
  profile: Record<string, string>,
  privkeyHex: string
): SignedEvent {
  return signEvent(PROFILE, JSON.stringify(profile), [], privkeyHex)
}

/**
 * Build a kind-3 follow list event.
 */
export function buildFollowListEvent(
  contacts: ReadonlyArray<{ pubkey: string; petname?: string }>,
  privkeyHex: string
): SignedEvent {
  const tags = contacts.map(c => ['p', c.pubkey, '', c.petname || ''])
  return signEvent(FOLLOWS, '', tags, privkeyHex)
}

/**
 * Build a kind-14 direct message event (the inner rumor).
 */
export function buildDirectMessageEvent(
  content: string,
  recipientPubkey: string,
  senderPrivkeyHex: string,
  seq?: number
): SignedEvent {
  const tags: string[][] = [['p', recipientPubkey]]
  if (seq !== undefined) {
    tags.push(['seq', String(seq)])
  }
  return signEvent(DIRECT_MESSAGE, content, tags, senderPrivkeyHex)
}

/**
 * NIP-17 Gift Wrap: wrap a kind-14 DM into a kind-1059 sealed event.
 * Uses welshman's Nip59 for proper sealing and wrapping.
 */
export async function createGiftWrap(
  innerEvent: HashedEvent,
  recipientPubkey: string,
  senderPrivkeyHex: string
): Promise<SignedEvent> {
  const nip59 = createNip59(senderPrivkeyHex)
  const template: StampedEvent = {
    kind: innerEvent.kind,
    content: innerEvent.content,
    tags: innerEvent.tags,
    created_at: innerEvent.created_at,
  }
  return nip59.wrap(recipientPubkey, template, [['p', recipientPubkey]])
}

/**
 * Decrypt a NIP-17 Gift Wrap (kind-1059) to recover the inner rumor.
 */
export async function decryptGiftWrap(
  wrapEvent: SignedEvent,
  recipientPrivkeyHex: string
): Promise<HashedEvent | null> {
  try {
    const nip59 = createNip59(recipientPrivkeyHex)
    return await nip59.unwrap(wrapEvent)
  } catch (error) {
    console.error('[welshman/crypto] decryptGiftWrap failed:', error)
    return null
  }
}

/**
 * Build a vault event (kind 31990 - HANDLER_INFORMATION used as vault storage).
 */
export function buildVaultEvent(
  encryptedContent: string,
  privkeyHex: string
): SignedEvent {
  return signEvent(
    HANDLER_INFORMATION,
    encryptedContent,
    [['d', 'doracle-vault']],
    privkeyHex
  )
}
