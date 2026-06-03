// Proposed Schedule Generator — the heuristic, as a pure function.
//
// Companion to `proposed-schedule-decisions.md`. `proposeSchedule` is I/O- and
// React-free so it can be unit-tested like `surfaceActions`. The thin handler
// (`useProposedSchedule`) does the reads/writes and stamps `source`.
//
// Block vocabulary is deep-only for v1: 45 or 60 minutes. Tasks are classified
// deep/admin (admin not placed), scored by pillar + status + urgency, selected
// greedily against a readiness-capped minutes budget with per-pillar decay, then
// placed earliest-first around immovable obstacles (meetings/routines).

const DEFAULT_DEEP = 45 // est missing -> under-commit on a draft you'll review
const ADMIN_LINE = 30 // >=30 deep, <30 admin (spec §6)
const PILLAR_RANK = { arrow: 4, sunny: 3, sidegig: 2, life: 1, open: 0 }
const PILLAR_DECAY = 0.7 // per-pillar diminishing returns during selection (Q6)
const MEETING_BUFFER_MIN = 15 // cool-down after a long meeting before deep work
const LONG_MEETING_MIN = 60 // a meeting >= this earns the post-meeting buffer
const SNAP_MIN = 15 // all starts snap to 15-minute steps

// "1h30m" | "90m" | "2h" | "45" -> minutes | null
export function parseEst(est) {
  if (!est) return null
  const s = String(est).toLowerCase()
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/),
    m = s.match(/(\d+)\s*m/)
  let mins = 0,
    ok = false
  if (h) {
    mins += parseFloat(h[1]) * 60
    ok = true
  }
  if (m) {
    mins += parseInt(m[1], 10)
    ok = true
  }
  if (!ok) {
    const n = parseFloat(s)
    if (!isNaN(n)) {
      mins = n
      ok = true
    }
  }
  return ok ? mins : null
}

export function isDeep(t) {
  if (t.depth === 'deep') return true // explicit wins (§6)
  if (t.depth === 'admin') return false
  const m = parseEst(t.est)
  return m == null ? true : m >= ADMIN_LINE // null est defaults to deep
}

export function blockMinutes(t) {
  // snap into 45/60 vocab
  const m = parseEst(t.est) ?? DEFAULT_DEEP
  return m >= 53 ? 60 : 45 // 60 caps a single session
}

export function scoreTask(t, daysFromToday, projectsById) {
  if (t.status === 'waiting' || t.status === 'blocked') return -Infinity
  if (!isDeep(t)) return -Infinity // v1: deep only
  let s = 10 * (PILLAR_RANK[t.pillar] ?? 0) // fixed order as base
  s += t.status === 'in_progress' ? 40 : t.status === 'next' ? 30 : 0
  if (t.doDate) {
    const d = daysFromToday(t.doDate)
    if (d != null) {
      s +=
        d < 0
          ? 60 + Math.min(40, -d * 5) // overdue escalates
          : d <= 3
            ? 50 - d * 5 // surfaceActions urgent window
            : Math.max(0, 25 - d * 3) // decays out
    }
  }
  const proj = t.projectId ? projectsById[t.projectId] : null
  if (proj?.due_date) {
    const pd = daysFromToday(proj.due_date)
    if (pd != null) s += pd < 0 ? 25 : Math.max(0, 20 - pd * 3)
  }
  return s
}

export function budgetParams(r) {
  if (r == null) return { factor: 0.55, cap: 210 }
  if (r >= 85) return { factor: 0.65, cap: 300 }
  if (r >= 70) return { factor: 0.55, cap: 240 }
  if (r >= 60) return { factor: 0.45, cap: 180 }
  return { factor: 0.35, cap: 120 }
}

// ─────────── interval helpers (minutes-based for precision) ───────────

// An obstacle/occupied interval's duration: obstacles carry `duration_minutes`,
// output blocks carry `duration`. Normalize here so callers can mix shapes.
function durOf(o) {
  return o.duration_minutes ?? o.duration ?? 0
}

// Busy intervals in minutes-from-midnight. With `withBuffer`, a long meeting
// (type==='meeting', duration >= 60) gets a trailing 15m cool-down so deep work
// never lands cold off a long call (Q5).
function busyIntervals(occupied, withBuffer) {
  const out = []
  for (const o of occupied) {
    const start = o.hour * 60
    const dur = durOf(o)
    if (dur <= 0) continue
    out.push([start, start + dur])
    if (withBuffer && o.type === 'meeting' && dur >= LONG_MEETING_MIN) {
      out.push([start + dur, start + dur + MEETING_BUFFER_MIN])
    }
  }
  return out
}

// Merge overlapping/adjacent intervals; returns sorted, disjoint [start,end].
function mergeIntervals(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged
}

// Total open minutes in [first, last] after subtracting obstacle intervals.
// Buffers are NOT counted against free time here (that's a placement concern);
// this is the raw availability the budget scales off of.
export function freeMinutes(window, obstacles) {
  const startMin = window.first * 60
  const endMin = window.last * 60
  const clipped = busyIntervals(obstacles, false)
    .map(([s, e]) => [Math.max(s, startMin), Math.min(e, endMin)])
    .filter(([s, e]) => e > s)
  const busy = mergeIntervals(clipped).reduce((sum, [s, e]) => sum + (e - s), 0)
  return endMin - startMin - busy
}

// Earliest 15-min-snapped start in [first, last] where [start, start+durMin]
// overlaps nothing in `occupied` (obstacles + post-long-meeting buffers).
// Returns a decimal hour, or null if no slot fits.
export function earliestSlot(window, occupied, durMin) {
  const startMin = window.first * 60
  const endMin = window.last * 60
  const busy = mergeIntervals(busyIntervals(occupied, true))
  for (let s = startMin; s + durMin <= endMin; s += SNAP_MIN) {
    const e = s + durMin
    const clash = busy.some(([bs, be]) => s < be && bs < e)
    if (!clash) return s / 60
  }
  return null
}

// ─────────── the heuristic ───────────

export function proposeSchedule({
  tasks,
  obstacles = [],
  readiness,
  daysFromToday,
  projectsById = {},
  window = { first: 8, last: 18 },
}) {
  const free = freeMinutes(window, obstacles)
  if (free < 45) return [] // no deep-work room (Q9)

  const { factor, cap } = budgetParams(readiness?.readiness_score)
  let budget = Math.min(cap, Math.round(free * factor))

  const pool = tasks
    .map((t) => ({ t, base: scoreTask(t, daysFromToday, projectsById), dur: blockMinutes(t) }))
    .filter((x) => x.base > -Infinity && x.dur <= budget)
  if (!pool.length) return []

  // greedy select with per-pillar decay (Q6); one block per task (spliced out)
  const perPillar = {},
    picks = []
  while (budget >= 45) {
    let bi = -1,
      beff = -Infinity
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].dur > budget) continue
      const eff = pool[i].base * Math.pow(PILLAR_DECAY, perPillar[pool[i].t.pillar] || 0)
      if (eff > beff) {
        beff = eff
        bi = i
      }
    }
    if (bi < 0) break
    const p = pool.splice(bi, 1)[0]
    picks.push(p)
    perPillar[p.t.pillar] = (perPillar[p.t.pillar] || 0) + 1
    budget -= p.dur
  }

  // place highest-value first -> earliest viable slot (Q5 morning bias)
  picks.sort((a, b) => b.base - a.base)
  const occupied = [...obstacles],
    out = []
  for (const { t, dur } of picks) {
    const hour = earliestSlot(window, occupied, dur)
    if (hour == null) continue // no room, skip gracefully
    out.push({
      type: t.pillar,
      hour,
      duration: dur,
      title: t.label,
      pillar: t.pillar,
      projectId: t.projectId ?? null,
      sourceId: t.id ?? null, // round-trip to the originating task
    })
    occupied.push({ hour, duration_minutes: dur })
  }
  return out
}

// ─────────── handler glue (still pure) ───────────

// usePillars returns tasks grouped into pillar buckets. proposeSchedule wants a
// flat task list (each task carrying its NORMALIZED pillar id — the bucket it
// landed in, not its raw `pillar` tag) plus a projectsById lookup exposing
// `due_date`. Flatten here so the hook stays a thin I/O layer.
export function flattenPillars(pillars) {
  const tasks = []
  const projectsById = {}
  for (const p of pillars ?? []) {
    for (const t of p.openTasks ?? []) tasks.push({ ...t, pillar: p.id })
    for (const proj of p.projects ?? []) {
      projectsById[proj.id] = { id: proj.id, name: proj.name, due_date: proj.dueDate ?? null }
      for (const t of proj.tasks ?? []) tasks.push({ ...t, pillar: p.id })
    }
  }
  return { tasks, projectsById }
}
