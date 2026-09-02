// Live Oura pull for Today.
//
// Background: nothing keeps tide_oura_daily current — the health-ingest cron
// only writes tide_activities (workouts). So the Morning re-sync button used to
// just re-read a table no one was filling. This pulls straight from Oura (via
// the oura-proxy edge fn, slug `smooth-processor`, which forwards a personal
// access token) and upserts the daily rows itself.
//
// The PAT is stored in localStorage (single-user personal app, same pattern as
// Ink's pasted Anthropic key). It never leaves the device except as the
// `x-oura-pat` header to our own proxy → api.ouraring.com.

import { supabase } from './supabase'
import { isoDate } from './day'

const PAT_KEY = 'today.ouraPat'
const PROXY_SLUG = 'smooth-processor' // edge fn name = oura-proxy

export function getOuraPat() {
  try {
    return (localStorage.getItem(PAT_KEY) || '').trim() || null
  } catch {
    return null
  }
}

export function setOuraPat(pat) {
  try {
    const v = (pat || '').trim()
    if (v) localStorage.setItem(PAT_KEY, v)
    else localStorage.removeItem(PAT_KEY)
  } catch {
    /* storage blocked — ignore */
  }
}

export function hasOuraPat() {
  return !!getOuraPat()
}

function ymd(d) {
  return isoDate(d)
}

// Fetch one Oura collection through our proxy. Returns the `data` array.
async function fetchCollection(pat, path, startDate, endDate) {
  const base = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  const u = new URL(`${base}/functions/v1/${PROXY_SLUG}`)
  u.searchParams.set('path', path)
  u.searchParams.set('start_date', startDate)
  u.searchParams.set('end_date', endDate)
  const res = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      'x-oura-pat': pat,
      // verify_jwt is off on the proxy, but the functions gateway still wants
      // an apikey to route; send the anon key.
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Oura ${path} ${res.status}: ${body.slice(0, 180)}`)
  }
  const json = await res.json()
  return Array.isArray(json?.data) ? json.data : []
}

const min = (sec) => (typeof sec === 'number' ? Math.round(sec / 60) : null)

// Merge the four Oura collections into tide_oura_daily rows keyed by day.
function buildRows(dailySleep, dailyReadiness, dailyActivity, sleepSessions) {
  // Pick the main sleep session per day (longest total_sleep_duration) — Oura
  // returns naps + the long sleep; we want the night.
  const mainByDay = new Map()
  for (const s of sleepSessions) {
    const day = s.day
    if (!day) continue
    const prev = mainByDay.get(day)
    if (!prev || (s.total_sleep_duration || 0) > (prev.total_sleep_duration || 0)) {
      mainByDay.set(day, s)
    }
  }
  const sleepScoreByDay = new Map(dailySleep.map((d) => [d.day, d]))
  const readinessByDay = new Map(dailyReadiness.map((d) => [d.day, d]))
  const activityByDay = new Map(dailyActivity.map((d) => [d.day, d]))

  const days = new Set([
    ...mainByDay.keys(),
    ...sleepScoreByDay.keys(),
    ...readinessByDay.keys(),
    ...activityByDay.keys(),
  ])

  const rows = []
  for (const day of days) {
    const sleep = mainByDay.get(day) || null
    const ds = sleepScoreByDay.get(day) || null
    const rd = readinessByDay.get(day) || null
    const da = activityByDay.get(day) || null
    rows.push({
      date: day,
      sleep_score: ds?.score ?? null,
      total_sleep_min: min(sleep?.total_sleep_duration),
      rem_sleep_min: min(sleep?.rem_sleep_duration),
      deep_sleep_min: min(sleep?.deep_sleep_duration),
      sleep_efficiency: sleep?.efficiency ?? null,
      hrv_avg: sleep?.average_hrv != null ? Math.round(sleep.average_hrv) : null,
      // Oura's resting HR ≈ lowest HR during the night.
      resting_hr: sleep?.lowest_heart_rate ?? null,
      readiness_score: rd?.score ?? null,
      activity_score: da?.score ?? null,
      // useOura reads raw.readiness.temperature_deviation for the temp row.
      raw: { readiness: rd, daily_sleep: ds, sleep, activity: da },
      fetched_at: new Date().toISOString(),
    })
  }
  return rows
}

// Pull the last `days` of Oura data and upsert into tide_oura_daily.
// Returns { upserted } or throws with a human-readable message.
export async function syncOura({ days = 5 } = {}) {
  const pat = getOuraPat()
  if (!pat) throw new Error('No Oura key set')

  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  const startDate = ymd(start)
  const endDate = ymd(end)

  const [dailySleep, dailyReadiness, dailyActivity, sleepSessions] = await Promise.all([
    fetchCollection(pat, 'daily_sleep', startDate, endDate),
    fetchCollection(pat, 'daily_readiness', startDate, endDate),
    fetchCollection(pat, 'daily_activity', startDate, endDate),
    fetchCollection(pat, 'sleep', startDate, endDate),
  ])

  const rows = buildRows(dailySleep, dailyReadiness, dailyActivity, sleepSessions)
  if (!rows.length) return { upserted: 0 }

  // user_id defaults to auth.uid(); RLS with_check passes because the client is
  // signed in. PK is (date), so onConflict 'date' overwrites in place.
  const { error } = await supabase
    .from('tide_oura_daily')
    .upsert(rows, { onConflict: 'date' })
  if (error) throw new Error(`save failed: ${error.message}`)
  return { upserted: rows.length }
}
