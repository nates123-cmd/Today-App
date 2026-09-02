import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'
import { todayISO } from './day'

// Live challenges from Ink, read through the shared `challenges_today` view —
// the same contract Ink, the reMarkable daily page and Break read, so day
// number, streak and done-today are computed once in SQL rather than four times
// in four apps. A challenge is a deliberate push, not a routine; habits stay in
// useHabits. Both surface in the same checklist, distinguished by their tag.
export function useChallenges(date) {
  const targetDate = date ?? todayISO()
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const visibilityKey = useVisibilityKey()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('challenges_today').select('*').order('start_date'),
      // The view answers for today only; a backfill date needs its own log read.
      supabase.from('challenge_logs').select('active_challenge_id').eq('date', targetDate),
    ]).then(([viewRes, logRes]) => {
      if (cancelled) return
      if (viewRes.error) {
        setError(viewRes.error.message)
        setLoading(false)
        return
      }
      const doneOnDate = new Set((logRes.data ?? []).map((r) => r.active_challenge_id))
      setChallenges(
        (viewRes.data ?? []).map((c) => ({
          id: c.id,
          label: c.title,
          why: c.why,
          day: c.day_number,
          days: c.days,
          streak: c.streak,
          tag: 'challenge',
          checked: doneOnDate.has(c.id),
        }))
      )
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [targetDate, visibilityKey])

  // Optimistic, and shaped exactly like useHabits' toggle so the checklist can
  // treat a challenge and a habit the same way. Check-in is a row per day.
  const toggle = useCallback(async (challengeId) => {
    let prevChecked = null
    setChallenges((arr) =>
      arr.map((c) => {
        if (c.id !== challengeId) return c
        prevChecked = c.checked
        return { ...c, checked: !c.checked }
      })
    )
    const revert = (to) =>
      setChallenges((arr) => arr.map((c) => (c.id === challengeId ? { ...c, checked: to } : c)))
    if (prevChecked) {
      const res = await supabase
        .from('challenge_logs')
        .delete()
        .eq('active_challenge_id', challengeId)
        .eq('date', targetDate)
      if (res.error) {
        console.error('challenge_logs delete failed', res.error)
        revert(true)
      }
    } else {
      const res = await supabase
        .from('challenge_logs')
        .insert({ active_challenge_id: challengeId, date: targetDate })
      if (res.error) {
        console.error('challenge_logs insert failed', res.error)
        revert(false)
      }
    }
  }, [targetDate])

  return { challenges, loading, error, toggle }
}
