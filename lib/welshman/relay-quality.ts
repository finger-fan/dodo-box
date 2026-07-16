// relay-quality.ts - Relay quality scoring based on response metrics
// Tracks latency, error rate, and uptime to score relay reliability

const QUALITY_STORAGE_KEY = 'dodobox_relay_quality'

interface RelayMetrics {
  successCount: number
  failureCount: number
  totalLatencyMs: number
  lastSeen: number // timestamp
}

// In-memory cache
const metrics = new Map<string, RelayMetrics>()

function loadMetrics(): void {
  if (typeof window === 'undefined') return

  try {
    const raw = localStorage.getItem(QUALITY_STORAGE_KEY)
    if (!raw) return
    const parsed: Record<string, RelayMetrics> = JSON.parse(raw)
    for (const [url, m] of Object.entries(parsed)) {
      metrics.set(url, m)
    }
  } catch {
    // non-critical
  }
}

function saveMetrics(): void {
  if (typeof window === 'undefined') return

  try {
    const obj: Record<string, RelayMetrics> = {}
    for (const [url, m] of metrics.entries()) {
      obj[url] = m
    }
    localStorage.setItem(QUALITY_STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // non-critical
  }
}

// Load on module init (client-side only)
if (typeof window !== 'undefined') {
  loadMetrics()
}

/**
 * Record a successful relay interaction.
 */
export function recordSuccess(url: string, latencyMs: number): void {
  const existing = metrics.get(url) || { successCount: 0, failureCount: 0, totalLatencyMs: 0, lastSeen: 0 }
  metrics.set(url, {
    successCount: existing.successCount + 1,
    failureCount: existing.failureCount,
    totalLatencyMs: existing.totalLatencyMs + latencyMs,
    lastSeen: Date.now(),
  })
  saveMetrics()
}

/**
 * Record a failed relay interaction.
 */
export function recordFailure(url: string): void {
  const existing = metrics.get(url) || { successCount: 0, failureCount: 0, totalLatencyMs: 0, lastSeen: 0 }
  metrics.set(url, {
    ...existing,
    failureCount: existing.failureCount + 1,
    lastSeen: Date.now(),
  })
  saveMetrics()
}

/**
 * Get quality score for a relay (0-1, where 1 is best).
 * Used by welshman Router for relay selection.
 */
export function getRelayQuality(url: string): number {
  const m = metrics.get(url)
  if (!m) return 0.5 // unknown relay gets neutral score

  const total = m.successCount + m.failureCount
  if (total === 0) return 0.5

  // Success rate (0-1)
  const successRate = m.successCount / total

  // Average latency penalty (lower is better, capped at 5s)
  const avgLatency = m.successCount > 0 ? m.totalLatencyMs / m.successCount : 5000
  const latencyScore = Math.max(0, 1 - avgLatency / 5000)

  // Recency bonus (decay over 24 hours)
  const hoursSinceLastSeen = (Date.now() - m.lastSeen) / (1000 * 60 * 60)
  const recencyScore = Math.max(0, 1 - hoursSinceLastSeen / 24)

  // Weighted combination
  return successRate * 0.5 + latencyScore * 0.3 + recencyScore * 0.2
}

/**
 * Get all tracked relay URLs with their quality scores.
 */
export function getAllRelayQualities(): Array<{ url: string; quality: number }> {
  const results: Array<{ url: string; quality: number }> = []
  for (const url of metrics.keys()) {
    results.push({ url, quality: getRelayQuality(url) })
  }
  return results.sort((a, b) => b.quality - a.quality)
}

/**
 * Clear all relay quality data.
 */
export function clearRelayQuality(): void {
  metrics.clear()
  if (typeof window !== 'undefined') {
    localStorage.removeItem(QUALITY_STORAGE_KEY)
  }
}
