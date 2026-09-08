import { describe, it, expect } from 'vitest'
import { recurringKey, liveElapsed, fmtDuration } from '../src/lib/useBlockItems.js'

describe('recurringKey', () => {
  it('slugs a label', () => {
    expect(recurringKey('Maggetti posts')).toBe('maggetti-posts')
  })

  it('is stable across casing and punctuation, so a wording tweak does not orphan the history', () => {
    expect(recurringKey('Maggetti Posts.')).toBe('maggetti-posts')
    expect(recurringKey('  maggetti   posts  ')).toBe('maggetti-posts')
  })

  it('does not leave leading or trailing separators', () => {
    expect(recurringKey('— follow ups —')).toBe('follow-ups')
  })

  it('handles empty input', () => {
    expect(recurringKey('')).toBe('')
    expect(recurringKey(null)).toBe('')
  })
})

describe('liveElapsed', () => {
  const NOW = Date.parse('2026-09-08T14:00:00Z')

  it('returns banked seconds when the clock is stopped', () => {
    expect(liveElapsed({ elapsedSeconds: 90, startedAt: null }, NOW)).toBe(90)
  })

  it('adds the running leg to the banked total', () => {
    const startedAt = new Date(NOW - 30_000).toISOString()
    expect(liveElapsed({ elapsedSeconds: 90, startedAt }, NOW)).toBe(120)
  })

  it('treats a missing elapsed total as zero', () => {
    const startedAt = new Date(NOW - 60_000).toISOString()
    expect(liveElapsed({ startedAt }, NOW)).toBe(60)
  })

  it('never goes negative on a clock-skewed future start', () => {
    const startedAt = new Date(NOW + 60_000).toISOString()
    expect(liveElapsed({ elapsedSeconds: 10, startedAt }, NOW)).toBe(10)
  })

  it('ignores an unparseable timestamp rather than returning NaN', () => {
    expect(liveElapsed({ elapsedSeconds: 45, startedAt: 'nonsense' }, NOW)).toBe(45)
  })

  it('is safe on a null item', () => {
    expect(liveElapsed(null, NOW)).toBe(0)
  })
})

describe('fmtDuration', () => {
  it('renders under an hour as m:ss', () => {
    expect(fmtDuration(0)).toBe('0:00')
    expect(fmtDuration(65)).toBe('1:05')
    expect(fmtDuration(599)).toBe('9:59')
  })

  it('switches to h/m past an hour', () => {
    expect(fmtDuration(3600)).toBe('1h 00m')
    expect(fmtDuration(3600 + 5 * 60)).toBe('1h 05m')
  })

  it('clamps negatives to zero', () => {
    expect(fmtDuration(-10)).toBe('0:00')
  })

  it('rounds fractional seconds (averages divide unevenly)', () => {
    expect(fmtDuration(90 / 4)).toBe('0:23')
  })
})
