import { describe, it, expect } from 'vitest'
import { layoutSchedule, scheduleNow, moveId, fmtClock, activeStep } from '../src/lib/subSchedule.js'

const BLOCK = { hour: 9, duration: 90 }
const item = (id, position, estMinutes, done = false) => ({ id, position, estMinutes, done })

describe('layoutSchedule', () => {
  it('derives each start from the durations above it', () => {
    const l = layoutSchedule([item('a', 0, 30), item('b', 1, 15), item('c', 2, 25)], BLOCK)
    expect(l.rows.map((r) => [r.item.id, r.startHour, r.endHour])).toEqual([
      ['a', 9, 9.5],
      ['b', 9.5, 9.75],
      ['c', 9.75, 9.75 + 25 / 60],
    ])
    expect(l.plannedMinutes).toBe(70)
    expect(l.freeMinutes).toBe(20)
    expect(l.overMinutes).toBe(0)
  })

  it('orders by position, not array order', () => {
    const l = layoutSchedule([item('b', 1, 15), item('a', 0, 30)], BLOCK)
    expect(l.rows.map((r) => r.item.id)).toEqual(['a', 'b'])
  })

  it('keeps unsized steps out of the timeline; they hold no time', () => {
    const l = layoutSchedule([item('a', 0, 30), item('x', 1, null), item('b', 2, 15)], BLOCK)
    expect(l.unscheduled.map((i) => i.id)).toEqual(['x'])
    expect(l.rows[1].startHour).toBe(9.5)
  })

  it('flags the step that spills past the end of the block', () => {
    const l = layoutSchedule([item('a', 0, 60), item('b', 1, 45), item('c', 2, 15)], BLOCK)
    expect(l.overMinutes).toBe(30)
    expect(l.freeMinutes).toBe(0)
    expect(l.rows.map((r) => r.spills)).toEqual([false, true, true])
    expect(l.rows.map((r) => r.startsAfterEnd)).toEqual([false, false, true])
  })

  it('follows the block when it moves', () => {
    const l = layoutSchedule([item('a', 0, 30)], { hour: 13.5, duration: 60 })
    expect(l.rows[0].startHour).toBe(13.5)
    expect(l.blockEnd).toBe(14.5)
  })

  it('handles an empty block', () => {
    const l = layoutSchedule([], BLOCK)
    expect(l.rows).toEqual([])
    expect(l.freeMinutes).toBe(90)
  })
})

describe('scheduleNow', () => {
  const l = layoutSchedule([item('a', 0, 30), item('b', 1, 15), item('c', 2, 25)], BLOCK)

  it('finds the step the clock is in, and the one after', () => {
    const s = scheduleNow(l, 9 + 37 / 60)
    expect(s.current.item.id).toBe('b')
    expect(s.minutesLeft).toBe(8)
    expect(s.next.item.id).toBe('c')
  })

  it('reports unfinished earlier steps as late without moving anything', () => {
    const s = scheduleNow(l, 9.6)
    expect(s.late.map((r) => r.item.id)).toEqual(['a'])
    expect(s.current.startHour).toBe(9.5)
  })

  it('does not call a finished step late', () => {
    const done = layoutSchedule([item('a', 0, 30, true), item('b', 1, 15)], BLOCK)
    expect(scheduleNow(done, 9.6).late).toEqual([])
  })

  it('has no current step in open time at the end of the block', () => {
    const s = scheduleNow(l, 10.3)
    expect(s.current).toBe(null)
    expect(s.next).toBe(null)
  })
})

describe('activeStep', () => {
  const items = [item('a', 0, 30), item('b', 1, 15), item('c', 2, 25)].map((i) => ({
    ...i,
    label: i.id.toUpperCase(),
  }))

  it('schedule view follows the clock', () => {
    const s = activeStep(BLOCK, items, 'schedule', 9 + 37 / 60)
    expect(s.label).toBe('B')
    expect(s.meta).toBe('8 min left in this step')
    expect(s.next).toBe('C')
    expect(s.behind).toBe(1)
  })

  it('list view is the first thing not ticked off', () => {
    const s = activeStep(BLOCK, [{ ...items[0], done: true }, items[1], items[2]], 'list', 9.1)
    expect(s.label).toBe('B')
    expect(s.next).toBe('C')
  })

  it('is null for a block with no items, or nothing left', () => {
    expect(activeStep(BLOCK, [], 'schedule', 9.1)).toBe(null)
    expect(activeStep(BLOCK, items.map((i) => ({ ...i, done: true })), 'list', 9.1)).toBe(null)
  })
})

describe('moveId', () => {
  it('moves an id to a new index', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })
  it('clamps and ignores unknown ids', () => {
    expect(moveId(['a', 'b'], 'a', 9)).toEqual(['b', 'a'])
    expect(moveId(['a', 'b'], 'z', 0)).toEqual(['a', 'b'])
  })
})

describe('fmtClock', () => {
  it('formats decimal hours', () => {
    expect(fmtClock(9)).toBe('9:00a')
    expect(fmtClock(9.75)).toBe('9:45a')
    expect(fmtClock(12)).toBe('12:00p')
    expect(fmtClock(13 + 10 / 60)).toBe('1:10p')
  })
})
