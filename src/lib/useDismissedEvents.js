// Per-day dismissal set for calendar events, persisted in localStorage.
//
// Same storage pattern (and same reasoning) as the proposal denials in
// `useProposedSchedule`: it's a scratch decision about how one day should look,
// not a fact about the meeting, and Today does not own the ical rows. Stored per
// date so dismissing tomorrow's standup doesn't hide next Tuesday's.
//
// Device-local by design for now — see `dismissedEvents.js` for why this can't
// simply be a DB delete.

import { useCallback, useState } from 'react'
import { eventKey } from './dismissedEvents'

const KEY = (dateISO) => `today.dismissedEvents.${dateISO}`

function read(dateISO) {
  try {
    const raw = localStorage.getItem(KEY(dateISO))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function useDismissedEvents(dateISO) {
  // Reconcile during render rather than in an effect: an effect would render one
  // frame showing the wrong day's dismissals.
  const [state, setState] = useState(() => ({ date: dateISO, set: read(dateISO) }))
  if (state.date !== dateISO) setState({ date: dateISO, set: read(dateISO) })
  const dismissed = state.date === dateISO ? state.set : read(dateISO)

  const persist = useCallback(
    (next) => {
      setState({ date: dateISO, set: next })
      try {
        localStorage.setItem(KEY(dateISO), JSON.stringify([...next]))
      } catch {
        /* private mode / quota — the dismissal still holds for this session */
      }
    },
    [dateISO]
  )

  const dismiss = useCallback(
    (block) => {
      const k = eventKey(block)
      if (!k) return
      const next = new Set(dismissed)
      next.add(k)
      persist(next)
    },
    [dismissed, persist]
  )

  const restoreAll = useCallback(() => persist(new Set()), [persist])

  return { dismissed, dismiss, restoreAll }
}
