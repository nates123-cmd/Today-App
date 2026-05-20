import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Daily highlights live in the shared `entries` table (Ink's catch-all),
// keyed by primary_type='day' + source_surface='today_screen'. composed_at
// uses noon-UTC-of-the-date to match the existing Ink convention so they
// sort cleanly with the rest of Ink's day entries.

function noonUtcISO(dateISO) {
  return `${dateISO}T12:00:00.000Z`
}

function startOfDayISO(dateISO) {
  return `${dateISO}T00:00:00.000Z`
}
function startOfNextDayISO(dateISO) {
  const d = new Date(dateISO)
  d.setUTCDate(d.getUTCDate() + 1)
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`
}

export function useDailyHighlight(dateISO) {
  const [highlight, setHighlight] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!dateISO) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('entries')
      .select('id, raw_text, composed_at')
      .eq('primary_type', 'day')
      .gte('composed_at', startOfDayISO(dateISO))
      .lt('composed_at', startOfNextDayISO(dateISO))
      .order('composed_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setLoading(false)
          return
        }
        setHighlight(data?.[0] ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateISO])

  const save = useCallback(
    async (text) => {
      const trimmed = (text || '').trim()
      if (!trimmed || !dateISO) return
      const row = {
        primary_type: 'day',
        source_surface: 'today_screen',
        composed_at: noonUtcISO(dateISO),
        raw_text: trimmed,
      }
      const { data, error } = await supabase
        .from('entries')
        .insert(row)
        .select('id, raw_text, composed_at')
        .single()
      if (error) {
        console.error('useDailyHighlight save failed', error)
        return
      }
      setHighlight(data)
    },
    [dateISO]
  )

  return { highlight, loading, error, save }
}
