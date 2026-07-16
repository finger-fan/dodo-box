// quality.ts — Relay quality monitoring for CLI
// Tracks latency and success rate per relay

import { connectToRelays, publishEvent } from './relay-node'
import type { SignedEvent } from '@welshman/util'

export interface RelayQuality {
  url: string
  avgLatencyMs: number
  successRate: number
  totalRequests: number
  successfulRequests: number
  lastTested: Date
}

/**
 * In-memory quality tracking per relay.
 */
const qualityMap = new Map<string, RelayQuality>()

/**
 * Initialize quality tracking for a set of relays.
 */
export function initTracking(relayUrls: string[]): void {
  for (const url of relayUrls) {
    if (!qualityMap.has(url)) {
      qualityMap.set(url, {
        url,
        avgLatencyMs: 0,
        successRate: 0,
        totalRequests: 0,
        successfulRequests: 0,
        lastTested: new Date(0),
      })
    }
  }
}

/**
 * Test a single relay's connection latency and publish capability.
 */
export async function testRelayQuality(
  relayUrl: string,
  testPrivkey: string
): Promise<RelayQuality> {
  const start = Date.now()
  let success = false

  try {
    // Connect to the relay
    connectToRelays([relayUrl])

    // Try to publish a test event using welshman crypto
    const { buildDirectMessageEvent } = await import('@/lib/welshman/crypto')
    const testEvent = buildDirectMessageEvent(
      `dodobox-cli-test-${Date.now()}`,
      testPrivkey,
      testPrivkey
    ) as SignedEvent

    const results = await publishEvent(testEvent, [relayUrl], { timeout: 5000 })
    success = Object.values(results).some((r: { status: string }) => r.status === 'published')
  } catch {
    success = false
  }

  const elapsed = Date.now() - start
  const quality = qualityMap.get(relayUrl)!

  quality.totalRequests++
  if (success) {
    quality.successfulRequests++
  }
  quality.avgLatencyMs = Math.round(
    ((quality.avgLatencyMs * (quality.totalRequests - 1)) + elapsed) / quality.totalRequests
  )
  quality.successRate = quality.successfulRequests / quality.totalRequests
  quality.lastTested = new Date()

  return quality
}

/**
 * Test all tracked relays and return quality report.
 */
export async function testAllRelays(testPrivkey: string): Promise<RelayQuality[]> {
  const relays = Array.from(qualityMap.keys())
  const results: RelayQuality[] = []

  console.log('\n  Testing relay quality...\n')

  for (const relay of relays) {
    const quality = await testRelayQuality(relay, testPrivkey)
    results.push(quality)

    const icon = quality.successRate >= 0.8 ? '✅' : quality.successRate > 0 ? '⚠️' : '❌'
    console.log(`  ${icon} ${relay}`)
    console.log(`     Latency: ${quality.avgLatencyMs}ms | Success: ${(quality.successRate * 100).toFixed(0)}%`)
  }

  console.log('')
  return results
}

/**
 * Get best relay by quality score.
 */
export function getBestRelay(): string | null {
  let best: RelayQuality | null = null

  for (const q of qualityMap.values()) {
    if (!best || q.successRate > best.successRate ||
        (q.successRate === best.successRate && q.avgLatencyMs < best.avgLatencyMs)) {
      best = q
    }
  }

  return best?.url || null
}

/**
 * Print quality report.
 */
export function printReport(): void {
  const relays = Array.from(qualityMap.values())

  if (relays.length === 0) {
    console.log('  No relays being tracked.')
    return
  }

  console.log('\n  Relay Quality Report:')
  console.log('  ──────────────────────────────────────')
  console.log('  URL'.padEnd(35) + 'Latency'.padEnd(12) + 'Success')
  console.log('  ──────────────────────────────────────')

  for (const q of relays.sort((a, b) => b.successRate - a.successRate)) {
    const status = q.successRate >= 0.8 ? '✅' : q.successRate > 0 ? '⚠️' : '❌'
    console.log(
      `${status} ${q.url.padEnd(35)}${String(q.avgLatencyMs + 'ms').padEnd(12)}${(q.successRate * 100).toFixed(0) + '%'}`
    )
  }

  console.log('  ──────────────────────────────────────\n')
}
