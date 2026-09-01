import { describe, it, expect } from 'vitest'
// REAL shipped briefing logic — no re-implementation.
import {
  buildBriefing,
  flattenForBriefing,
  pillarTimeBank,
  BRIEFING_GROUPS,
} from '../src/lib/tomorrowBriefing.js'

// The day being PLANNED. Every expectation below is relative to this, not to
// the real "now" — that relativity is the whole point of the stage-2 briefing.
const PLAN_DATE = '2026-06-02'

function task(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    label: over.label ?? 'task',
    est: 'est' in over ? over.est : '45m',
    depth: over.depth ?? null,
    status: over.status ?? 'open',
    doDate: over.doDate ?? null,
    projectId: over.projectId ?? null,
  }
}

// Minimal usePillars-shaped fixture.
function pillars(spec) {
  return Object.entries(spec).map(([id, v]) => ({
    id,
    name: id,
    color: id,
    openTasks: v.openTasks ?? [],
    projects: v.projects ?? [],
  }))
}

const groupsOf = (b) => Object.fromEntries(b.groups.map((g) => [g.key, g.items]))

describe('flattenForBriefing', () => {
  it('flattens project + orphan tasks with pillar and project names attached', () => {
    const p = pillars({
      arrow: {
        openTasks: [task({ id: 'orphan' })],
        projects: [{ id: 'p1', name: 'Rebuild', tasks: [task({ id: 't1' })] }],
      },
    })
    const rows = flattenForBriefing(p)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === 't1')).toMatchObject({
      pillar: 'arrow',
      pillarName: 'arrow',
      projectName: 'Rebuild',
    })
    // An orphan task has no project, and must not inherit a stale name.
    expect(rows.find((r) => r.id === 'orphan').projectName).toBeNull()
  })

  it('is safe on empty / missing input', () => {
    expect(flattenForBriefing(undefined)).toEqual([])
    expect(flattenForBriefing([{ id: 'a', name: 'a' }])).toEqual([])
  })
})

describe('buildBriefing — bucketing', () => {
  it('dates are relative to the planned day, not to now', () => {
    const p = pillars({
      arrow: {
        projects: [
          {
            id: 'p1',
            name: 'P',
            tasks: [
              task({ id: 'yesterday', doDate: '2026-06-01' }), // day before plan
              task({ id: 'planday', doDate: '2026-06-02' }), // the plan day itself
              task({ id: 'twodays', doDate: '2026-06-04' }),
              task({ id: 'faroff', doDate: '2026-07-30' }),
            ],
          },
        ],
      },
    })
    const g = groupsOf(buildBriefing(p, PLAN_DATE))
    expect(g.overdue.map((t) => t.id)).toEqual(['yesterday'])
    // The critical one: due ON the planned day reads as "due", never "in 1d".
    expect(g.due.map((t) => t.id)).toEqual(['planday'])
    expect(g.soon.map((t) => t.id)).toEqual(['twodays'])
    // Far-future, untouched backlog is not briefing material.
    expect(g.soon.some((t) => t.id === 'faroff')).toBe(false)
  })

  it('falls back to status buckets when a task has no due date', () => {
    const p = pillars({
      life: {
        projects: [
          {
            id: 'p1',
            name: 'P',
            tasks: [
              task({ id: 'a', status: 'in_progress' }),
              task({ id: 'b', status: 'next' }),
              task({ id: 'c', status: 'open' }), // plain backlog — excluded
            ],
          },
        ],
      },
    })
    const g = groupsOf(buildBriefing(p, PLAN_DATE))
    expect(g.in_progress.map((t) => t.id)).toEqual(['a'])
    expect(g.next.map((t) => t.id)).toEqual(['b'])
    expect(g.next.some((t) => t.id === 'c')).toBe(false)
  })

  it('a due date wins over status — each task appears exactly once', () => {
    const p = pillars({
      arrow: {
        projects: [
          { id: 'p1', name: 'P', tasks: [task({ id: 'x', status: 'in_progress', doDate: '2026-05-30' })] },
        ],
      },
    })
    const b = buildBriefing(p, PLAN_DATE)
    const appearances = b.groups.flatMap((g) => g.items).filter((t) => t.id === 'x')
    expect(appearances).toHaveLength(1)
    expect(groupsOf(b).overdue.map((t) => t.id)).toEqual(['x'])
    expect(b.total).toBe(1)
  })

  it('excludes waiting and blocked tasks even when overdue', () => {
    const p = pillars({
      arrow: {
        projects: [
          {
            id: 'p1',
            name: 'P',
            tasks: [
              task({ id: 'w', status: 'waiting', doDate: '2026-05-01' }),
              task({ id: 'bl', status: 'blocked', doDate: '2026-05-01' }),
              task({ id: 'ok', status: 'next', doDate: '2026-05-01' }),
            ],
          },
        ],
      },
    })
    const b = buildBriefing(p, PLAN_DATE)
    expect(b.total).toBe(1)
    expect(groupsOf(b).overdue.map((t) => t.id)).toEqual(['ok'])
  })

  it('orders groups agenda-first and drops empty ones', () => {
    const p = pillars({
      arrow: {
        projects: [
          {
            id: 'p1',
            name: 'P',
            tasks: [task({ id: 'n', status: 'next' }), task({ id: 'o', doDate: '2026-05-20' })],
          },
        ],
      },
    })
    const b = buildBriefing(p, PLAN_DATE)
    expect(b.groups.map((g) => g.key)).toEqual(['overdue', 'next'])
    // Order follows the declared group order, not insertion order.
    const declared = BRIEFING_GROUPS.map((g) => g.key)
    const idx = b.groups.map((g) => declared.indexOf(g.key))
    expect(idx).toEqual([...idx].sort((a, z) => a - z))
  })

  it('sorts within a group by soonest due first', () => {
    const p = pillars({
      arrow: {
        projects: [
          {
            id: 'p1',
            name: 'P',
            tasks: [
              task({ id: 'later', doDate: '2026-05-31' }),
              task({ id: 'oldest', doDate: '2026-05-01' }),
            ],
          },
        ],
      },
    })
    expect(groupsOf(buildBriefing(p, PLAN_DATE)).overdue.map((t) => t.id)).toEqual([
      'oldest',
      'later',
    ])
  })

  it('counts per pillar and totals across pillars', () => {
    const p = pillars({
      arrow: { projects: [{ id: 'a', name: 'A', tasks: [task({ status: 'next' })] }] },
      life: {
        projects: [{ id: 'b', name: 'B', tasks: [task({ status: 'next' }), task({ status: 'next' })] }],
      },
    })
    const b = buildBriefing(p, PLAN_DATE)
    expect(b.byPillar).toEqual({ arrow: 1, life: 2 })
    expect(b.total).toBe(3)
  })

  it('degrades to an empty briefing rather than throwing', () => {
    expect(buildBriefing([], PLAN_DATE)).toEqual({ groups: [], total: 0, byPillar: {} })
    expect(buildBriefing(undefined, PLAN_DATE).total).toBe(0)
  })
})

describe('pillarTimeBank', () => {
  it('rolls up projects, deep/admin counts and minutes per pillar', () => {
    const p = pillars({
      arrow: {
        projects: [
          {
            id: 'p1',
            name: 'P',
            tasks: [task({ est: '2h' }), task({ est: '10m' })], // deep + admin
          },
        ],
      },
    })
    expect(pillarTimeBank(p).arrow).toEqual({ projects: 1, deep: 1, admin: 1, mins: 130 })
  })

  it('assumes a default estimate for unestimated tasks', () => {
    const p = pillars({ life: { projects: [{ id: 'p', name: 'P', tasks: [task({ est: null })] }] } })
    // null est -> deep (proposeSchedule's rule) and the 45m default.
    expect(pillarTimeBank(p).life).toEqual({ projects: 1, deep: 1, admin: 0, mins: 45 })
  })

  it('leaves waiting/blocked work out of the time bank', () => {
    const p = pillars({
      sunny: {
        projects: [
          { id: 'p', name: 'P', tasks: [task({ est: '1h', status: 'waiting' }), task({ est: '1h' })] },
        ],
      },
    })
    expect(pillarTimeBank(p).sunny.mins).toBe(60)
  })

  it('reports an empty pillar as zeroes, not undefined', () => {
    expect(pillarTimeBank(pillars({ open: {} })).open).toEqual({
      projects: 0,
      deep: 0,
      admin: 0,
      mins: 0,
    })
  })
})
