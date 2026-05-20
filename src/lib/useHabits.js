import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Read + write habit completion for a given date. Defaults to today; pass an
// ISO date (e.g. yesterday) for backfill flows.
export function useHabits(date) {
  const targetDate = date ?? todayISO()
  const [habits, setHabits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('habits').select('id, name').eq('active', true).order('name'),
      supabase.from('habit_logs').select('habit_id').eq('date', targetDate),
    ]).then(([habitsRes, logsRes]) => {
      if (cancelled) return
      if (habitsRes.error || logsRes.error) {
        setError((habitsRes.error || logsRes.error).message)
        setLoading(false)
        return
      }
      const checked = new Set((logsRes.data ?? []).map((r) => r.habit_id))
      setHabits(
        (habitsRes.data ?? []).map((h) => ({
          id: h.id,
          label: h.name,
          tag: 'habit',
          checked: checked.has(h.id),
        }))
      )
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [targetDate])

  // Optimistic toggle. Insert habit_log row when checking, delete when
  // unchecking. Reverts local state on failure.
  const toggle = useCallback(async (habitId) => {
    let prevChecked = null
    setHabits((arr) => {
      const next = arr.map((h) => {
        if (h.id !== habitId) return h
        prevChecked = h.checked
        return { ...h, checked: !h.checked }
      })
      return next
    })
    if (prevChecked) {
      const res = await supabase
        .from('habit_logs')
        .delete()
        .eq('habit_id', habitId)
        .eq('date', targetDate)
      if (res.error) {
        console.error('habit_logs delete failed', res.error)
        setHabits((arr) =>
          arr.map((h) => (h.id === habitId ? { ...h, checked: true } : h))
        )
      }
    } else {
      const res = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, date: targetDate })
      if (res.error) {
        console.error('habit_logs insert failed', res.error)
        setHabits((arr) =>
          arr.map((h) => (h.id === habitId ? { ...h, checked: false } : h))
        )
      }
    }
  }, [targetDate])

  return { habits, loading, error, toggle }
}
