// Work assigned into a time block — the checklist you actually work off.
//
// A placed_block used to carry only a pillar, so the drill-in guessed at the
// work by listing every project in that pillar. This hook is the explicit edge:
// what Nate put in the 9am block, in order, with done state.
//
// ONE-WAY from Course+. `label` is a snapshot; renaming a task over there does
// not rewrite today's list. The single write that travels back is completion.
//
// The timing layer (estimate / stopwatch / recurring) is opt-in per item and
// nothing in the checklist path reads it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'
import { todayISO } from './day'

const TABLE = 'block_items'
const RECUR = 'recurring_items'

function fromRow(r) {
  return {
    id: r.id,
    blockId: r.block_id,
    date: r.date,
    position: r.position,
    source: r.source,
    cpTaskId: r.cp_task_id,
    label: r.label,
    done: r.done,
    doneAt: r.done_at,
    recurringKey: r.recurring_key,
    estMinutes: r.est_minutes,
    startedAt: r.started_at,
    elapsedSeconds: r.elapsed_seconds ?? 0,
  }
}

// Stable slug for a recurring item. Punctuation and case are dropped so
// "Maggetti posts" and "Maggetti Posts." share one history.
export function recurringKey(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// Seconds on the clock right now: banked time plus the leg currently running.
export function liveElapsed(item, now = Date.now()) {
  const banked = item?.elapsedSeconds ?? 0
  if (!item?.startedAt) return banked
  const started = new Date(item.startedAt).getTime()
  if (Number.isNaN(started)) return banked
  return banked + Math.max(0, Math.floor((now - started) / 1000))
}

export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${String(m % 60).padStart(2, '0')}m`
  }
  return `${m}:${String(rem).padStart(2, '0')}`
}

export function useBlockItems(dateArg) {
  const date = dateArg ?? todayISO()
  const [items, setItems] = useState([])
  const [recurring, setRecurring] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const visibilityKey = useVisibilityKey()
  // Bumped by every mutation so the day's rows re-read. The lists here are
  // small (a day's checklist), so a refetch is cheaper to reason about than a
  // hand-maintained optimistic cache — and it keeps two open surfaces
  // (Scheduling's sheet and Live's) from drifting apart.
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from(TABLE).select('*').eq('date', date).order('position', { ascending: true }),
      supabase.from(RECUR).select('*'),
    ]).then(([itemsRes, recurRes]) => {
      if (cancelled) return
      if (itemsRes.error) {
        setError(itemsRes.error.message)
        setLoading(false)
        return
      }
      setItems((itemsRes.data ?? []).map(fromRow))
      if (!recurRes.error) setRecurring(recurRes.data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [date, visibilityKey, tick])

  const byBlock = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      const arr = m.get(it.blockId) ?? []
      arr.push(it)
      m.set(it.blockId, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position)
    return m
  }, [items])

  // cp_task_ids already assigned somewhere today, so the Course+ picker can
  // show what has been taken without a second query.
  const assignedTaskIds = useMemo(
    () => new Set(items.filter((i) => i.cpTaskId).map((i) => i.cpTaskId)),
    [items]
  )

  const recurringByKey = useMemo(
    () => new Map(recurring.map((r) => [r.key, r])),
    [recurring]
  )

  const addItem = useCallback(
    async (blockId, { label, source = 'manual', cpTaskId = null }) => {
      const text = (label || '').trim()
      if (!text || !blockId) return null
      const existing = (byBlock.get(blockId) ?? [])
      const position = existing.length ? Math.max(...existing.map((i) => i.position)) + 1 : 0
      // If this label is already a known recurring item, inherit its key and
      // estimate so the history keeps accruing without re-answering the prompt.
      const key = recurringKey(text)
      const known = recurringByKey.get(key)
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          block_id: blockId,
          date,
          position,
          source,
          cp_task_id: cpTaskId,
          label: text,
          recurring_key: known ? key : null,
          est_minutes: known?.est_minutes ?? null,
        })
        .select()
        .single()
      if (error) {
        console.error('block_items insert', error)
        setError(error.message)
        return null
      }
      bump()
      return fromRow(data)
    },
    [byBlock, date, recurringByKey, bump]
  )

  const removeItem = useCallback(
    async (id) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
      const { error } = await supabase.from(TABLE).delete().eq('id', id)
      if (error) console.error('block_items delete', error)
      bump()
    },
    [bump]
  )

  // Roll a finished run into the recurring history. Called on completion, and
  // only when the item is marked recurring AND actually has time on the clock —
  // checking off an untimed recurring item should not drag the average to zero.
  const recordRun = useCallback(
    async (item) => {
      if (!item.recurringKey) return
      const seconds = liveElapsed(item)
      if (seconds <= 0) return
      const existing = recurringByKey.get(item.recurringKey)
      if (existing) {
        const { error } = await supabase
          .from(RECUR)
          .update({
            runs: (existing.runs ?? 0) + 1,
            total_seconds: (existing.total_seconds ?? 0) + seconds,
            last_seconds: seconds,
            last_run_on: date,
          })
          .eq('id', existing.id)
        if (error) console.error('recurring_items run', error)
      } else {
        const { error } = await supabase.from(RECUR).insert({
          key: item.recurringKey,
          label: item.label,
          est_minutes: item.estMinutes ?? null,
          runs: 1,
          total_seconds: seconds,
          last_seconds: seconds,
          last_run_on: date,
        })
        if (error) console.error('recurring_items seed', error)
      }
    },
    [recurringByKey, date]
  )

  const toggleDone = useCallback(
    async (item) => {
      const next = !item.done
      // Completing stops the clock first, so the banked seconds that get
      // recorded include the leg that was still running.
      const banked = next ? liveElapsed(item) : item.elapsedSeconds
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, done: next, startedAt: next ? null : i.startedAt, elapsedSeconds: banked }
            : i
        )
      )
      const { error } = await supabase
        .from(TABLE)
        .update({
          done: next,
          done_at: next ? new Date().toISOString() : null,
          started_at: next ? null : item.startedAt,
          elapsed_seconds: banked,
        })
        .eq('id', item.id)
      if (error) console.error('block_items toggle', error)

      if (next) await recordRun({ ...item, elapsedSeconds: banked, startedAt: null })

      // The one write that travels back to Course+: a task done here is done
      // there. Mirrors what usePillars' statusToCpPatch writes for 'done'.
      if (item.cpTaskId) {
        const patch = next
          ? { done: true, task_status: 'done', next: false }
          : { done: false, task_status: 'backlog', next: false }
        const res = await supabase.from('cp_tasks').update(patch).eq('id', item.cpTaskId)
        if (res.error) console.error('cp_tasks writeback', res.error)
      }
      bump()
    },
    [recordRun, bump]
  )

  const startTimer = useCallback(
    async (item) => {
      const startedAt = new Date().toISOString()
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, startedAt } : i)))
      const { error } = await supabase.from(TABLE).update({ started_at: startedAt }).eq('id', item.id)
      if (error) console.error('block_items start', error)
    },
    []
  )

  const pauseTimer = useCallback(async (item) => {
    const banked = liveElapsed(item)
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, startedAt: null, elapsedSeconds: banked } : i))
    )
    const { error } = await supabase
      .from(TABLE)
      .update({ started_at: null, elapsed_seconds: banked })
      .eq('id', item.id)
    if (error) console.error('block_items pause', error)
  }, [])

  const resetTimer = useCallback(async (item) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, startedAt: null, elapsedSeconds: 0 } : i))
    )
    const { error } = await supabase
      .from(TABLE)
      .update({ started_at: null, elapsed_seconds: 0 })
      .eq('id', item.id)
    if (error) console.error('block_items reset', error)
  }, [])

  const setEstimate = useCallback(
    async (item, minutes) => {
      const mins = Number.isFinite(minutes) ? minutes : null
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, estMinutes: mins } : i)))
      const { error } = await supabase.from(TABLE).update({ est_minutes: mins }).eq('id', item.id)
      if (error) console.error('block_items est', error)
      // Keep the recurring definition's estimate in step — it is the number
      // future runs get compared against.
      const existing = item.recurringKey ? recurringByKey.get(item.recurringKey) : null
      if (existing) await supabase.from(RECUR).update({ est_minutes: mins }).eq('id', existing.id)
      bump()
    },
    [recurringByKey, bump]
  )

  // "Do this often? mark recurring." Creates (or reuses) the definition and
  // stamps its key on the item. `schedule`/`defaultHour` are optional — an item
  // can be recurring purely to accumulate a time history without ever
  // auto-placing itself.
  const markRecurring = useCallback(
    async (item, { estMinutes = null, schedule = null, defaultHour = null, pillar = null } = {}) => {
      const key = recurringKey(item.label)
      if (!key) return
      const existing = recurringByKey.get(key)
      if (existing) {
        const patch = {}
        if (estMinutes != null) patch.est_minutes = estMinutes
        if (schedule !== undefined) patch.schedule = schedule
        if (defaultHour != null) patch.default_hour = defaultHour
        if (Object.keys(patch).length) await supabase.from(RECUR).update(patch).eq('id', existing.id)
      } else {
        const { error } = await supabase.from(RECUR).insert({
          key,
          label: item.label,
          pillar,
          est_minutes: estMinutes,
          schedule,
          default_hour: defaultHour,
        })
        if (error) console.error('recurring_items insert', error)
      }
      const { error } = await supabase
        .from(TABLE)
        .update({ recurring_key: key, est_minutes: estMinutes ?? item.estMinutes ?? null })
        .eq('id', item.id)
      if (error) console.error('block_items mark recurring', error)
      bump()
    },
    [recurringByKey, bump]
  )

  const unmarkRecurring = useCallback(
    async (item) => {
      const { error } = await supabase.from(TABLE).update({ recurring_key: null }).eq('id', item.id)
      if (error) console.error('block_items unmark recurring', error)
      bump()
    },
    [bump]
  )

  return {
    items,
    byBlock,
    assignedTaskIds,
    recurring,
    recurringByKey,
    loading,
    error,
    addItem,
    removeItem,
    toggleDone,
    startTimer,
    pauseTimer,
    resetTimer,
    setEstimate,
    markRecurring,
    unmarkRecurring,
    refresh: bump,
  }
}
