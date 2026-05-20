import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const TABLE = 'placed_blocks'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// DB row → UI block. UI omits the date (today-only for V1) and renames
// duration_minutes → duration.
function fromRow(row) {
  return {
    id: row.id,
    type: row.type,
    hour: Number(row.hour),
    duration: row.duration_minutes,
    title: row.title,
    pillar: row.pillar,
    projectId: row.project_id,
    source: row.source,
    sourceId: row.source_id,
  }
}

function toRow(block, date) {
  return {
    id: block.id,
    date,
    hour: block.hour,
    duration_minutes: block.duration,
    type: block.type,
    title: block.title,
    pillar: block.pillar ?? null,
    project_id: block.projectId ?? null,
    source: block.source ?? 'today_user',
    source_id: block.sourceId ?? null,
  }
}

// Compare a single row's writeable fields to decide whether an UPDATE is needed.
function blockEquals(a, b) {
  return (
    a.hour === b.hour &&
    a.duration === b.duration &&
    a.type === b.type &&
    a.title === b.title &&
    (a.pillar ?? null) === (b.pillar ?? null) &&
    (a.projectId ?? null) === (b.projectId ?? null)
  )
}

export function usePlacedBlocks() {
  const [placed, setPlacedLocal] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const lastRef = useRef([])
  const date = todayISO()

  // Initial load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from(TABLE)
      .select('*')
      .eq('date', date)
      .order('hour', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setLoading(false)
          return
        }
        const blocks = (data ?? []).map(fromRow)
        lastRef.current = blocks
        setPlacedLocal(blocks)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date])

  // setPlaced wrapper: applies the local update, then diffs vs the previous
  // committed state and dispatches inserts / updates / deletes to Supabase.
  // Errors are logged but UI state is not reverted (optimistic) — refresh
  // by reload to recover.
  const setPlaced = useCallback(
    (updater) => {
      setPlacedLocal((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        const prevById = new Map(lastRef.current.map((b) => [b.id, b]))
        const nextById = new Map(next.map((b) => [b.id, b]))

        const inserts = []
        const updates = []
        const deletes = []
        for (const [id, b] of nextById) {
          const old = prevById.get(id)
          if (!old) inserts.push(b)
          else if (!blockEquals(old, b)) updates.push(b)
        }
        for (const [id] of prevById) {
          if (!nextById.has(id)) deletes.push(id)
        }
        lastRef.current = next

        // Fire-and-forget DB writes
        if (inserts.length) {
          supabase
            .from(TABLE)
            .insert(inserts.map((b) => toRow(b, date)))
            .then(({ error }) => error && console.error('placed_blocks insert', error))
        }
        for (const b of updates) {
          supabase
            .from(TABLE)
            .update(toRow(b, date))
            .eq('id', b.id)
            .then(({ error }) => error && console.error('placed_blocks update', error))
        }
        if (deletes.length) {
          supabase
            .from(TABLE)
            .delete()
            .in('id', deletes)
            .then(({ error }) => error && console.error('placed_blocks delete', error))
        }
        return next
      })
    },
    [date]
  )

  return { placed, setPlaced, loading, error }
}
