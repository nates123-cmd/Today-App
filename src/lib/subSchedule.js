// Sub-schedule — the block's checklist laid out on the clock.
//
// There is no second table and no stored start time. A step's time is DERIVED:
// the block's start plus the durations of every step above it. That is why
// reordering is rescheduling, and why dragging or resizing the parent block on
// the grid carries its sub-schedule along for free — nothing here can go stale.
//
// Duration is `estMinutes`, the same field the stopwatch compares against, so a
// step sized in Schedule view already has an estimate in List view.

export const DEFAULT_STEP_MINUTES = 15

// decimal hour -> "9:30a"
export function fmtClock(h) {
  const total = Math.round(h * 60)
  const hr = Math.floor(total / 60) % 24
  const m = total % 60
  const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr
  return `${hr12}:${String(m).padStart(2, '0')}${hr < 12 ? 'a' : 'p'}`
}

// Lay a block's items out in order.
//   rows        — sized steps, each with startHour / endHour and `spills` when
//                 it runs past the end of the block
//   unscheduled — steps with no duration yet; they hold no time
//   freeMinutes / overMinutes — at most one of these is non-zero
export function layoutSchedule(items, block) {
  const blockMinutes = block?.duration ?? 0
  const blockStart = block?.hour ?? 0
  const blockEnd = blockStart + blockMinutes / 60
  const ordered = [...(items ?? [])].sort((a, b) => a.position - b.position)

  const rows = []
  const unscheduled = []
  let cursor = 0 // minutes from block start
  for (const item of ordered) {
    const minutes = item.estMinutes
    if (!(minutes > 0)) {
      unscheduled.push(item)
      continue
    }
    const startMin = cursor
    const endMin = cursor + minutes
    rows.push({
      item,
      minutes,
      startHour: blockStart + startMin / 60,
      endHour: blockStart + endMin / 60,
      // Starts inside the block but ends after it, or starts after it entirely.
      spills: endMin > blockMinutes,
      startsAfterEnd: startMin >= blockMinutes,
    })
    cursor = endMin
  }

  return {
    rows,
    unscheduled,
    blockMinutes,
    blockStart,
    blockEnd,
    plannedMinutes: cursor,
    freeMinutes: Math.max(0, blockMinutes - cursor),
    overMinutes: Math.max(0, cursor - blockMinutes),
  }
}

// Where the clock says you should be. Times stay on the plan — a step you are
// behind on is reported as `late`, it does not push the steps after it.
//   current — the step whose slot contains `nowDecimal` (null in open time)
//   next    — the first step that starts after now
//   late    — unfinished steps whose slot has already ended
export function scheduleNow(layout, nowDecimal) {
  const rows = layout?.rows ?? []
  const current = rows.find((r) => nowDecimal >= r.startHour && nowDecimal < r.endHour) ?? null
  const next = rows.find((r) => r.startHour > nowDecimal) ?? null
  const late = rows.filter((r) => r.endHour <= nowDecimal && !r.item.done)
  const minutesLeft = current ? Math.max(0, Math.round((current.endHour - nowDecimal) * 60)) : null
  return { current, next, late, minutesLeft }
}

// Move one id to a new index, returning the new id order.
export function moveId(ids, id, toIndex) {
  const from = ids.indexOf(id)
  if (from < 0) return ids
  const next = ids.filter((x) => x !== id)
  const clamped = Math.max(0, Math.min(next.length, toIndex))
  next.splice(clamped, 0, id)
  return next
}

// What the active card says you should be doing inside the block.
//   schedule view — the step the CLOCK is in, minutes left in it, and the next
//   list view     — the first thing not ticked off
// Returns null when the block has no items, so the card stays as it was.
export function activeStep(block, items, view, nowDecimal) {
  if (!items?.length) return null
  if (view === 'schedule') {
    const { current, next, late } = scheduleNow(layoutSchedule(items, block), nowDecimal)
    const behind = late.length
    if (current && !current.item.done) {
      return {
        label: current.item.label,
        meta: `${Math.max(1, Math.round((current.endHour - nowDecimal) * 60))} min left in this step`,
        next: next?.item.label ?? null,
        behind,
      }
    }
    if (next) return { label: null, meta: null, next: next.item.label, behind }
    if (behind) return { label: late[0].item.label, meta: 'behind plan', next: null, behind: behind - 1 }
    return null
  }
  const open = [...items].sort((a, b) => a.position - b.position).filter((i) => !i.done)
  if (!open.length) return null
  return { label: open[0].label, meta: null, next: open[1]?.label ?? null, behind: 0 }
}
