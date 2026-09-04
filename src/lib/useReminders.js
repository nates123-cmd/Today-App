// Apple Reminders for a given day, read from `today_reminders`.
//
// Reminders are deliberately their OWN strip, not Course+ tasks. Course+ is the
// source of truth for project work and runs a pull method — folding a Reminders
// list into it would compete with the Now lane. So these render alongside the
// plan as errands/admin, and never enter the deep-work scheduler.
//
// Rows arrive via the `reminders-ingest` edge function (an iOS Shortcut posts
// the list). See `reminders-shortcut.md`.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'
import { todayISO } from './day'
import { daysFromToday } from './surfaceActions'

const TABLE = 'today_reminders'

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    list: row.list_name,
    dueDate: row.due_date,
    // Wall-clock "HH:MM" as written on the phone. NOT derived from a timestamp:
    // a reminder is a wall-clock thing and the ingest has no timezone to anchor
    // an absolute instant to.
    dueTime: row.due_time,
    completed: row.completed,
    notes: row.notes,
    priority: row.priority,
    sourceId: row.source_id,
  }
}

// Oldest first, so the overdue ones lead. Then time of day, then Apple's
// priority (1 high, 5 medium, 9 low, 0/null none), then title for a stable
// order across renders.
function compare(a, b) {
  const d = (r) => r.dueDate ?? '9999-12-31'
  if (d(a) !== d(b)) return d(a).localeCompare(d(b))
  const t = (r) => (r.dueTime && r.dueTime !== '00:00' ? r.dueTime : '99:99')
  if (t(a) !== t(b)) return t(a).localeCompare(t(b))
  const p = (r) => (r.priority && r.priority > 0 ? r.priority : 99)
  if (p(a) !== p(b)) return p(a) - p(b)
  return (a.title || '').localeCompare(b.title || '')
}

// "overdue" / "today" / "tomorrow" relative to the REAL current day, not to the
// day being planned — an overdue item must still read as overdue while you are
// planning tomorrow.
export function dueLabelFor(dueDate, now = new Date()) {
  const d = daysFromToday(dueDate, now)
  if (d == null) return null
  if (d < 0) return d === -1 ? 'overdue by a day' : `overdue by ${-d} days`
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return null
}

// Returns every open reminder due ON OR BEFORE `dateISO`.
//
// Called with tomorrow's date (the day being planned) that is exactly the set
// Nate asked for: **overdue + dated today + dated tomorrow**. Overdue matters —
// Apple's own Today list folds it in, and six of his were sitting invisible
// when the strip showed one exact day.
//
// Undated reminders are excluded. They reach the table (the ingest stores
// them) but a reminder with no date isn't part of a day plan.
export function useReminders(dateISO) {
  const date = dateISO ?? todayISO()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const visibilityKey = useVisibilityKey()

  // No `setLoading(true)` here: the effect calls this synchronously, and a
  // synchronous setState in an effect body triggers a cascading re-render.
  // `loading` starts true and is cleared once; a later refresh (returning to
  // the foreground) reloads quietly in the background instead of flashing a
  // spinner over a list that is already on screen.
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', date)
    if (error) {
      setError(error.message)
      setRows([])
    } else {
      setError(null)
      setRows((data ?? []).map(fromRow))
    }
    setLoading(false)
  }, [date])

  useEffect(() => {
    load()
  }, [load, visibilityKey])

  // Tick one off from Today. Writes straight to the row; the phone stays the
  // source of truth, so the next Shortcut run reconciles.
  const complete = useCallback(async (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id)) // optimistic
    const { error } = await supabase.from(TABLE).update({ completed: true }).eq('id', id)
    if (error) console.error('today_reminders complete', error)
  }, [])

  // Everything here is dated by construction now, so there is one list.
  const sorted = useMemo(() => rows.slice().sort(compare), [rows])

  return { reminders: sorted, complete, refresh: load, loading, error }
}
