// Tomorrow briefing — the Course+ / reminders half of the next-day plan.
//
// Stage 2 of the Tomorrow flow (agenda -> Course+ things -> suggested slotting).
// Pure and React-free like `surfaceActions` / `proposeSchedule`, so it unit-tests
// the same way. Takes `usePillars()` output plus the ISO date the plan is FOR,
// and answers: what does Course+ think matters on that day?
//
// Also exports `pillarTimeBank`, the per-pillar 3P/2D/5A + minutes rollup the
// scheduling dock needs. Today's dock gets those numbers live from Triage; the
// Tomorrow overlay has no Triage pass behind it, so it derives them here.

import { daysFromToday } from './surfaceActions'
import { isDeep, parseEst } from './proposeSchedule'

// Minutes assumed for a task with no estimate. Matches proposeSchedule's
// DEFAULT_DEEP so the dock's time bank and the generator agree on what an
// unestimated task "costs".
const DEFAULT_MINS = 45

const SOON_DAYS = 3 // surfaceActions' urgency window

// Buckets, in the order a task falls into them (first match wins — every task
// appears exactly once across the whole briefing).
export const BRIEFING_GROUPS = [
  // `now` leads: in Course+'s pull method this is the small set Nate has
  // deliberately pulled into focus (soft cap 3), so it outranks even an overdue
  // Icebox item. Everything below it is context.
  { key: 'now', label: 'in focus now', hint: 'pulled in course+' },
  { key: 'overdue', label: 'overdue', hint: 'past due' },
  { key: 'due', label: 'due that day', hint: 'lands tomorrow' },
  { key: 'soon', label: 'due soon', hint: 'within 3 days' },
  { key: 'in_progress', label: 'in progress', hint: 'already started' },
  { key: 'next', label: 'next actions', hint: 'flagged in course+' },
]

// pillars -> flat rows carrying the display context the briefing needs
// (normalized pillar id + human names). Distinct from proposeSchedule's
// `flattenPillars`, which flattens for scoring and drops the labels.
export function flattenForBriefing(pillars) {
  const rows = []
  for (const p of pillars ?? []) {
    for (const t of p.openTasks ?? []) {
      rows.push({ ...t, pillar: p.id, pillarName: p.name, projectName: null })
    }
    for (const proj of p.projects ?? []) {
      for (const t of proj.tasks ?? []) {
        rows.push({ ...t, pillar: p.id, pillarName: p.name, projectName: proj.name })
      }
    }
  }
  return rows
}

// Which bucket a task belongs in, or null if it isn't briefing-worthy.
// `d` is the day delta relative to the planned day (0 = due that day).
function groupFor(task, d) {
  if (task.status === 'waiting' || task.status === 'blocked') return null
  // The Now lane wins over its own due date: a pulled task belongs at the top
  // of the briefing whether or not it happens to be dated.
  if (task.status === 'now') return 'now'
  if (d != null) {
    if (d < 0) return 'overdue'
    if (d === 0) return 'due'
    if (d <= SOON_DAYS) return 'soon'
  }
  if (task.status === 'in_progress') return 'in_progress'
  if (task.status === 'next') return 'next'
  // Undated Icebox — real work, but not what tomorrow is about. Course+'s whole
  // point is that you pull FROM here deliberately, so Today must not dump the
  // pile into a briefing.
  return null
}

// Sort inside a group: soonest due first, then started-before-not-started,
// then alphabetical so the order is stable across renders.
function compareRows(a, b) {
  const ad = a.days ?? Infinity
  const bd = b.days ?? Infinity
  if (ad !== bd) return ad - bd
  const rank = (t) =>
    t.status === 'now' ? 0 : t.status === 'in_progress' ? 1 : t.status === 'next' ? 2 : 3
  const ar = rank(a)
  const br = rank(b)
  if (ar !== br) return ar - br
  // Then Course+'s manual drag order, which is how Nate actually expresses
  // priority inside a project.
  const as = typeof a.sort === 'number' ? a.sort : Infinity
  const bs = typeof b.sort === 'number' ? b.sort : Infinity
  if (as !== bs) return as - bs
  return (a.label || '').localeCompare(b.label || '')
}

// Build the stage-2 briefing for `dateISO`.
// Returns { groups: [{ key, label, hint, items[] }], total, byPillar }
// — only non-empty groups are returned, so the UI can map straight over it.
export function buildBriefing(pillars, dateISO) {
  // Urgency is relative to the day being PLANNED, not to now: a task due on
  // `dateISO` must read as d=0 ("due that day"), not d=1.
  const ref = dateISO ? new Date(`${dateISO}T12:00:00`) : new Date()
  const rows = flattenForBriefing(pillars)

  const buckets = {}
  const byPillar = {}
  let total = 0
  for (const t of rows) {
    const days = daysFromToday(t.doDate, ref)
    const key = groupFor(t, days)
    if (!key) continue
    const row = { ...t, days }
    ;(buckets[key] ??= []).push(row)
    byPillar[t.pillar] = (byPillar[t.pillar] || 0) + 1
    total++
  }

  const groups = BRIEFING_GROUPS.filter((g) => buckets[g.key]?.length).map((g) => ({
    ...g,
    items: buckets[g.key].sort(compareRows),
  }))
  return { groups, total, byPillar }
}

// Per-pillar rollup for the scheduling dock: project count, deep/admin task
// counts, and total estimated minutes. Mirrors the shape Triage feeds
// `Scheduling`'s `remainingMinsByPillar` prop so the same dock renders for
// tomorrow without a Triage pass.
export function pillarTimeBank(pillars) {
  const bank = {}
  for (const p of pillars ?? []) {
    const tasks = [
      ...(p.openTasks ?? []),
      ...(p.projects ?? []).flatMap((proj) => proj.tasks ?? []),
    ].filter((t) => t.status !== 'waiting' && t.status !== 'blocked')

    let deep = 0
    let admin = 0
    let mins = 0
    for (const t of tasks) {
      if (isDeep(t)) deep++
      else admin++
      mins += parseEst(t.est) ?? DEFAULT_MINS
    }
    bank[p.id] = { projects: (p.projects ?? []).length, deep, admin, mins }
  }
  return bank
}
