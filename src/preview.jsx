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
import { recurringKey } from './lib/useBlockItems.js'

const BLOCK = {
  id: 'b1',
  type: 'arrow',
  hour: 9,
  duration: 60,
  title: 'Arrow',
  pillar: 'arrow',
}

const PLACED = [
  BLOCK,
  { id: 'b2', type: 'meeting', hour: 10, duration: 60, title: 'SGS Projects — Global Tracking Weekly Call' },
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
  const [items, setItems] = useState(SEED)
  const [recurring, setRecurring] = useState(RECUR)

  const byBlock = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      const arr = m.get(it.blockId) ?? []
      arr.push(it)
      m.set(it.blockId, arr)
    }
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
    addItem: (blockId, { label, source = 'manual', cpTaskId = null }) =>
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), blockId, position: prev.length, source, cpTaskId,
          label, done: false, recurringKey: null, estMinutes: null, startedAt: null, elapsedSeconds: 0 },
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
      m.set(blockId, { total: list.length, done: list.filter((i) => i.done).length })
    }
    return m
  }, [api.byBlock])

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
        subtitle="drag from the dock · tap a block's badge to assign work"
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

function Preview() {
  const api = useFakeApi()
  const [mode, setMode] = useState('grid')

  return (
    <div className="stage">
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 999, display: 'flex', gap: 6 }}>
        {['grid', 'sheet'].map((m) => (
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
