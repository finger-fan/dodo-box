// polyfills.ts - Browser API polyfills for older WebViews
//
// Android System WebView (e.g. Huawei WebView 114) predates
// AbortSignal.any (Chrome 116+). welshman's request() calls it
// whenever a caller passes a signal — our live subscriptions do,
// fetches don't — so on old WebViews every subscription REQ threw
// before being sent, leaving live messaging silently dead while
// fetches kept working.

import { createLogger } from '@/lib/logger'

const log = createLogger('Polyfills')

export function ensurePolyfills(): void {
  if (typeof AbortSignal === 'undefined') return

  if (typeof (AbortSignal as { any?: unknown }).any !== 'function') {
    log.warn('AbortSignal.any missing (old WebView), applying polyfill')
    ;(AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any = (
      signals: AbortSignal[]
    ): AbortSignal => {
      const controller = new AbortController()
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort(signal.reason)
          break
        }
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
      }
      return controller.signal
    }
  }
}
