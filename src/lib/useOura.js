import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'

function formatSleep(mins, fallbackScore) {
  if (typeof mins === 'number' && mins > 0) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }
  if (fallbackScore != null) return `${fallbackScore} score`
  return '—'
}

function formatTempDelta(rawReadiness) {
  const dev = rawReadiness?.temperature_deviation
  if (typeof dev !== 'number') return null
  const sign = dev > 0 ? '+' : ''
  return `${sign}${dev.toFixed(2)}°`
}

function signed(n) {
  if (typeof n !== 'number') return null
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `${n}`
}

function syncTimeLabel(fetchedAt) {
  if (!fetchedAt) return 'never synced'
  const d = new Date(fetchedAt)
  const h = (d.getHours() % 12) || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  const ap = d.getHours() < 12 ? 'a' : 'p'
  return `synced ${h}:${m}${ap}`
}

export function useOura() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const visibilityKey = useVisibilityKey()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('tide_oura_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(2)
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setLoading(false)
          return
        }
        if (!rows?.length) {
          setData(null)
          setLoading(false)
          return
        }
        const today = rows[0]
        const yesterday = rows[1] ?? null
        const dReadiness = yesterday ? today.readiness_score - yesterday.readiness_score : null
        const dHrv = yesterday ? today.hrv_avg - yesterday.hrv_avg : null
        const dRhr = yesterday ? today.resting_hr - yesterday.resting_hr : null
        const dSleep = yesterday && today.total_sleep_min && yesterday.total_sleep_min
          ? today.total_sleep_min - yesterday.total_sleep_min
          : null

        setData({
          readiness: today.readiness_score,
          delta: signed(dReadiness),
          syncedAtLabel: syncTimeLabel(today.fetched_at),
          rows: [
            {
              label: 'sleep',
              value: formatSleep(today.total_sleep_min, today.sleep_score),
              delta: dSleep != null ? `${dSleep > 0 ? '+' : ''}${dSleep}m` : null,
              dir: dSleep != null && dSleep < 0 ? 'down' : 'up',
            },
            {
              label: 'hrv',
              value: today.hrv_avg != null ? `${today.hrv_avg} ms` : '—',
              delta: signed(dHrv),
              dir: dHrv != null && dHrv < 0 ? 'down' : 'up',
            },
            {
              label: 'rhr',
              value: today.resting_hr != null ? `${today.resting_hr} bpm` : '—',
              delta: signed(dRhr),
              // RHR going down is good; flip dir so the delta colors right.
              dir: dRhr != null && dRhr > 0 ? 'down' : 'up',
            },
            {
              label: 'temp',
              value: formatTempDelta(today.raw?.readiness) ?? '—',
              delta: 'norm',
            },
          ],
        })
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visibilityKey])

  return { data, loading, error }
}
