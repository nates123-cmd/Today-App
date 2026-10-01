// The Reminders inbox: undated Apple Reminders with no app prefix, waiting for
// a tap. Reminders is Nate's fastest phone capture, so the default list is part
// errands and part untriaged captures; this is where the captures get filed.
//
// - Suggestions come pre-computed: the Mac sync agent asks the Course+
//   `reminder-triage` function to classify new inbox items each run and the
//   result lands in today_reminders.suggestion. Nothing is filed on a guess.
// - Move / Change call `reminder-triage` (op 'apply'), which writes the record
//   through the capture router's writers and queues the Apple completion with
//   a "Moved: ..." note.
// - Today queues a `set_due` so the reminder is due today in Apple as well.
// - Keep marks it kept (stays a plain reminder, leaves the inbox).
// - Done completes it, same path as ticking it in the errands strip.
//
// Prefixed reminders ("stock: ...") never show here: the agent routes them
// automatically within minutes.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'
import { todayISO } from './day'

const TABLE = 'today_reminders'
const ACTIONS = 'today_reminder_actions'
// Mirrors PREFIX in tools/push-reminders.sh.
const PREFIX = /^\s*(stock|cue(\s+(book|movie|film|show|tv|podcast|album|article))?|course|c|ink|break)\s*(:|\bcolon\b)/i
// Below this the router itself would not trust a route (classify.ts).
const CONFIDENCE_FLOOR = 0.6

function fromRow(row) {
  const items = Array.isArray(row.suggestion?.items) ? row.suggestion.items : []
  const usable = items.filter((i) => i && i.kind && i.kind !== 'unknown' && (i.confidence ?? 0) >= CONFIDENCE_FLOOR)
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    notes: row.notes,
    capturedAt: row.captured_at,
    suggested: !!row.suggested_at,
    // Only a suggestion where EVERY item is confident is offered as one-tap.
    suggestion: items.length && usable.length === items.length ? items : null,
  }
}

export function useReminderInbox() {
  const [rows, setRows] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const visibilityKey = useVisibilityKey()

  const load = useCallback(async () => {
    const [rem, proj] = await Promise.all([
      supabase
        .from(TABLE)
        .select('id, source_id, title, notes, captured_at, suggestion, suggested_at')
        .eq('completed', false)
        .is('due_date', null)
        .is('triage_state', null)
        .not('source_id', 'is', null)
        .order('captured_at', { ascending: false, nullsFirst: false }),
      supabase.from('cp_projects').select('name, status').in('status', ['active', 'on-hold', 'idea']),
    ])
    if (rem.error) {
      setError(rem.error.message)
      setRows([])
    } else {
      setError(null)
      setRows((rem.data ?? []).filter((r) => !PREFIX.test(r.title)).map(fromRow))
    }
    if (!proj.error) {
      const names = [...new Set((proj.data ?? []).map((p) => p.name))].sort((a, b) => a.localeCompare(b))
      setProjects(names)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load, visibilityKey])

  const drop = (id) => setRows((prev) => prev.filter((r) => r.id !== id))

  // File it. `items` is the suggestion as-is (Move) or one edited item (Change).
  // Returns the router's receipt line, or throws with its error.
  const move = useCallback(async (row, items) => {
    drop(row.id)
    const { data, error } = await supabase.functions.invoke('reminder-triage', {
      body: { op: 'apply', source_id: row.sourceId, items },
    })
    if (error || data?.error) {
      await load() // put it back
      let msg = data?.error || error?.message || 'could not file it'
      try {
        const body = await error?.context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* not json */ }
      throw new Error(msg)
    }
    return data?.line || 'filed'
  }, [load])

  const keep = useCallback(async (row) => {
    drop(row.id)
    const { error } = await supabase.from(TABLE).update({ triage_state: 'kept' }).eq('id', row.id)
    if (error) {
      console.error('reminder keep', error)
      load()
    }
  }, [load])

  // Due today, here and in Apple (so it shows on the phone's Today list).
  const today = useCallback(async (row) => {
    drop(row.id)
    const due = todayISO()
    const { error } = await supabase.from(TABLE).update({ due_date: due }).eq('id', row.id)
    if (error) console.error('reminder today', error)
    const { error: qErr } = await supabase
      .from(ACTIONS)
      .insert({ action: 'set_due', source_id: row.sourceId, payload: { due } })
    if (qErr) console.error('today_reminder_actions set_due', qErr)
  }, [])

  const done = useCallback(async (row) => {
    drop(row.id)
    const { error } = await supabase.from(TABLE).update({ completed: true }).eq('id', row.id)
    if (error) console.error('reminder done', error)
    const { error: qErr } = await supabase.from(ACTIONS).insert({ action: 'complete', source_id: row.sourceId })
    if (qErr) console.error('today_reminder_actions complete', qErr)
  }, [])

  return { inbox: rows, projects, loading, error, move, keep, today, done, refresh: load }
}
