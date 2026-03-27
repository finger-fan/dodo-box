// router-config.ts - Welshman router configuration for relay selection
// Configures intelligent relay routing based on pubkey hints and quality scores

import { Router, routerContext } from '@welshman/router'
import type { RouterOptions } from '@welshman/router'
import { getRelayQuality } from './relay-quality'

const DEFAULT_RELAYS = (
  process.env.NEXT_PUBLIC_DEFAULT_RELAYS || 'wss://relay.damus.io'
).split(',')

const RELAY_LIMIT = 3

let currentUserPubkey: string | undefined

// Per-pubkey relay hints (learned from events)
const pubkeyRelays = new Map<string, { read: string[]; write: string[]; messaging: string[] }>()

/**
 * Set the current user's pubkey for routing decisions.
 */
export function setRouterUserPubkey(pubkey: string | undefined): void {
  currentUserPubkey = pubkey
}

/**
 * Register relay hints for a pubkey (from NIP-65 relay lists or event hints).
 */
export function setPubkeyRelays(
  pubkey: string,
  relays: { read?: string[]; write?: string[]; messaging?: string[] }
): void {
  const existing = pubkeyRelays.get(pubkey) || { read: [], write: [], messaging: [] }
  pubkeyRelays.set(pubkey, {
    read: relays.read || existing.read,
    write: relays.write || existing.write,
    messaging: relays.messaging || existing.messaging,
  })
}

/**
 * Get router options for configuring welshman Router.
 */
function getRouterOptions(): RouterOptions {
  return {
    getUserPubkey: () => currentUserPubkey,

    getPubkeyRelays: (pubkey: string, mode?: string) => {
      const entry = pubkeyRelays.get(pubkey)
      if (!entry) return DEFAULT_RELAYS

      if (mode === 'write') return entry.write.length > 0 ? entry.write : DEFAULT_RELAYS
      if (mode === 'messaging') return entry.messaging.length > 0 ? entry.messaging : DEFAULT_RELAYS
      return entry.read.length > 0 ? entry.read : DEFAULT_RELAYS
    },

    getDefaultRelays: () => DEFAULT_RELAYS,

    getIndexerRelays: () => DEFAULT_RELAYS,

    getSearchRelays: () => DEFAULT_RELAYS,

    getRelayQuality: (url: string) => getRelayQuality(url),

    getLimit: () => RELAY_LIMIT,
  }
}

/**
 * Initialize the router with current configuration.
 * Call this after engine initialization.
 */
export function initRouter(): void {
  if (typeof window === 'undefined') return

  const options = getRouterOptions()
  Object.assign(routerContext, options)
  Router.configure(options)
}

/**
 * Get a configured Router instance.
 */
export function getRouter(): Router {
  return Router.get()
}

/**
 * Get optimal relay URLs for sending DMs to a recipient.
 */
export function getRelaysForDM(recipientPubkey: string): string[] {
  const router = getRouter()
  const scenario = router.MessagesForPubkey(recipientPubkey)
  return scenario.getUrls()
}

/**
 * Get optimal relay URLs for fetching a user's profile.
 */
export function getRelaysForProfile(pubkey: string): string[] {
  const router = getRouter()
  const scenario = router.FromPubkey(pubkey)
  return scenario.getUrls()
}

/**
 * Get optimal relay URLs for fetching a user's follows list.
 */
export function getRelaysForFollows(pubkey: string): string[] {
  const router = getRouter()
  const scenario = router.FromPubkey(pubkey)
  return scenario.getUrls()
}

/**
 * Get the configured default relays.
 */
export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS]
}
