// Thin I/O layer over the pure `proposeSchedule` heuristic. Reads tasks
// (usePillars), the target day's placed blocks (usePlacedBlocks), and produces /
// persists `today_proposed` blocks. The heuristic stays React-free; this hook
// stamps `source`/`id` and owns the lifecycle (generate / accept).
//
// Lifecycle (decisions Q3/Q7/Q8): day-before generation is a low-confidence
// PREVIEW on neutral assumptions (no live readiness, only already-ingested
// events). The morning-of regeneration is the authoritative pass. Regenerate
// wipes only `today_proposed`; everything else (ical / routine / today_user) is
// treated as a fixed obstacle, so user edits self-heal.

import { useCallback, useMemo } from 'react'
import { usePillars } from './usePillars'
import { usePlacedBlocks } from './usePlacedBlocks'
import { daysFromToday } from './surfaceActions'
import { proposeSchedule, flattenPillars } from './proposeSchedule'

const WINDOW = { first: 8, last: 18 }

export function useProposedSchedule(dateISO) {
  const { pillars, loading: pillarsLoading } = usePillars()
  const { placed, setPlaced, loading: placedLoading } = usePlacedBlocks(dateISO)

  const { tasks, projectsById } = useMemo(() => flattenPillars(pillars), [pillars])

  // Urgency is relative to the day the schedule is FOR, not "now": a task due
  // on `dateISO` reads as d=0, not d=1.
  const daysFn = useMemo(() => {
    const ref = new Date(`${dateISO}T12:00:00`)
    return (iso) => daysFromToday(iso, ref)
  }, [dateISO])

  // Everything that is not a proposal is an immovable obstacle (decisions Q7).
  const obstacles = useMemo(() => placed.filter((b) => b.source !== 'today_proposed'), [placed])
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
      }).map((b) => ({
        ...b,
        id: crypto.randomUUID(), // placed_blocks PK must be a UUID
        source: 'today_proposed',
        sourceId: b.sourceId ?? null, // originating task id (round-trip / dedup)
      }))
      setPlaced((prev) => [...prev.filter((b) => b.source !== 'today_proposed'), ...blocks])
      return blocks
    },
    [tasks, obstacles, projectsById, daysFn, setPlaced]
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
      setPlaced((prev) =>
        prev.map((b) => (b.id === id ? { ...b, source: 'today_user' } : b))
      )
    },
    [setPlaced]
  )

  const clearProposals = useCallback(() => {
    setPlaced((prev) => prev.filter((b) => b.source !== 'today_proposed'))
  }, [setPlaced])

  return {
    obstacles,
    proposed,
    generate,
    regenerate: generate, // same op — wipes + recomputes proposals
    acceptAll,
    acceptOne,
    clearProposals,
    loading: pillarsLoading || placedLoading,
  }
}
