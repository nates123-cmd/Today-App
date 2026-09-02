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

// Apple priority: 1 high, 5 medium, 9 low, 0/null none. Sort high→low, then by
// time of day, then title, so the order is stable across renders.
function compare(a, b) {
  const p = (r) => (r.priority && r.priority > 0 ? r.priority : 99)
  if (p(a) !== p(b)) return p(a) - p(b)
  const t = (r) => r.dueTime ?? '99:99'
  if (t(a) !== t(b)) return t(a).localeCompare(t(b))
  return (a.title || '').localeCompare(b.title || '')
}

// `dateISO` selects the day. Reminders with no due date are included too —
// an undated reminder is still something to get done, it just isn't pinned to
// a day — unless `datedOnly` is set.
export function useReminders(dateISO, { datedOnly = false } = {}) {
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
    let q = supabase.from(TABLE).select('*').eq('completed', false)
    q = datedOnly ? q.eq('due_date', date) : q.or(`due_date.eq.${date},due_date.is.null`)
    const { data, error } = await q
    if (error) {
      setError(error.message)
      setRows([])
    } else {
      setError(null)
      setRows((data ?? []).map(fromRow))
    }
    setLoading(false)
  }, [date, datedOnly])

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

  const { dated, undated } = useMemo(() => {
    const sorted = rows.slice().sort(compare)
    return {
      dated: sorted.filter((r) => r.dueDate),
      undated: sorted.filter((r) => !r.dueDate),
    }
  }, [rows])

  return { reminders: rows, dated, undated, complete, refresh: load, loading, error }
}
