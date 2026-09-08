// How old is the day's ingested data?
//
// Both feeds into Today are once-a-day pushes from outside the app: the iOS
// Shortcut writes `placed_blocks` rows with source='ical', and the Mac launchd
// agent replaces `today_reminders`. Neither can tell the app it ran, and when
// the ical Shortcut silently broke (RLS, May 2026) the agenda just quietly kept
// showing a stale day for months. This surfaces the age so a dead feed reads as
// dead instead of as an empty morning.
//
// Read-only and cheap: one row from each table, refreshed when the PWA comes
// back to the foreground.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'

// ms -> "3h ago" / "2d ago". Deliberately coarse: the point is "is this today's
// data or last week's", not a precise clock.
export function fmtAge(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function useSyncAge() {
  const [calendar, setCalendar] = useState(null)
  const [reminders, setReminders] = useState(null)
  const visibilityKey = useVisibilityKey()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cal, rem] = await Promise.all([
        // Latest ical write across ALL dates, not just the day being shown:
        // this answers "when did the calendar feed last run", which is the
        // health signal. Filtering to one date would read as "never synced" on
        // a day that genuinely has no meetings.
        supabase
          .from('placed_blocks')
          .select('updated_at')
          .eq('source', 'ical')
          .order('updated_at', { ascending: false })
          .limit(1),
        supabase
          .from('today_reminders')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      setCalendar(cal.data?.[0]?.updated_at ?? null)
      setReminders(rem.data?.[0]?.created_at ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [visibilityKey])

  return { calendar, reminders }
}
