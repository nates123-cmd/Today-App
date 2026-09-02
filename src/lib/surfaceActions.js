// Next-action surfacing — see the Next-Action Surfacing spec.
// A project's row shows only its next action(s); the rest stay behind a
// disclosure. Today's tasks (from usePillars) expose `status` ('next' |
// 'in_progress' | 'waiting' | 'blocked') and `doDate` (do_date ISO or null),
// and are already filtered to incomplete (done/dropped/archived excluded).

// Calendar-day delta (local time) from `today` to an ISO yyyy-mm-dd date.
// Negative = overdue (still urgent). Blank/non-ISO → null (sorts as "no due").
export function daysFromToday(iso, today = new Date()) {
  if (!iso) return null
  const due = new Date(iso + 'T00:00:00')
  if (Number.isNaN(due.getTime())) return null
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d0 = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  return Math.round((d0 - t0) / 86400000)
}

// Resolve which task(s) to surface for a project.
// `incomplete`: the project's incomplete tasks, in project order.
// Returns { state, primary?, secondary?, count } where state is one of
// 'empty' | 'normal' | 'urgent_single' | 'urgent_double'.
export function surfaceActions(incomplete, today = new Date()) {
  if (!incomplete || incomplete.length === 0) return { state: 'empty', count: 0 }
  // Course+ is a pull method: a task in the Now lane is the one Nate has
  // deliberately pulled into focus, so it is what a collapsed project should
  // show. Before this, nothing was mapped to 'now', no task was 'next' either,
  // and the fallback surfaced `incomplete[0]` — i.e. whatever happened to sort
  // first in the Icebox pile. That is why Triage never reflected the priorities
  // set in Course+.
  // Only `now` counts as pulled here. Course+'s legacy `in-progress` value has
  // had no writer since the 2026-06 rebuild, and treating it as pulled would
  // change what surfaces for tasks that merely carry the stale value.
  const pulled = incomplete.find((t) => t.status === 'now')
  const nextCandidate = pulled ?? incomplete.find((t) => t.status === 'next') ?? incomplete[0]
  const soonest = incomplete
    .map((t) => ({ t, d: daysFromToday(t.doDate, today) }))
    .filter((x) => x.d !== null)
    .sort((a, b) => a.d - b.d)[0]
  if (soonest && soonest.d <= 3) {
    const urgent = soonest.t
    if (urgent.id === nextCandidate.id) {
      return { state: 'urgent_single', primary: urgent, count: incomplete.length - 1 }
    }
    return { state: 'urgent_double', primary: urgent, secondary: nextCandidate, count: incomplete.length - 2 }
  }
  return { state: 'normal', primary: nextCandidate, count: incomplete.length - 1 }
}
