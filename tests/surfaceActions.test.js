import { describe, it, expect } from 'vitest'
// REAL shipped logic — no re-implementation.
import { daysFromToday, surfaceActions } from '../src/lib/surfaceActions.js'

// Fixed reference "today" so the calendar-day math is deterministic regardless
// of when the suite runs. Local-noon avoids DST/midnight edge ambiguity.
const TODAY = new Date(2026, 5, 1, 12, 0, 0) // 2026-06-01 local

describe('daysFromToday', () => {
  it('returns null for blank / null / undefined', () => {
    expect(daysFromToday(null, TODAY)).toBe(null)
    expect(daysFromToday(undefined, TODAY)).toBe(null)
    expect(daysFromToday('', TODAY)).toBe(null)
  })

  it('returns null for a non-ISO / unparseable string', () => {
    expect(daysFromToday('not-a-date', TODAY)).toBe(null)
    expect(daysFromToday('2026-13-99', TODAY)).toBe(null)
  })

  it('returns 0 for today', () => {
    expect(daysFromToday('2026-06-01', TODAY)).toBe(0)
  })

  it('returns positive for future dates', () => {
    expect(daysFromToday('2026-06-02', TODAY)).toBe(1)
    expect(daysFromToday('2026-06-04', TODAY)).toBe(3)
    expect(daysFromToday('2026-06-08', TODAY)).toBe(7)
  })

  it('returns negative for overdue dates', () => {
    expect(daysFromToday('2026-05-31', TODAY)).toBe(-1)
    expect(daysFromToday('2026-05-29', TODAY)).toBe(-3)
  })

  it('ignores the time-of-day component of `today` (calendar-day delta)', () => {
    const lateToday = new Date(2026, 5, 1, 23, 59, 0)
    const earlyToday = new Date(2026, 5, 1, 0, 1, 0)
    expect(daysFromToday('2026-06-02', lateToday)).toBe(1)
    expect(daysFromToday('2026-06-02', earlyToday)).toBe(1)
  })

  it('crosses month and year boundaries by calendar day', () => {
    const newYearsEve = new Date(2026, 11, 31, 12, 0, 0)
    expect(daysFromToday('2027-01-01', newYearsEve)).toBe(1)
    expect(daysFromToday('2026-12-30', newYearsEve)).toBe(-1)
  })
})

// Helpers to build the `incomplete` task list surfaceActions expects.
const task = (id, status = 'in_progress', doDate = null) => ({ id, status, doDate })

describe('surfaceActions', () => {
  it('returns empty state for no tasks', () => {
    expect(surfaceActions([], TODAY)).toEqual({ state: 'empty', count: 0 })
    expect(surfaceActions(null, TODAY)).toEqual({ state: 'empty', count: 0 })
    expect(surfaceActions(undefined, TODAY)).toEqual({ state: 'empty', count: 0 })
  })

  it('normal: no due dates -> surfaces the `next` task, count excludes it', () => {
    const tasks = [task('a'), task('b', 'next'), task('c')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('normal')
    expect(r.primary.id).toBe('b')
    expect(r.count).toBe(2)
  })

  it('normal: falls back to first task when none are status=next', () => {
    const tasks = [task('a'), task('b'), task('c')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('normal')
    expect(r.primary.id).toBe('a')
    expect(r.count).toBe(2)
  })

  it('normal: a due date further than 3 days out is NOT urgent', () => {
    const tasks = [task('a', 'next'), task('b', 'in_progress', '2026-06-10')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('normal')
    expect(r.primary.id).toBe('a')
  })

  it('urgent_single: soonest urgent task IS the next candidate', () => {
    // 'a' is both status=next and due within 3 days -> single surfaced row.
    const tasks = [task('a', 'next', '2026-06-02'), task('b'), task('c')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('urgent_single')
    expect(r.primary.id).toBe('a')
    expect(r.count).toBe(2) // length - 1
  })

  it('urgent_single: an overdue (negative-day) task counts as urgent', () => {
    const tasks = [task('a', 'next', '2026-05-20')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('urgent_single')
    expect(r.primary.id).toBe('a')
    expect(r.count).toBe(0)
  })

  it('urgent_double: urgent task differs from the next candidate', () => {
    // 'next' is c, but b is due soon and is a different task -> show both.
    const tasks = [task('a'), task('b', 'in_progress', '2026-06-02'), task('c', 'next')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('urgent_double')
    expect(r.primary.id).toBe('b') // the urgent one
    expect(r.secondary.id).toBe('c') // the next candidate
    expect(r.count).toBe(1) // length - 2
  })

  it('urgent boundary: exactly 3 days out is urgent; 4 days is not', () => {
    expect(surfaceActions([task('a', 'next', '2026-06-04')], TODAY).state).toBe('urgent_single')
    expect(surfaceActions([task('a', 'next', '2026-06-05')], TODAY).state).toBe('normal')
  })

  it('picks the SOONEST due task among several urgent ones', () => {
    const tasks = [
      task('a', 'next'),
      task('b', 'in_progress', '2026-06-03'),
      task('c', 'in_progress', '2026-06-01'), // soonest
    ]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('urgent_double')
    expect(r.primary.id).toBe('c')
    expect(r.secondary.id).toBe('a')
  })
})
