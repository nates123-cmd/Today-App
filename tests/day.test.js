import { describe, it, expect } from 'vitest'
// REAL shipped date helpers — no re-implementation.
import {
  isoDate,
  addDays,
  tomorrowISO,
  yesterdayISO,
  isPlanningTomorrow,
  focusDateISO,
  PLANNING_HANDOVER_HOUR,
} from '../src/lib/day.js'

// These tests run under TZ=America/New_York (set in vitest.config.js) because
// the bug being guarded is timezone-specific: it only appears west of UTC.
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min)

describe('isoDate — the evening rollover regression', () => {
  // The whole reason this module exists. `toISOString().slice(0,10)` returns the
  // UTC day, so from 8pm ET it already reads as tomorrow and every surface in
  // the app shifted forward a day — during the exact hours the night-before
  // planning ritual runs.
  it('stays on the local day all evening, when toISOString would have rolled', () => {
    for (const hour of [19, 20, 21, 22, 23]) {
      const d = at(2026, 9, 1, hour)
      expect(isoDate(d)).toBe('2026-09-01')
    }
    // Prove the old approach really does break, so this test fails loudly if
    // anyone "simplifies" isoDate back to toISOString.
    expect(at(2026, 9, 1, 21).toISOString().slice(0, 10)).toBe('2026-09-02')
  })

  it('flips at local midnight, not before', () => {
    expect(isoDate(at(2026, 9, 1, 23, 59))).toBe('2026-09-01')
    expect(isoDate(at(2026, 9, 2, 0, 1))).toBe('2026-09-02')
  })

  it('zero-pads month and day', () => {
    expect(isoDate(at(2026, 1, 5, 9))).toBe('2026-01-05')
  })

  it('handles a winter (EST) evening too', () => {
    // UTC-5 in January: 8pm ET is 1am UTC the next day.
    expect(isoDate(at(2026, 1, 15, 20))).toBe('2026-01-15')
  })
})

describe('addDays / tomorrowISO / yesterdayISO', () => {
  it('gives the next and previous calendar day', () => {
    const base = at(2026, 9, 1, 21) // evening — the case that used to break
    expect(tomorrowISO(base)).toBe('2026-09-02')
    expect(yesterdayISO(base)).toBe('2026-08-31')
  })

  it('crosses month and year boundaries', () => {
    expect(tomorrowISO(at(2026, 8, 31, 22))).toBe('2026-09-01')
    expect(tomorrowISO(at(2026, 12, 31, 22))).toBe('2027-01-01')
    expect(yesterdayISO(at(2026, 1, 1, 2))).toBe('2025-12-31')
  })

  it('does not mutate the date it is given', () => {
    const base = at(2026, 9, 1, 12)
    const before = base.getTime()
    addDays(5, base)
    expect(base.getTime()).toBe(before)
  })

  it('survives a DST fall-back day without skipping', () => {
    // 2026-11-01 is the US DST end. Adding a day must still land on the 2nd.
    expect(tomorrowISO(at(2026, 11, 1, 12))).toBe('2026-11-02')
  })
})

describe('the 7pm planning handover', () => {
  it('treats the day as today before the handover hour', () => {
    const morning = at(2026, 9, 1, 9)
    expect(isPlanningTomorrow(morning)).toBe(false)
    expect(focusDateISO(morning)).toBe('2026-09-01')
  })

  it('switches to tomorrow from 7pm', () => {
    const evening = at(2026, 9, 1, PLANNING_HANDOVER_HOUR)
    expect(isPlanningTomorrow(evening)).toBe(true)
    expect(focusDateISO(evening)).toBe('2026-09-02')
  })

  it('does not switch a minute early', () => {
    const justBefore = at(2026, 9, 1, PLANNING_HANDOVER_HOUR - 1, 59)
    expect(isPlanningTomorrow(justBefore)).toBe(false)
    expect(focusDateISO(justBefore)).toBe('2026-09-01')
  })

  it('still points at the correct next day late at night', () => {
    // The combination that was doubly broken before: late evening AND a
    // next-day lookup.
    expect(focusDateISO(at(2026, 9, 1, 23, 30))).toBe('2026-09-02')
  })
})
