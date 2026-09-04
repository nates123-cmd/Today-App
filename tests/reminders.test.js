import { describe, it, expect } from 'vitest'
// REAL shipped label logic — no re-implementation.
import { dueLabelFor } from '../src/lib/useReminders.js'

// TZ is pinned to America/New_York in vitest.config.js.
const NOW = new Date(2026, 8, 4, 10, 0, 0) // 2026-09-04, local morning

describe('dueLabelFor', () => {
  it('labels the current day', () => {
    expect(dueLabelFor('2026-09-04', NOW)).toBe('today')
  })

  it('labels the next day', () => {
    expect(dueLabelFor('2026-09-05', NOW)).toBe('tomorrow')
  })

  it('labels overdue relative to the real today, not the planned day', () => {
    // The strip is rendered while planning TOMORROW, but something due
    // yesterday must still read as overdue rather than "1 day ago from the
    // day being planned".
    expect(dueLabelFor('2026-09-03', NOW)).toBe('overdue by a day')
    expect(dueLabelFor('2026-08-30', NOW)).toBe('overdue by 5 days')
  })

  it('returns null for dates outside the window', () => {
    // Anything past tomorrow has no label — those rows are filtered out by the
    // query, so a label would be misleading if one ever appeared.
    expect(dueLabelFor('2026-09-07', NOW)).toBeNull()
  })

  it('returns null for a missing or unparseable date', () => {
    expect(dueLabelFor(null, NOW)).toBeNull()
    expect(dueLabelFor('', NOW)).toBeNull()
    expect(dueLabelFor('not-a-date', NOW)).toBeNull()
  })

  it('does not shift across a late-evening boundary', () => {
    // The UTC-date bug class: at 9pm ET, "today" must still be the 4th.
    const evening = new Date(2026, 8, 4, 21, 30, 0)
    expect(dueLabelFor('2026-09-04', evening)).toBe('today')
    expect(dueLabelFor('2026-09-05', evening)).toBe('tomorrow')
  })
})
