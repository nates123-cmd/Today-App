// Thin I/O layer over the pure `proposeSchedule` heuristic. Reads tasks
// (usePillars), the target day's placed blocks (usePlacedBlocks), and produces /
// persists `today_proposed` blocks. The heuristic stays React-free; this hook
// stamps `source`/`id` and owns the lifecycle (generate / accept / deny).
//
// Lifecycle (decisions Q3/Q7/Q8): day-before generation is a low-confidence
// PREVIEW on neutral assumptions (no live readiness, only already-ingested
// events). The morning-of regeneration is the authoritative pass. Regenerate
// wipes only `today_proposed`; everything else (ical / routine / today_user) is
// treated as a fixed obstacle, so user edits self-heal.
//
// Deny is per-DAY and survives a reload (localStorage). A denial that vanished
// on refresh would put the same rejected task back in front of the user, which
// is the one thing a confirm/deny affordance must never do. It is deliberately
// NOT written to Supabase: it's a scratch decision about one day's draft, not a
// fact about the task.

import { useCallback, useMemo, useState } from 'react'
import { usePillars } from './usePillars'
import { usePlacedBlocks } from './usePlacedBlocks'
import { daysFromToday } from './surfaceActions'
import { proposeSchedule, flattenPillars } from './proposeSchedule'
import { eventKey } from './dismissedEvents'

const WINDOW = { first: 8, last: 18 }
const DENY_KEY = (dateISO) => `today.denied.${dateISO}`

function readDenied(dateISO) {
  try {
    const raw = localStorage.getItem(DENY_KEY(dateISO))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

// `hiddenKeys` (a Set of dismissedEvents `eventKey`s) removes dismissed calendar
// events from the obstacle set, so deleting a meeting from the agenda actually
// frees that time for the generator to fill — otherwise the day would still be
// planned around a meeting the user just said isn't happening.
export function useProposedSchedule(dateISO, hiddenKeys) {
  const { pillars, loading: pillarsLoading } = usePillars()
  const { placed, setPlaced, loading: placedLoading } = usePlacedBlocks(dateISO)

  const { tasks, projectsById } = useMemo(() => flattenPillars(pillars), [pillars])

  // Denials are keyed by day. Re-reading them in an effect would render one
  // frame with the wrong day's denials, so reconcile during render instead
  // (React's documented pattern for state derived from a changing prop).
  const [deniedState, setDeniedState] = useState(() => ({ date: dateISO, set: readDenied(dateISO) }))
  if (deniedState.date !== dateISO) setDeniedState({ date: dateISO, set: readDenied(dateISO) })
  const denied = deniedState.date === dateISO ? deniedState.set : readDenied(dateISO)

  const persistDenied = useCallback(
    (next) => {
      setDeniedState({ date: dateISO, set: next })
      try {
        localStorage.setItem(DENY_KEY(dateISO), JSON.stringify([...next]))
      } catch {
        /* private mode / quota — deny still holds for this session */
      }
    },
    [dateISO]
  )

  // Urgency is relative to the day the schedule is FOR, not "now": a task due
  // on `dateISO` reads as d=0, not d=1.
  const daysFn = useMemo(() => {
    const ref = new Date(`${dateISO}T12:00:00`)
    return (iso) => daysFromToday(iso, ref)
  }, [dateISO])

  // Everything that is not a proposal is an immovable obstacle (decisions Q7) —
  // minus anything the user dismissed from the agenda.
  const obstacles = useMemo(
    () =>
      placed.filter(
        (b) => b.source !== 'today_proposed' && !(hiddenKeys?.has(eventKey(b)) ?? false)
      ),
    [placed, hiddenKeys]
  )
  const proposed = useMemo(() => placed.filter((b) => b.source === 'today_proposed'), [placed])

  // Day-before preview uses neutral readiness (tomorrow's Oura row doesn't exist
  // yet). The authoritative morning-of pass would inject the live row here.
  const generate = useCallback(
    (readiness = null) => {
      const blocks = proposeSchedule({
        tasks,
        obstacles,
        readiness,
        daysFromToday: daysFn,
        projectsById,
        window: WINDOW,
        excludeTaskIds: [...denied],
      }).map((b) => ({
        ...b,
        id: crypto.randomUUID(), // placed_blocks PK must be a UUID
        source: 'today_proposed',
        sourceId: b.sourceId ?? null, // originating task id (round-trip / dedup)
      }))
      setPlaced((prev) => [...prev.filter((b) => b.source !== 'today_proposed'), ...blocks])
      return blocks
    },
    [tasks, obstacles, projectsById, daysFn, denied, setPlaced]
  )

  // Accept-all: remaining proposals -> committed (today_user).
  const acceptAll = useCallback(() => {
    setPlaced((prev) =>
      prev.map((b) => (b.source === 'today_proposed' ? { ...b, source: 'today_user' } : b))
    )
  }, [setPlaced])

  // Touch-to-accept a single proposed block.
  const acceptOne = useCallback(
    (id) => {
      setPlaced((prev) => prev.map((b) => (b.id === id ? { ...b, source: 'today_user' } : b)))
    },
    [setPlaced]
  )

  // Deny: drop the block AND remember the task so regenerate skips it.
  const denyOne = useCallback(
    (id) => {
      const block = placed.find((b) => b.id === id)
      if (block?.sourceId) {
        const next = new Set(denied)
        next.add(block.sourceId)
        persistDenied(next)
      }
      setPlaced((prev) => prev.filter((b) => b.id !== id))
    },
    [placed, denied, persistDenied, setPlaced]
  )

  // Undo every deny for this day — the next generate can offer them again.
  const clearDenied = useCallback(() => persistDenied(new Set()), [persistDenied])

  const clearProposals = useCallback(() => {
    setPlaced((prev) => prev.filter((b) => b.source !== 'today_proposed'))
  }, [setPlaced])

  return {
    pillars,
    placed,
    setPlaced,
    obstacles,
    proposed,
    denied,
    generate,
    regenerate: generate, // same op — wipes + recomputes proposals
    acceptAll,
    acceptOne,
    denyOne,
    clearDenied,
    clearProposals,
    loading: pillarsLoading || placedLoading,
  }
}
