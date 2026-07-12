// profile.ts — Profile fetching and caching for CLI
// Fetches Nostr profiles (kind:0) from relays

import { fetchEvents } from '../lib/messaging/relay-node'
import type { Filter, SignedEvent } from '@welshman/util'

export interface NostrProfile {
  pubkey: string
  name?: string
  displayName?: string
  picture?: string
  about?: string
  nip05?: string
}

/**
 * Cache for fetched profiles (in-memory).
 */
const profileCache = new Map<string, NostrProfile>()

/**
 * Fetch a user's profile from relays.
 */
export async function fetchProfile(
  pubkey: string,
  relayUrls: string[],
  useCache: boolean = true
): Promise<NostrProfile | null> {
  // Check cache first
  if (useCache && profileCache.has(pubkey)) {
    return profileCache.get(pubkey) || null
  }

  const filters: Filter[] = [{
    kinds: [0],
    authors: [pubkey],
    limit: 1,
  }]

  const events = await fetchEvents(filters, relayUrls, { timeout: 10000 })

  if (events.length === 0) {
    const emptyProfile: NostrProfile = { pubkey }
    profileCache.set(pubkey, emptyProfile)
    return emptyProfile
  }

  const signedEvent = events[0] as unknown as SignedEvent

  try {
    const profileData = JSON.parse(signedEvent.content) as Partial<NostrProfile>
    const profile: NostrProfile = {
      pubkey,
      name: profileData.name,
      displayName: profileData.displayName || profileData.name,
      picture: profileData.picture,
      about: profileData.about,
      nip05: profileData.nip05,
    }

    profileCache.set(pubkey, profile)
    return profile
  } catch {
    const profile: NostrProfile = { pubkey }
    profileCache.set(pubkey, profile)
    return profile
  }
}

/**
 * Fetch profiles for multiple pubkeys in parallel.
 */
export async function fetchProfiles(
  pubkeys: string[],
  relayUrls: string[]
): Promise<Map<string, NostrProfile>> {
  const results = new Map<string, NostrProfile>()

  const promises = pubkeys.map(async (pubkey) => {
    const profile = await fetchProfile(pubkey, relayUrls, false)
    results.set(pubkey, profile || { pubkey })
  })

  await Promise.all(promises)
  return results
}

/**
 * Clear the profile cache.
 */
export function clearProfileCache(): void {
  profileCache.clear()
}
