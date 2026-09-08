import { describe, it, expect, vi, afterEach } from 'vitest'
import { fmtAge } from '../src/lib/useSyncAge.js'

const NOW = new Date('2026-09-08T18:00:00Z').getTime()

function at(offsetMs) {
  return new Date(NOW - offsetMs).toISOString()
}

function freeze() {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
}

describe('fmtAge', () => {
  afterEach(() => vi.useRealTimers())

  it('returns null for a missing timestamp', () => {
    expect(fmtAge(null)).toBe(null)
    expect(fmtAge(undefined)).toBe(null)
    expect(fmtAge('')).toBe(null)
  })

  it('returns null for an unparseable timestamp rather than NaN', () => {
    expect(fmtAge('not a date')).toBe(null)
  })

  it('reports minutes under an hour', () => {
    freeze()
    expect(fmtAge(at(5 * 60_000))).toBe('5m ago')
    expect(fmtAge(at(59 * 60_000))).toBe('59m ago')
  })

  it('reports hours up to a day', () => {
    freeze()
    expect(fmtAge(at(3 * 3_600_000))).toBe('3h ago')
    // The 5:30am -> 7pm planning gap that made the plan stale.
    expect(fmtAge(at(13.5 * 3_600_000))).toBe('14h ago')
  })

  it('reports days beyond that', () => {
    freeze()
    expect(fmtAge(at(3 * 86_400_000))).toBe('3d ago')
    // The ical feed silently died for ~100 days once; that has to read as days.
    expect(fmtAge(at(100 * 86_400_000))).toBe('100d ago')
  })

  it('clamps a future timestamp to 0 rather than going negative', () => {
    freeze()
    expect(fmtAge(at(-60 * 60_000))).toBe('0m ago')
  })
})
