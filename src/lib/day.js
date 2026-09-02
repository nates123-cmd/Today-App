// Calendar-day helpers. One source of truth for "what day is it".
//
// LANDMINE this exists to kill: `new Date().toISOString().slice(0,10)` returns
// the **UTC** date. Nate is in America/New_York (UTC-4 in summer), so from
// 8:00pm ET onward that string is already TOMORROW. Every surface derived its
// date that way, so the whole app silently shifted forward a day each
// evening — "today" showed tomorrow's blocks and the Tomorrow overlay showed
// the day after. That is exactly the window the night-before planning ritual
// runs in, so the bug only ever appeared when the app was being used for its
// main purpose.
//
// Use `todayISO()` / `isoDate()` everywhere. Never call toISOString() to get a
// calendar day.

// Local calendar date as yyyy-mm-dd. Uses the date parts in the machine's own
// timezone, so it flips at local midnight, not at 8pm.
export function isoDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO() {
  return isoDate()
}

// `offset` days from today, local. addDays(1) = tomorrow.
export function addDays(offset, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() + offset)
  return d
}

export function tomorrowISO(from = new Date()) {
  return isoDate(addDays(1, from))
}

export function yesterdayISO(from = new Date()) {
  return isoDate(addDays(-1, from))
}

// ─────────── the evening handover ───────────

// After this local hour, the day being PLANNED is tomorrow: today's plan is
// done with and the app should lead with the next day. Nate's number ("say
// 7pm"). Kept here so the whole app agrees on when the handover happens.
export const PLANNING_HANDOVER_HOUR = 19

// Is it late enough that tomorrow is the day worth looking at?
export function isPlanningTomorrow(now = new Date()) {
  return now.getHours() >= PLANNING_HANDOVER_HOUR
}

// The day the app should treat as its subject right now: today until the
// handover hour, tomorrow after it.
export function focusDateISO(now = new Date()) {
  return isPlanningTomorrow(now) ? tomorrowISO(now) : isoDate(now)
}
