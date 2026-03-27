// publish.ts - Welshman publish with per-relay status tracking
// Wraps welshman's publish() to provide thunk-like status tracking

import { publish } from '@welshman/net'
import type { SignedEvent } from '@welshman/util'
import type { PublishResult, PublishResultsByRelay } from '@welshman/net'
import { PublishStatus } from '@welshman/net'
import { connectToRelays } from './relay-manager'
import type { DeliveryStatus } from '@/lib/nostr/types'

const DEFAULT_PUBLISH_TIMEOUT = 8000

export interface PublishHandle {
  /** Per-relay publish results, updated as relays respond */
  readonly results: PublishResultsByRelay
  /** Aggregate delivery status derived from per-relay results */
  readonly status: DeliveryStatus
  /** Promise that resolves when all relays have responded or timed out */
  readonly done: Promise<PublishResultsByRelay>
  /** Abort the publish attempt */
  abort: () => void
}

/**
 * Map welshman PublishStatus to dodo-box DeliveryStatus.
 */
function aggregateStatus(results: PublishResultsByRelay): DeliveryStatus {
  const statuses = Object.values(results)
  if (statuses.length === 0) return 'pending'

  if (statuses.some(r => r.status === PublishStatus.Success)) return 'sent'
  if (statuses.every(r =>
    r.status === PublishStatus.Failure ||
    r.status === PublishStatus.Timeout ||
    r.status === PublishStatus.Aborted
  )) return 'failed'

  return 'pending'
}

/**
 * Publish a signed event to multiple relays with status tracking.
 * Returns a PublishHandle for monitoring per-relay status.
 */
export function publishWithTracking(
  event: SignedEvent,
  relayUrls: readonly string[],
  options?: { timeout?: number }
): PublishHandle {
  connectToRelays(relayUrls)

  const controller = new AbortController()
  const results: PublishResultsByRelay = {}

  const done = publish({
    event,
    relays: [...relayUrls],
    timeout: options?.timeout ?? DEFAULT_PUBLISH_TIMEOUT,
    signal: controller.signal,
    onSuccess: (result: PublishResult) => {
      results[result.relay] = result
    },
    onFailure: (result: PublishResult) => {
      results[result.relay] = result
    },
    onPending: (result: PublishResult) => {
      results[result.relay] = result
    },
    onTimeout: (result: PublishResult) => {
      results[result.relay] = result
    },
    onAborted: (result: PublishResult) => {
      results[result.relay] = result
    },
  })

  return {
    get results() { return results },
    get status() { return aggregateStatus(results) },
    done,
    abort: () => controller.abort(),
  }
}

/**
 * Simple publish that returns aggregate success/failure.
 * Convenience wrapper for cases where per-relay tracking is not needed.
 */
export async function publishSimple(
  event: SignedEvent,
  relayUrls: readonly string[]
): Promise<boolean> {
  const handle = publishWithTracking(event, relayUrls)
  const results = await handle.done
  return Object.values(results).some(r => r.status === PublishStatus.Success)
}
