// Hiding calendar events from a planned day.
//
// The catch this solves: ical rows are NOT ours to delete. The iOS Shortcut
// owns them and re-ingests on a "DELETE the day, re-POST every event" cycle
// (~5:30am, and on opening the PWA). So deleting the row from Today does not
// stick — the next sync puts the meeting straight back. A dismissal has to live
// outside the rows to survive that, which is why this is a stored key set
// rather than a DB delete.
//
// Keying: tomorrow's real ical rows carry NO `source_id` (verified against the
// live table — every row has source_id null), so identity is start-hour + title,
// the same pair `dedupeBlocks` uses to collapse duplicate ingests. A meeting
// that MOVES to a new time therefore comes back, which is the behaviour we
// want: a rescheduled meeting is a new fact about the day, not the one you
// dismissed.
//
// Blocks Today itself owns (routines, ad-hoc, proposals) are not re-ingested,
// so those get a real delete instead — see `isReingested`.

// Rows that some other system re-creates on a schedule. Only these need the
// dismissal treatment; everything else can just be deleted.
export function isReingested(block) {
  return block?.source === 'ical'
}

// Stable-enough identity for a calendar event on a given day.
export function eventKey(block) {
  if (!block) return null
  const hour = Number(block.hour)
  if (Number.isNaN(hour)) return null
  return `${hour}|${(block.title || '').trim().toLowerCase()}`
}

// Drop dismissed events from a block list. `dismissed` is a Set of eventKeys.
export function filterDismissed(blocks, dismissed) {
  if (!dismissed || dismissed.size === 0) return blocks ?? []
  return (blocks ?? []).filter((b) => !dismissed.has(eventKey(b)))
}

// How many of `blocks` are currently hidden — drives the "N hidden · restore"
// affordance. Counts distinct keys, so six duplicate ingests of one standup
// read as one hidden meeting, not six.
export function countDismissed(blocks, dismissed) {
  if (!dismissed || dismissed.size === 0) return 0
  const hidden = new Set()
  for (const b of blocks ?? []) {
    const k = eventKey(b)
    if (k && dismissed.has(k)) hidden.add(k)
  }
  return hidden.size
}
