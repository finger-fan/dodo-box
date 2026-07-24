import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  maskText,
  getCharsById,
  getMaskSeconds,
  setMaskSeconds,
  getMaskCharsetId,
  setMaskCharsetId,
  getMaskSwipeEnabled,
  setMaskSwipeEnabled,
  getMaskSwipeThreshold,
  setMaskSwipeThreshold,
  MASK_CHARSETS,
  DEFAULT_CHARSET_ID,
  DEFAULT_MASK_SECONDS,
  DEFAULT_MASK_SWIPE_ENABLED,
  DEFAULT_MASK_SWIPE_THRESHOLD,
} from '@/lib/message-mask'
import { StorageKey } from '@/lib/storage'

describe('message-mask', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      get length() { return Object.keys(store).length },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as Storage)
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis)
  })

  describe('maskText', () => {
    it('returns empty string for empty input', () => {
      expect(maskText('', 'abc')).toBe('')
    })

    it('returns original text when chars is empty', () => {
      expect(maskText('hello', '')).toBe('hello')
    })

    it('preserves whitespace and length', () => {
      const text = 'hello world'
      const chars = '░▒▓'
      const masked = maskText(text, chars)
      expect(masked.length).toBe(text.length)
      expect(masked[5]).toBe(' ')
      expect(masked).toMatch(/^[\s░▒▓]+$/)
    })

    it('only uses characters from the provided charset', () => {
      const text = 'abc'
      const chars = '가나다'
      const masked = maskText(text, chars)
      for (const ch of masked) {
        expect(chars).toContain(ch)
      }
    })

    it('preserves newlines and tabs', () => {
      const text = 'line1\nline2\tline3'
      const chars = '░▒▓'
      const masked = maskText(text, chars)
      expect(masked[5]).toBe('\n')
      expect(masked[11]).toBe('\t')
    })
  })

  describe('getCharsById', () => {
    it('returns chars for known id', () => {
      expect(getCharsById('blocks')).toBe('░▒▓█▚▙▛▜▞')
    })

    it('falls back to default charset for unknown id', () => {
      expect(getCharsById('nonexistent')).toBe(getCharsById(DEFAULT_CHARSET_ID))
    })
  })

  describe('localStorage getters/setters', () => {
    it('getMaskSeconds returns default when not set', () => {
      expect(getMaskSeconds()).toBe(DEFAULT_MASK_SECONDS)
    })

    it('setMaskSeconds persists and getMaskSeconds retrieves', () => {
      setMaskSeconds(10)
      expect(getMaskSeconds()).toBe(10)
    })

    it('getMaskCharsetId returns default when not set', () => {
      expect(getMaskCharsetId()).toBe(DEFAULT_CHARSET_ID)
    })

    it('setMaskCharsetId persists and getMaskCharsetId retrieves', () => {
      setMaskCharsetId('hangul')
      expect(getMaskCharsetId()).toBe('hangul')
    })

    it('getMaskCharsetId falls back to default for unknown id', () => {
      localStorage.setItem(StorageKey.MASK_CHARSET, 'unknown')
      expect(getMaskCharsetId()).toBe(DEFAULT_CHARSET_ID)
    })

    it('getMaskSeconds handles non-numeric gracefully', () => {
      localStorage.setItem(StorageKey.MASK_SECONDS, 'not-a-number')
      expect(getMaskSeconds()).toBe(DEFAULT_MASK_SECONDS)
    })

    it('getMaskSeconds handles negative values gracefully', () => {
      localStorage.setItem(StorageKey.MASK_SECONDS, '-5')
      expect(getMaskSeconds()).toBe(DEFAULT_MASK_SECONDS)
    })

    it('getMaskSwipeEnabled returns default when not set', () => {
      expect(getMaskSwipeEnabled()).toBe(DEFAULT_MASK_SWIPE_ENABLED)
    })

    it('setMaskSwipeEnabled persists and getMaskSwipeEnabled retrieves', () => {
      setMaskSwipeEnabled(false)
      expect(getMaskSwipeEnabled()).toBe(false)
    })

    it('getMaskSwipeThreshold returns default when not set', () => {
      expect(getMaskSwipeThreshold()).toBe(DEFAULT_MASK_SWIPE_THRESHOLD)
    })

    it('setMaskSwipeThreshold persists and rounds values', () => {
      setMaskSwipeThreshold(123.7)
      expect(getMaskSwipeThreshold()).toBe(124)
    })

    it('getMaskSwipeThreshold falls back to default for invalid values', () => {
      localStorage.setItem(StorageKey.MASK_SWIPE_THRESHOLD, 'not-a-number')
      expect(getMaskSwipeThreshold()).toBe(DEFAULT_MASK_SWIPE_THRESHOLD)
      localStorage.setItem(StorageKey.MASK_SWIPE_THRESHOLD, '-10')
      expect(getMaskSwipeThreshold()).toBe(DEFAULT_MASK_SWIPE_THRESHOLD)
    })
  })

  describe('MASK_CHARSETS', () => {
    it('contains expected presets', () => {
      const ids = MASK_CHARSETS.map(c => c.id)
      expect(ids).toContain('blocks')
      expect(ids).toContain('hangul')
      expect(ids).toContain('braille')
      expect(ids).toContain('mongolian')
    })

    it('each charset has non-empty chars', () => {
      for (const cs of MASK_CHARSETS) {
        expect(cs.chars.length).toBeGreaterThan(0)
      }
    })
  })
})
