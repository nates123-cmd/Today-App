import { describe, it, expect } from 'vitest'
// REAL shipped heuristic — no re-implementation.
import { proposeSchedule } from '../src/lib/proposeSchedule.js'
import { daysFromToday } from '../src/lib/surfaceActions.js'

// Same fixed reference day as proposeSchedule.test.js so urgency math is
// deterministic. Local-noon avoids DST/midnight edge ambiguity.
const TODAY = new Date(2026, 5, 1, 12, 0, 0) // 2026-06-01
const dft = (iso) => daysFromToday(iso, TODAY)
const WINDOW = { first: 8, last: 18 }

function task(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    label: over.label ?? 'task',
    est: 'est' in over ? over.est : '45m',
    depth: over.depth ?? null,
    status: over.status ?? 'todo',
    doDate: over.doDate ?? null,
    projectId: over.projectId ?? null,
    pillar: over.pillar ?? 'open',
  }
}

const propose = (extra) =>
  proposeSchedule({ daysFromToday: dft, window: WINDOW, projectsById: {}, ...extra })

// Denying a suggestion is a promise: regenerating must not put it back.
describe('proposeSchedule — excludeTaskIds (denied suggestions)', () => {
  it('never proposes a denied task', () => {
    const keep = task({ id: 'keep', status: 'next', pillar: 'arrow' })
    const nope = task({ id: 'nope', status: 'in_progress', pillar: 'arrow' })
    const out = propose({ tasks: [keep, nope], excludeTaskIds: ['nope'] })
    expect(out.length).toBeGreaterThan(0)
    expect(out.map((b) => b.sourceId)).not.toContain('nope')
  })

  it('backfills the freed budget with the next-best task', () => {
    const a = task({ id: 'a', status: 'in_progress', pillar: 'arrow' })
    const b = task({ id: 'b', status: 'next', pillar: 'arrow' })
    const before = propose({ tasks: [a, b] })
    const after = propose({ tasks: [a, b], excludeTaskIds: ['a'] })
    // Denying the top pick must not shrink the day — 'b' takes the slot.
    expect(before.map((x) => x.sourceId)).toContain('a')
    expect(after.map((x) => x.sourceId)).toContain('b')
    expect(after.map((x) => x.sourceId)).not.toContain('a')
  })

  it('returns nothing when every candidate is denied', () => {
    const t = task({ id: 'only', status: 'next' })
    expect(propose({ tasks: [t], excludeTaskIds: ['only'] })).toEqual([])
  })

  it('defaults to proposing everything when no denials are passed', () => {
    const t = task({ id: 'x', status: 'next' })
    expect(propose({ tasks: [t] }).map((b) => b.sourceId)).toEqual(['x'])
  })

  it('ignores denials for tasks that are not in the pool', () => {
    const t = task({ id: 'x', status: 'next' })
    expect(propose({ tasks: [t], excludeTaskIds: ['ghost'] }).map((b) => b.sourceId)).toEqual(['x'])
  })
})
