import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import MaskedText from '@/components/chat/MaskedText'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('MaskedText', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reveals text initially then masks after seconds', () => {
    render(<MaskedText text="hello" seconds={2} chars="░" />)
    expect(screen.getByText('hello')).toBeTruthy()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.queryByText('hello')).toBeNull()
  })

  it('resets the mask timer when scrollBumpedAt changes', () => {
    const { rerender } = render(<MaskedText text="hello" seconds={2} chars="░" />)
    act(() => vi.advanceTimersByTime(1000))
    // Simulate a user scroll bump.
    rerender(<MaskedText text="hello" seconds={2} chars="░" scrollBumpedAt={1} />)
    // The old 2s timer would have fired at 2s; the new timer fires 2s after the bump.
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('hello')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByText('hello')).toBeNull()
  })

  it('scroll bump reveals a masked message and resets its timer', () => {
    const { rerender } = render(<MaskedText text="hello" seconds={2} chars="░" />)
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByText('hello')).toBeNull()

    // User scroll bump resets the timer and reveals the message.
    rerender(<MaskedText text="hello" seconds={2} chars="░" scrollBumpedAt={2} />)
    expect(screen.getByText('hello')).toBeTruthy()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.queryByText('hello')).toBeNull()
  })

  it('click reveals masked text and re-masks after seconds', () => {
    render(<MaskedText text="hello" seconds={2} chars="░" />)
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByText('hello')).toBeNull()
    act(() => fireEvent.click(screen.getByRole('button')))
    expect(screen.getByText('hello')).toBeTruthy()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.queryByText('hello')).toBeNull()
  })

  it('shows plaintext when seconds is 0', () => {
    render(<MaskedText text="hello" seconds={0} chars="░" />)
    expect(screen.getByText('hello')).toBeTruthy()
  })
})
