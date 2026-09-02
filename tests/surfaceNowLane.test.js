import { describe, it, expect } from 'vitest'
// REAL shipped logic — no re-implementation.
import { surfaceActions } from '../src/lib/surfaceActions.js'

// Course+ runs a pull method: a task in the Now lane is what Nate deliberately
// chose to work on, so a collapsed project row must show THAT, not whatever
// happens to sort first in the Icebox pile. Before this, nothing mapped to
// 'now', nothing was 'next' either, and the fallback surfaced `incomplete[0]`.
const TODAY = new Date(2026, 5, 1, 12, 0, 0) // 2026-06-01 local
const task = (id, status = 'icebox', doDate = null) => ({ id, status, doDate })

describe('surfaceActions — the Now lane', () => {
  it('surfaces a pulled task over list order', () => {
    const tasks = [task('pile1'), task('pulled', 'now'), task('pile2')]
    expect(surfaceActions(tasks, TODAY).primary.id).toBe('pulled')
  })

  it('prefers the pulled task over a flagged next task', () => {
    const tasks = [task('flagged', 'next'), task('pulled', 'now')]
    expect(surfaceActions(tasks, TODAY).primary.id).toBe('pulled')
  })

  it('keeps an urgent task visible alongside the pulled one', () => {
    // Urgency still matters: the pulled task becomes the second surfaced row
    // rather than hiding something that is nearly due.
    const tasks = [task('pulled', 'now'), task('duesoon', 'icebox', '2026-06-02')]
    const r = surfaceActions(tasks, TODAY)
    expect(r.state).toBe('urgent_double')
    expect(r.primary.id).toBe('duesoon')
    expect(r.secondary.id).toBe('pulled')
  })

  it('falls back to list order when nothing is pulled or flagged', () => {
    expect(surfaceActions([task('first'), task('second')], TODAY).primary.id).toBe('first')
  })

  it('surfaces the first pulled task when a project has several', () => {
    const tasks = [task('a', 'now'), task('b', 'now')]
    expect(surfaceActions(tasks, TODAY).primary.id).toBe('a')
  })

  it('ignores the dead legacy in_progress value', () => {
    // `in-progress` has had no writer in Course+ since the 2026-06 rebuild, so
    // a stale one must not outrank the real Now lane.
    const tasks = [task('stale', 'in_progress'), task('pulled', 'now')]
    expect(surfaceActions(tasks, TODAY).primary.id).toBe('pulled')
  })
})
