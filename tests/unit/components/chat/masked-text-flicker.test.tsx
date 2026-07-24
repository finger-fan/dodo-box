import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { useState, useRef } from 'react'
import MaskedText from '@/components/chat/MaskedText'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Simulates ChatView's scroll-aware mask behavior: only user wheel/touch swipes
// that move the container by at least `swipeThreshold` px bump the per-message
// mask timer; programmatic auto-scroll does not.
function ChatViewWithThreshold({
  maskSeconds,
  swipeThreshold = 100,
}: {
  maskSeconds: number
  swipeThreshold?: number
}) {
  const [messages, setMessages] = useState([{ id: 'm1', text: 'hello' }])
  const [scrollBumpedAt, setScrollBumpedAt] = useState<number | undefined>(undefined)
  const wheelDeltaRef = useRef(0)
  const gestureStartScrollRef = useRef<number | null>(null)
  const hasBumpedRef = useRef(false)
  const gestureResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const bump = () => {
    setScrollBumpedAt(Date.now())
  }

  const resetGesture = () => {
    wheelDeltaRef.current = 0
    gestureStartScrollRef.current = null
    hasBumpedRef.current = false
    gestureResetTimerRef.current = null
  }

  const scheduleReset = () => {
    if (gestureResetTimerRef.current) clearTimeout(gestureResetTimerRef.current)
    gestureResetTimerRef.current = setTimeout(resetGesture, 150)
  }

  return (
    <div>
      <button
        data-testid="add-msg"
        onClick={() => {
          setMessages((prev) => [...prev, { id: `m${prev.length + 1}`, text: 'new' }])
          setTimeout(() => {
            containerRef.current?.scrollTo({ top: 1000 })
          }, 0)
        }}
      >
        Add message
      </button>
      <div
        ref={containerRef}
        data-testid="scroll-container"
        onScroll={() => {
          const el = containerRef.current
          if (!el || gestureStartScrollRef.current === null || hasBumpedRef.current) return
          const delta = Math.abs(el.scrollTop - gestureStartScrollRef.current)
          if (delta >= swipeThreshold) {
            bump()
            hasBumpedRef.current = true
          }
        }}
        onWheel={(e) => {
          if (hasBumpedRef.current) return
          wheelDeltaRef.current += Math.abs(e.deltaY)
          if (wheelDeltaRef.current >= swipeThreshold) {
            bump()
            hasBumpedRef.current = true
          }
          scheduleReset()
        }}
        onTouchStart={() => {
          gestureStartScrollRef.current = containerRef.current?.scrollTop ?? 0
          hasBumpedRef.current = false
          if (gestureResetTimerRef.current) {
            clearTimeout(gestureResetTimerRef.current)
            gestureResetTimerRef.current = null
          }
        }}
        onTouchEnd={() => scheduleReset()}
        style={{ height: 100, overflow: 'auto' }}
      >
        {messages.map((msg) => (
          <div key={msg.id}>
            <MaskedText text={msg.text} seconds={maskSeconds} chars="░" scrollBumpedAt={scrollBumpedAt} />
          </div>
        ))}
      </div>
    </div>
  )
}

describe('MaskedText scroll threshold behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Element.prototype.scrollTo = vi.fn(function (this: Element, options?: ScrollToOptions | number) {
      const top = typeof options === 'number' ? options : options?.top ?? 0
      this.scrollTop = top
      this.dispatchEvent(new Event('scroll', { bubbles: false }))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not re-reveal an already-masked message when auto-scroll triggers scroll', () => {
    render(<ChatViewWithThreshold maskSeconds={5} />)

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('hello')).toBeNull()

    act(() => {
      fireEvent.click(screen.getByTestId('add-msg'))
    })
    act(() => vi.advanceTimersByTime(0))

    expect(screen.queryByText('hello')).toBeNull()
  })

  it('does not bump the timer on a small wheel movement below the threshold', () => {
    render(<ChatViewWithThreshold maskSeconds={5} swipeThreshold={100} />)

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('hello')).toBeNull()

    act(() => {
      fireEvent.wheel(screen.getByTestId('scroll-container'), { deltaY: 50 })
    })

    expect(screen.queryByText('hello')).toBeNull()
  })

  it('bumps the timer when wheel movement reaches the threshold', () => {
    render(<ChatViewWithThreshold maskSeconds={5} swipeThreshold={100} />)

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('hello')).toBeNull()

    act(() => {
      fireEvent.wheel(screen.getByTestId('scroll-container'), { deltaY: 120 })
    })

    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('does not bump the timer on a tap without scroll', () => {
    render(<ChatViewWithThreshold maskSeconds={5} swipeThreshold={100} />)

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('hello')).toBeNull()

    act(() => {
      fireEvent.touchStart(screen.getByTestId('scroll-container'))
      fireEvent.touchEnd(screen.getByTestId('scroll-container'))
    })

    expect(screen.queryByText('hello')).toBeNull()
  })
})
