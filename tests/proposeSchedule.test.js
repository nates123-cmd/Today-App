import { describe, it, expect } from 'vitest'
// REAL shipped heuristic — no re-implementation.
import {
  parseEst,
  isDeep,
  blockMinutes,
  scoreTask,
  budgetParams,
  freeMinutes,
  earliestSlot,
  proposeSchedule,
  flattenPillars,
} from '../src/lib/proposeSchedule.js'
import { daysFromToday } from '../src/lib/surfaceActions.js'

// Fixed reference "today" so urgency math is deterministic. Local-noon avoids
// DST/midnight edge ambiguity (same convention as surfaceActions.test.js).
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

// ─────────── pure leaf helpers ───────────

describe('parseEst', () => {
  it('parses h/m/combined/bare-number forms', () => {
    expect(parseEst('2h')).toBe(120)
    expect(parseEst('45m')).toBe(45)
    expect(parseEst('1h30m')).toBe(90)
    expect(parseEst('90m')).toBe(90)
    expect(parseEst('45')).toBe(45)
    expect(parseEst('1.5h')).toBe(90)
  })
  it('returns null for empty/garbage', () => {
    expect(parseEst(null)).toBe(null)
    expect(parseEst('')).toBe(null)
    expect(parseEst('soon')).toBe(null)
  })
})

describe('isDeep / blockMinutes', () => {
  it('explicit depth wins over est', () => {
    expect(isDeep({ depth: 'deep', est: '5m' })).toBe(true)
    expect(isDeep({ depth: 'admin', est: '3h' })).toBe(false)
  })
  it('heuristic: >=30m deep, <30m admin, null defaults deep', () => {
    expect(isDeep({ est: '45m' })).toBe(true)
    expect(isDeep({ est: '15m' })).toBe(false)
    expect(isDeep({ est: null })).toBe(true)
  })
  it('snaps into 45/60 vocab (split at 53)', () => {
    expect(blockMinutes({ est: '2h' })).toBe(60)
    expect(blockMinutes({ est: '45m' })).toBe(45)
    expect(blockMinutes({ est: '52m' })).toBe(45)
    expect(blockMinutes({ est: '53m' })).toBe(60)
    expect(blockMinutes({ est: null })).toBe(45)
  })
})

describe('budgetParams', () => {
  it('no row -> neutral (0.55 / 210)', () => {
    expect(budgetParams(null)).toEqual({ factor: 0.55, cap: 210 })
    expect(budgetParams(undefined)).toEqual({ factor: 0.55, cap: 210 })
  })
  it('scales by readiness band', () => {
    expect(budgetParams(90).cap).toBe(300)
    expect(budgetParams(75).cap).toBe(240)
    expect(budgetParams(65).cap).toBe(180)
    expect(budgetParams(40).cap).toBe(120)
  })
})

describe('freeMinutes', () => {
  it('whole window when no obstacles', () => {
    expect(freeMinutes(WINDOW, [])).toBe(600) // 8..18 = 10h
  })
  it('subtracts merged obstacle intervals', () => {
    const obs = [
      { hour: 9, duration_minutes: 60, type: 'meeting' }, // 9-10
      { hour: 9.5, duration_minutes: 60, type: 'meeting' }, // 9:30-10:30 (overlaps)
    ]
    expect(freeMinutes(WINDOW, obs)).toBe(600 - 90) // merged 9:00-10:30
  })
})

describe('earliestSlot (post-meeting buffer, Q5)', () => {
  it('inserts a 15m buffer after a long (>=60m) meeting', () => {
    const meeting = [{ hour: 8, duration_minutes: 180, type: 'meeting' }] // 8:00-11:00
    expect(earliestSlot(WINDOW, meeting, 45)).toBe(11.25) // 11:15, not 11:00
  })
  it('no buffer after a short meeting or a non-meeting obstacle', () => {
    const routine = [{ hour: 8, duration_minutes: 180, type: 'routine' }] // 8:00-11:00
    expect(earliestSlot(WINDOW, routine, 45)).toBe(11) // 11:00 ok
    const short = [{ hour: 8, duration_minutes: 45, type: 'meeting' }] // 8:00-8:45
    expect(earliestSlot(WINDOW, short, 45)).toBe(8.75) // 8:45 ok, no buffer
  })
  it('returns null when nothing fits', () => {
    const full = [{ hour: 8, duration_minutes: 600, type: 'routine' }]
    expect(earliestSlot(WINDOW, full, 45)).toBe(null)
  })
})

// ─────────── proposeSchedule — the 10 spec cases ───────────

describe('proposeSchedule', () => {
  it('1. empty backlog -> []', () => {
    expect(propose({ tasks: [], obstacles: [], readiness: null })).toEqual([])
  })

  it('2. all tasks waiting/blocked -> []', () => {
    const tasks = [task({ status: 'waiting' }), task({ status: 'blocked' })]
    expect(propose({ tasks, obstacles: [], readiness: null })).toEqual([])
  })

  it('3. fully booked (free < 45) -> []', () => {
    const tasks = [task({ pillar: 'arrow' })]
    const obstacles = [{ hour: 8, duration_minutes: 600, type: 'routine' }] // whole window
    expect(propose({ tasks, obstacles, readiness: null })).toEqual([])
  })

  it('4. no Oura row -> neutral budget applied, still produces blocks', () => {
    const tasks = [task({ pillar: 'arrow', est: '45m' })]
    const out = propose({ tasks, obstacles: [], readiness: null })
    expect(out.length).toBe(1)
    expect(out[0].pillar).toBe('arrow')
  })

  it('5. overdue sidegig outranks non-urgent arrow', () => {
    const tasks = [
      task({ id: 'a', pillar: 'arrow', status: 'next' }), // 40+30 = 70
      task({ id: 's', pillar: 'sidegig', status: 'next', doDate: '2026-05-31' }), // 20+30+65 = 115
    ]
    const out = propose({ tasks, obstacles: [], readiness: null })
    expect(out[0].pillar).toBe('sidegig') // highest base placed first (morning bias)
  })

  it('6. per-pillar decay diversifies (2 arrow then sunny, not 3 arrow)', () => {
    // arrow base = 40 (rank) + 10 (doDate 5d out) = 50; sunny base = 30.
    // window 8-14 (360 free) at neutral 0.55 -> budget 198 -> exactly three 60m blocks.
    const tasks = [
      task({ id: 'a1', pillar: 'arrow', est: '60m', doDate: '2026-06-06' }),
      task({ id: 'a2', pillar: 'arrow', est: '60m', doDate: '2026-06-06' }),
      task({ id: 'a3', pillar: 'arrow', est: '60m', doDate: '2026-06-06' }),
      task({ id: 's1', pillar: 'sunny', est: '60m' }),
    ]
    const out = proposeSchedule({
      tasks,
      obstacles: [],
      readiness: null,
      daysFromToday: dft,
      window: { first: 8, last: 14 },
      projectsById: {},
    })
    expect(out.length).toBe(3)
    expect(out.filter((b) => b.pillar === 'arrow').length).toBe(2)
    expect(out.filter((b) => b.pillar === 'sunny').length).toBe(1)
  })

  it('7. parseEst -> block sizing / admin exclusion in the pipeline', () => {
    const tasks = [
      task({ id: 'big', pillar: 'arrow', est: '2h' }), // 60 block
      task({ id: 'mid', pillar: 'arrow', est: '45m' }), // 45 block
      task({ id: 'adm', pillar: 'arrow', est: '15m' }), // admin -> excluded
      task({ id: 'nul', pillar: 'arrow', est: null }), // 45 block (default deep)
    ]
    const out = propose({ tasks, obstacles: [], readiness: null })
    const byId = Object.fromEntries(out.map((b) => [b.sourceId, b]))
    expect(byId.big.duration).toBe(60)
    expect(byId.mid.duration).toBe(45)
    expect(byId.nul.duration).toBe(45)
    expect(byId.adm).toBeUndefined() // sub-30 admin never placed
  })

  it('8. post-meeting buffer pushes deep work past a long meeting', () => {
    const tasks = [task({ id: 'x', pillar: 'arrow', est: '45m' })]
    const obstacles = [{ hour: 8, duration_minutes: 180, type: 'meeting' }] // 8:00-11:00
    const out = propose({ tasks, obstacles, readiness: null })
    expect(out[0].hour).toBeGreaterThanOrEqual(11.25) // 11:15, never 11:00
  })

  it('9. morning bias: highest-base block lands in the earliest slot', () => {
    const tasks = [
      task({ id: 'lo', pillar: 'life', est: '45m' }), // base 10
      task({ id: 'hi', pillar: 'arrow', est: '45m', status: 'in_progress' }), // base 80
    ]
    const out = propose({ tasks, obstacles: [], readiness: null })
    const hi = out.find((b) => b.sourceId === 'hi')
    const lo = out.find((b) => b.sourceId === 'lo')
    expect(hi.hour).toBe(8) // earliest viable slot
    expect(hi.hour).toBeLessThan(lo.hour)
  })

  it('10. one block per task — never placed twice', () => {
    const tasks = [task({ id: 'solo', pillar: 'arrow', est: '45m' })]
    const out = propose({ tasks, obstacles: [], readiness: null })
    expect(out.filter((b) => b.sourceId === 'solo').length).toBe(1)
  })

  it('output blocks are 15-min snapped and inside the window', () => {
    const tasks = [
      task({ id: 'a', pillar: 'arrow', est: '60m' }),
      task({ id: 'b', pillar: 'sunny', est: '45m' }),
    ]
    const out = propose({ tasks, obstacles: [], readiness: null })
    for (const b of out) {
      expect((b.hour * 60) % 15).toBe(0)
      expect(b.hour).toBeGreaterThanOrEqual(8)
      expect(b.hour + b.duration / 60).toBeLessThanOrEqual(18)
    }
  })
})

// ─────────── flattenPillars (handler glue) ───────────

describe('flattenPillars', () => {
  it('stamps the bucket pillar id onto every task and builds projectsById', () => {
    const pillars = [
      {
        id: 'arrow',
        openTasks: [{ id: 'o1', label: 'orphan', pillar: 'Arrow' }],
        projects: [
          { id: 'p1', name: 'Proj', dueDate: '2026-06-10', tasks: [{ id: 't1', label: 'sub', pillar: null }] },
        ],
      },
      { id: 'open', openTasks: [{ id: 'o2', label: 'unassigned' }], projects: [] },
    ]
    const { tasks, projectsById } = flattenPillars(pillars)
    expect(tasks.find((t) => t.id === 'o1').pillar).toBe('arrow') // normalized, not raw 'Arrow'
    expect(tasks.find((t) => t.id === 't1').pillar).toBe('arrow')
    expect(tasks.find((t) => t.id === 'o2').pillar).toBe('open')
    expect(projectsById.p1.due_date).toBe('2026-06-10') // camelCase -> snake for scoreTask
  })
})
