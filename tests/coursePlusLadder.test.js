import { describe, it, expect } from 'vitest'
// REAL shipped ranking/bucketing — no re-implementation.
import { scoreTask, proposeSchedule } from '../src/lib/proposeSchedule.js'
import { buildBriefing } from '../src/lib/tomorrowBriefing.js'
import { daysFromToday } from '../src/lib/surfaceActions.js'

// Course+ runs Cal Newport's pull method: `now` is the small set deliberately
// pulled into focus (soft cap 3); everything else open is Icebox. Today used to
// collapse both into 'open', so a 2-task focus list was indistinguishable from
// a ~100-item pile. These tests lock the distinction in.

const TODAY = new Date(2026, 8, 2, 12, 0, 0) // 2026-09-02, local noon
const dft = (iso) => daysFromToday(iso, TODAY)
const WINDOW = { first: 8, last: 18 }

function task(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    label: over.label ?? 'task',
    est: 'est' in over ? over.est : '45m',
    depth: over.depth ?? null,
    status: over.status ?? 'icebox',
    doDate: over.doDate ?? null,
    projectId: over.projectId ?? null,
    pillar: over.pillar ?? 'arrow',
    sort: over.sort ?? null,
    rescheduleCount: over.rescheduleCount ?? 0,
  }
}
const score = (t) => scoreTask(t, dft, {})
const propose = (extra) =>
  proposeSchedule({ daysFromToday: dft, window: WINDOW, projectsById: {}, ...extra })

describe('the pull-method ladder', () => {
  it('ranks now above next, and next above icebox', () => {
    const now = score(task({ status: 'now' }))
    const next = score(task({ status: 'next' }))
    const icebox = score(task({ status: 'icebox' }))
    expect(now).toBeGreaterThan(next)
    expect(next).toBeGreaterThan(icebox)
  })

  it('still excludes waiting and blocked entirely', () => {
    expect(score(task({ status: 'waiting' }))).toBe(-Infinity)
    expect(score(task({ status: 'blocked' }))).toBe(-Infinity)
  })

  it('a pulled task beats an icebox task from a higher-ranked pillar', () => {
    // The regression that mattered: Arrow outranks Life by pillar, but an
    // Arrow icebox item must not beat something actually pulled into focus.
    const pulledLife = score(task({ status: 'now', pillar: 'life' }))
    const iceboxArrow = score(task({ status: 'icebox', pillar: 'arrow' }))
    expect(pulledLife).toBeGreaterThan(iceboxArrow)
  })

  it('schedules the Now lane first when the pile is far larger', () => {
    const pile = Array.from({ length: 30 }, (_, i) =>
      task({ id: `ice${i}`, status: 'icebox', sort: i })
    )
    const pulled = task({ id: 'pulled', status: 'now', sort: 0 })
    const out = propose({ tasks: [...pile, pulled] })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].sourceId).toBe('pulled')
  })

  it('still fills the day from icebox when nothing is pulled', () => {
    // Icebox is deprioritised, not banned — an empty Now lane must not mean an
    // empty day.
    const out = propose({ tasks: [task({ id: 'a', status: 'icebox' })] })
    expect(out.map((b) => b.sourceId)).toEqual(['a'])
  })
})

describe('manual drag order (Course+ `sort`)', () => {
  it('breaks ties toward the top of the project list', () => {
    expect(score(task({ status: 'icebox', sort: 0 }))).toBeGreaterThan(
      score(task({ status: 'icebox', sort: 9 }))
    )
  })

  it('does not let sort override the lane', () => {
    // A late-sorted pulled task still beats the first icebox item.
    expect(score(task({ status: 'now', sort: 20 }))).toBeGreaterThan(
      score(task({ status: 'icebox', sort: 0 }))
    )
  })
})

describe('drift (a task pushed 3+ times)', () => {
  it('surfaces a repeatedly-rescheduled task above an identical one', () => {
    expect(score(task({ status: 'icebox', rescheduleCount: 4 }))).toBeGreaterThan(
      score(task({ status: 'icebox', rescheduleCount: 0 }))
    )
  })
})

describe('briefing groups', () => {
  const pillars = (tasks) => [
    { id: 'arrow', name: 'Arrow', openTasks: [], projects: [{ id: 'p', name: 'P', tasks }] },
  ]
  const groups = (tasks) =>
    Object.fromEntries(buildBriefing(pillars(tasks), '2026-09-02').groups.map((g) => [g.key, g.items]))

  it('puts the Now lane first, ahead of overdue', () => {
    const b = buildBriefing(
      pillars([
        task({ id: 'old', status: 'icebox', doDate: '2026-08-01' }),
        task({ id: 'pulled', status: 'now' }),
      ]),
      '2026-09-02'
    )
    expect(b.groups[0].key).toBe('now')
    expect(b.groups[0].items.map((t) => t.id)).toEqual(['pulled'])
  })

  it('keeps a pulled task in Now even when it is also overdue', () => {
    const g = groups([task({ id: 'x', status: 'now', doDate: '2026-08-01' })])
    expect(g.now.map((t) => t.id)).toEqual(['x'])
    expect(g.overdue).toBeUndefined()
  })

  it('leaves the undated icebox pile out of the briefing entirely', () => {
    // This is the "Arrow has 26 items" complaint: the pile is real work, but
    // it is not what tomorrow is about.
    const pile = Array.from({ length: 30 }, (_, i) => task({ id: `i${i}`, status: 'icebox' }))
    expect(buildBriefing(pillars(pile), '2026-09-02').total).toBe(0)
  })

  it('still surfaces a dated icebox task', () => {
    const g = groups([task({ id: 'due', status: 'icebox', doDate: '2026-09-02' })])
    expect(g.due.map((t) => t.id)).toEqual(['due'])
  })

  it('orders within a group by drag order', () => {
    const g = groups([
      task({ id: 'second', status: 'now', sort: 5 }),
      task({ id: 'first', status: 'now', sort: 1 }),
    ])
    expect(g.now.map((t) => t.id)).toEqual(['first', 'second'])
  })
})
