import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function useHabits() {
  const [habits, setHabits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const date = todayISO()
    Promise.all([
      supabase.from('habits').select('id, name').eq('active', true).order('name'),
      supabase.from('habit_logs').select('habit_id').eq('date', date),
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
  }, [])

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
    const date = todayISO()
    if (prevChecked) {
      const res = await supabase
        .from('habit_logs')
        .delete()
        .eq('habit_id', habitId)
        .eq('date', date)
      if (res.error) {
        console.error('habit_logs delete failed', res.error)
        setHabits((arr) =>
          arr.map((h) => (h.id === habitId ? { ...h, checked: true } : h))
        )
      }
    } else {
      const res = await supabase.from('habit_logs').insert({ habit_id: habitId, date })
      if (res.error) {
        console.error('habit_logs insert failed', res.error)
        setHabits((arr) =>
          arr.map((h) => (h.id === habitId ? { ...h, checked: false } : h))
        )
      }
    }
  }, [])

  return { habits, loading, error, toggle }
}
