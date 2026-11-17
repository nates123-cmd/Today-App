// Dev-only harness for the BlockView surface.
//
// The real app sits behind an email-OTP AuthGate, so the block sheet cannot be
// eyeballed without a live session. This mounts it against fixtures with an
// in-memory stand-in for useBlockItems, so layout, states and the timing panel
// can be checked in a browser. Not part of the production bundle — index.html
// is the app's only entry; this one is reached at /preview.html in `vite dev`.

import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './surfaces.css'
import './surfaces2.css'
import './shell.css'
import { BlockView, CoursePicker } from './surfaces/BlockView.jsx'
import { Scheduling } from './surfaces/Scheduling.jsx'
import { Live } from './surfaces/Live.jsx'
import { recurringKey } from './lib/useBlockItems.js'

const BLOCK = {
  id: 'b1',
  type: 'arrow',
  hour: 9,
  duration: 60,
  title: 'Arrow',
  pillar: 'arrow',
}

// A 90-minute block planned as a sub-schedule, the way it would be laid out
// the night before on the Tomorrow grid.
const SCHED_BLOCK = {
  id: 'b3',
  type: 'arrow',
  hour: 13,
  duration: 90,
  title: 'Arrow',
  pillar: 'arrow',
}

const PLACED = [
  BLOCK,
  { id: 'b2', type: 'meeting', hour: 10, duration: 60, title: 'SGS Projects — Global Tracking Weekly Call' },
  SCHED_BLOCK,
]

const step = (id, position, label, estMinutes, extra = {}) => ({
  id, blockId: 'b3', position, source: 'manual', cpTaskId: null, label, done: false,
  recurringKey: null, estMinutes, startedAt: null, elapsedSeconds: 0, ...extra,
})
const SCHED_SEED = [
  step('s1', 0, 'Draft the renewal outline', 30),
  step('s2', 1, 'Pull Q3 numbers from the tracker', 15, { source: 'course', cpTaskId: 't2' }),
  step('s3', 2, 'Write section 2', 25),
  step('s4', 3, 'Send to Jason for a read', null),
]

const SEED = [
  { id: 'i1', blockId: 'b1', position: 0, source: 'manual', cpTaskId: null,
    label: 'Respond to the lawyers (particularly Sophie)', done: false,
    recurringKey: null, estMinutes: 30, startedAt: new Date(Date.now() - 41 * 60 * 1000).toISOString(), elapsedSeconds: 0 },
  { id: 'i2', blockId: 'b1', position: 1, source: 'manual', cpTaskId: null,
    label: 'Look into renewals — hit up ML and Jason', done: false,
    recurringKey: null, estMinutes: null, startedAt: null, elapsedSeconds: 0 },
  { id: 'i3', blockId: 'b1', position: 2, source: 'course', cpTaskId: 't9',
    label: 'Review the SGS Global Tracker items', done: false,
    recurringKey: null, estMinutes: 15, startedAt: null, elapsedSeconds: 0 },
  { id: 'i4', blockId: 'b1', position: 3, source: 'manual', cpTaskId: null,
    label: 'Meeting updates and review', done: true,
    recurringKey: 'meeting-updates-and-review', estMinutes: 10, startedAt: null, elapsedSeconds: 12 * 60 },
]

const RECUR = [
  { id: 'r1', key: 'meeting-updates-and-review', label: 'Meeting updates and review',
    est_minutes: 10, runs: 4, total_seconds: 4 * 13 * 60, last_seconds: 12 * 60 },
]

const PILLAR_FIXTURE = {
  id: 'arrow',
  name: 'Arrow',
  projects: [
    {
      id: 'p1', name: 'SGS CRM Global', meta: 'active', dueDate: '2026-09-11',
      outcome: 'Tracker current through the weekly call',
      tasks: [
        { id: 't1', label: 'Draft EMEA drop-in comments', status: 'now', doDate: '2026-09-09' },
        { id: 't2', label: 'Chase NA owners for status', status: 'icebox', doDate: null },
        { id: 't3', label: 'Reconcile the two trackers', status: 'icebox', doDate: null },
      ],
    },
    {
      id: 'p2', name: 'CSA Program', meta: 'active', dueDate: null, outcome: null,
      tasks: [{ id: 't9', label: 'Review the SGS Global Tracker items', status: 'icebox', doDate: null }],
    },
  ],
  openTasks: [],
}

// In-memory stand-in for useBlockItems: same surface area, no network.
function useFakeApi() {
  const [items, setItems] = useState([...SEED, ...SCHED_SEED])
  const [views, setViews] = useState(() => new Map([['b3', 'schedule']]))
  const [recurring, setRecurring] = useState(RECUR)

  const byBlock = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      const arr = m.get(it.blockId) ?? []
      arr.push(it)
      m.set(it.blockId, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position)
    return m
  }, [items])

  const patch = (id, p) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const now = () => new Date().toISOString()
  const elapsedOf = (it) =>
    (it.elapsedSeconds ?? 0) +
    (it.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(it.startedAt).getTime()) / 1000)) : 0)

  return {
    items,
    byBlock,
    assignedTaskIds: new Set(items.filter((i) => i.cpTaskId).map((i) => i.cpTaskId)),
    recurring,
    recurringByKey: new Map(recurring.map((r) => [r.key, r])),
    viewByBlock: views,
    setBlockView: (blockId, view) => setViews((prev) => new Map(prev).set(blockId, view)),
    reorder: (blockId, orderedIds) => {
      const rank = new Map(orderedIds.map((id, i) => [id, i]))
      setItems((prev) =>
        prev.map((i) => (i.blockId === blockId && rank.has(i.id) ? { ...i, position: rank.get(i.id) } : i))
      )
    },
    addItem: (blockId, { label, source = 'manual', cpTaskId = null, estMinutes = null }) =>
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), blockId, position: prev.length, source, cpTaskId,
          label, done: false, recurringKey: null, estMinutes, startedAt: null, elapsedSeconds: 0 },
      ]),
    removeItem: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
    toggleDone: (item) =>
      patch(item.id, { done: !item.done, startedAt: null, elapsedSeconds: elapsedOf(item) }),
    startTimer: (item) => patch(item.id, { startedAt: now() }),
    pauseTimer: (item) => patch(item.id, { startedAt: null, elapsedSeconds: elapsedOf(item) }),
    resetTimer: (item) => patch(item.id, { startedAt: null, elapsedSeconds: 0 }),
    setEstimate: (item, m) => patch(item.id, { estMinutes: m }),
    markRecurring: (item, { estMinutes = null } = {}) => {
      const key = recurringKey(item.label)
      setRecurring((prev) =>
        prev.some((r) => r.key === key)
          ? prev
          : [...prev, { id: crypto.randomUUID(), key, label: item.label, est_minutes: estMinutes, runs: 0, total_seconds: 0, last_seconds: null }]
      )
      patch(item.id, { recurringKey: key, estMinutes: estMinutes ?? item.estMinutes ?? null })
    },
    unmarkRecurring: (item) => patch(item.id, { recurringKey: null }),
    refresh: () => {},
  }
}

// The Tomorrow grid, wired exactly as TomorrowPlan wires it: `Scheduling` in
// embedded mode with `onOpenBlock` + `itemCounts` threaded through. This is the
// path that was broken — TomorrowPlan rendered the embedded grid without either
// prop, so the assign button never rendered and a block on tomorrow could not
// be given any work. Scheduling imports no Supabase, so it mounts here against
// fixtures for real rather than as a mock.
function GridPreview({ api }) {
  const [placed, setPlaced] = useState(PLACED)
  const [openBlock, setOpenBlock] = useState(null)

  const itemCounts = useMemo(() => {
    const m = new Map()
    for (const [blockId, list] of api.byBlock) {
      m.set(blockId, {
        total: list.length,
        done: list.filter((i) => i.done).length,
        steps: api.viewByBlock.get(blockId) === 'schedule' ? list : null,
      })
    }
    return m
  }, [api.byBlock, api.viewByBlock])

  return (
    <>
      <Scheduling
        embedded
        placed={placed}
        setPlaced={setPlaced}
        remainingMinsByPillar={{}}
        onOpenBlock={setOpenBlock}
        itemCounts={itemCounts}
        title="Tomorrow"
        subtitle="drag from the dock · tap a block to plan it · pull bottom edge to resize"
      />
      {/* App renders this at its root, outside the transformed .day-overlay.
          `placed` is null for a tomorrow block so the "next event in N min"
          nudge — a today concept — stays hidden. */}
      {openBlock && (
        <BlockView block={openBlock} placed={null} api={api} onClose={() => setOpenBlock(null)} />
      )}
    </>
  )
}

// Live, with a block wrapped around the current time so the active card and the
// "now" step can be seen. The block starts 40 minutes ago: step one's slot is
// over (late), step two is the one the clock is in.
function LivePreview({ api }) {
  const [openBlock, setOpenBlock] = useState(null)
  const now = new Date()
  const start = Math.round((now.getHours() + now.getMinutes() / 60 - 40 / 60) * 60) / 60
  const liveBlock = useMemo(() => ({ ...SCHED_BLOCK, hour: start }), [start])
  const placed = [liveBlock]
  const itemCounts = new Map(
    [...api.byBlock].map(([id, list]) => [id, { total: list.length, done: list.filter((i) => i.done).length }])
  )
  return (
    <>
      <Live
        placed={placed}
        onOpenBlock={() => setOpenBlock(liveBlock)}
        itemCounts={itemCounts}
        itemsByBlock={api.byBlock}
        viewByBlock={api.viewByBlock}
      />
      {openBlock && (
        <BlockView block={openBlock} placed={placed} api={api} isToday onClose={() => setOpenBlock(null)} />
      )}
    </>
  )
}

function Preview() {
  const api = useFakeApi()
  const [mode, setMode] = useState(() => new URLSearchParams(location.search).get('mode') || 'grid')

  return (
    <div className="stage">
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 999, display: 'flex', gap: 6 }}>
        {['grid', 'schedule', 'live', 'sheet'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              font: '11px ui-monospace, monospace',
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid #ccc',
              background: mode === m ? '#222' : '#fff',
              color: mode === m ? '#fff' : '#222',
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="phone">
        {mode === 'grid' ? <GridPreview api={api} /> : null}
        {mode === 'schedule' ? (
          <BlockView block={SCHED_BLOCK} placed={null} api={api} onClose={() => setMode('grid')} />
        ) : null}
        {mode === 'live' ? <LivePreview api={api} /> : null}
        {mode === 'sheet' ? (
          <>
            <BlockView block={BLOCK} placed={PLACED} api={api} onClose={() => {}} />
            {/* usePillars needs a session, so the sheet's own picker stays empty
                here. Render one against a fixture pillar so its styles are
                reviewable too. */}
            <div style={{ position: 'absolute', left: 20, right: 20, bottom: 150, zIndex: 200 }}>
              <CoursePicker
                pillar={PILLAR_FIXTURE}
                block={BLOCK}
                assignedTaskIds={api.assignedTaskIds}
                onAdd={(p) => api.addItem(BLOCK.id, p)}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Preview />
  </StrictMode>
)
