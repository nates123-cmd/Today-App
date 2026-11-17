// BlockView — the drill-in you get by tapping a block on Scheduling or Live.
//
// This used to be PillarBlockView, and it *inferred* the work: given a block
// tagged `arrow` it listed every Arrow project. That is a directory, not a
// plan. Now the block owns an explicit checklist (block_items) and the pillar's
// Course+ projects are demoted to what they actually are — the picker you pull
// from. Free-typed items sit alongside pulled ones with no distinction beyond
// the badge.
//
// Course+ is read-only here by design (see useBlockItems): labels are
// snapshots, and only completion writes back.
//
// The same items read two ways. LIST is the checklist. SCHEDULE lays them on
// the clock inside the block — each step's time derived from the block's start
// plus the durations above it (lib/subSchedule.js), so order is the timeline
// and dragging a step reschedules it. Which view a block was left in is
// remembered per block.

import React from 'react'
import { IconCheck, IconPause, IconPlus, IconStopwatch } from '../icons.jsx'
import { usePillars } from '../lib/usePillars.js'
import { surfaceActions } from '../lib/surfaceActions.js'
import { liveElapsed, fmtDuration } from '../lib/useBlockItems.js'
import { layoutSchedule, scheduleNow, moveId, fmtClock, DEFAULT_STEP_MINUTES } from '../lib/subSchedule.js'

const PILLAR_NAMES = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', sidegig: 'Side gig', open: 'Open Tasks' }
const EST_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90]
const QUICK_SIZES = [15, 30, 45]

function fmtTime(h) {
  const hr = Math.floor(h)
  const m = Math.round((h - hr) * 60)
  const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr
  const ap = hr < 12 ? 'a' : 'p'
  return m === 0 ? `${hr12}${ap}` : `${hr12}:${String(m).padStart(2, '0')}${ap}`
}

function formatProjectDue(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─────────────────────────── block-level pomodoro ───────────────────────────
// Unchanged from the old surface. Times the BLOCK; the per-item stopwatch below
// times one thing. They are independent on purpose — a 25-minute focus push and
// "how long does the Maggetti post actually take" are different questions.

function FocusTimer() {
  const [seconds, setSeconds] = React.useState(25 * 60)
  const [running, setRunning] = React.useState(false)
  const [mode, setMode] = React.useState(null)

  React.useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { setRunning(false); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const start = (m) => { setMode(m); setRunning(true) }

  return (
    <div className={`focus-timer ${running ? 'running' : ''}`}>
      <div className="focus-display">
        <div className="focus-time">{mm}:{ss}</div>
        <div className="focus-mode">
          {running ? (mode === 'shortcut' ? 'shortcut · dnd on' : 'local · ticking') : 'pomodoro · 25 min'}
        </div>
      </div>
      <div className="focus-actions">
        {!running ? (
          <>
            <button className="focus-btn" onClick={() => start('local')}>
              local<span className="sublabel">just count</span>
            </button>
            <button className="focus-btn primary" onClick={() => start('shortcut')}>
              shortcut<span className="sublabel">dnd · focus · murmur</span>
            </button>
          </>
        ) : (
          <>
            <button className="focus-btn" onClick={() => setRunning(false)}><IconPause /></button>
            <button className="focus-btn" onClick={() => { setRunning(false); setSeconds(25 * 60); setMode(null) }}>reset</button>
          </>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── one assigned item ─────────────────────────

// `sched` is set only in Schedule view: { time, late, spills, now, gripProps,
// dragging, rowRef }. It adds the clock column and the drag grip and drops the
// row furniture that view has no room for; the panel underneath is identical.
function AssignedItem({ item, api, recurDef, expanded, onExpand, sched = null }) {
  // A running stopwatch needs a per-second repaint; a stopped one does not, so
  // the interval only exists while something is actually ticking.
  const running = !!item.startedAt
  const [, forceTick] = React.useState(0)
  React.useEffect(() => {
    if (!running) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const elapsed = liveElapsed(item)
  const hasClock = running || elapsed > 0
  const estSec = (item.estMinutes ?? 0) * 60
  const over = estSec > 0 && elapsed > estSec

  const avg = recurDef && recurDef.runs > 0 ? recurDef.total_seconds / recurDef.runs : null

  return (
    <div
      ref={sched?.rowRef}
      className={`bitem ${item.done ? 'done' : ''} ${sched ? 'sched' : ''} ${sched?.now ? 'now' : ''} ${sched?.late ? 'late' : ''} ${sched?.dragging ? 'dragging' : ''}`}
    >
      <div className="bitem-row">
        {sched && (
          <div className={`bitem-time ${sched.spills ? 'spills' : ''}`}>{sched.time}</div>
        )}
        <div
          className={`pblock-task-check ${item.done ? 'done' : ''}`}
          onClick={(e) => { e.stopPropagation(); api.toggleDone(item) }}
        >
          {item.done && <IconCheck w={10} />}
        </div>
        <div className="bitem-label" onClick={onExpand}>
          {item.label}
          {item.recurringKey && <span className="bitem-recur-dot" title="recurring">↻</span>}
        </div>
        {hasClock && (
          <div className={`bitem-clock ${running ? 'running' : ''} ${over ? 'over' : ''}`}>
            {fmtDuration(elapsed)}
          </div>
        )}
        {!sched && !hasClock && item.estMinutes != null && (
          <div className="bitem-est">{item.estMinutes}m</div>
        )}
        {!sched && item.source === 'course' && <div className="bitem-badge">course</div>}
        {!sched && (
          <button
            className={`bitem-timer-btn ${running ? 'running' : ''}`}
            onClick={onExpand}
            aria-label={running ? 'pause timing' : 'timing'}
          >
            {running ? <IconPause w={13} /> : <IconStopwatch w={15} />}
          </button>
        )}
        {sched && (
          <>
            <button className="bitem-dur" onClick={onExpand} aria-label="change length">
              {item.estMinutes}m
            </button>
            <div className="bitem-grip" aria-label="drag to reorder" {...sched.gripProps}>
              <span></span><span></span><span></span>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="bitem-panel">
          {/* The prompt, only asked once per label. */}
          {!item.recurringKey ? (
            <button
              className="bitem-chip prompt"
              onClick={() => api.markRecurring(item, { estMinutes: item.estMinutes ?? null })}
            >
              do this often? mark recurring
            </button>
          ) : (
            <div className="bitem-history">
              {avg != null
                ? `avg ${fmtDuration(avg)} over ${recurDef.runs} run${recurDef.runs === 1 ? '' : 's'}`
                : 'recurring · no runs timed yet'}
              {recurDef?.last_seconds ? ` · last ${fmtDuration(recurDef.last_seconds)}` : ''}
              {item.estMinutes != null ? ` · est ${item.estMinutes}m` : ''}
              <button className="bitem-unrecur" onClick={() => api.unmarkRecurring(item)}>drop</button>
            </div>
          )}

          <div className="bitem-est-row">
            <span className="bitem-panel-label">{sched ? 'length' : 'estimate'}</span>
            {EST_CHOICES.map((m) => (
              <button
                key={m}
                className={`bitem-chip ${item.estMinutes === m ? 'on' : ''}`}
                onClick={() => api.setEstimate(item, item.estMinutes === m ? null : m)}
              >
                {m}m
              </button>
            ))}
          </div>

          <div className="bitem-timer-row">
            {running ? (
              <button className="bitem-chip go" onClick={() => api.pauseTimer(item)}>pause</button>
            ) : (
              <button className="bitem-chip go" onClick={() => api.startTimer(item)}>
                {elapsed > 0 ? 'resume' : 'start timer'}
              </button>
            )}
            {elapsed > 0 && (
              <button className="bitem-chip" onClick={() => api.resetTimer(item)}>reset</button>
            )}
            {estSec > 0 && elapsed > 0 && (
              <span className={`bitem-delta ${over ? 'over' : ''}`}>
                {over ? '+' : '−'}{fmtDuration(Math.abs(elapsed - estSec))} vs est
              </span>
            )}
            <button className="bitem-chip danger" onClick={() => api.removeItem(item.id)}>remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── the sub-schedule ─────────────────────────

function ScheduleView({ block, items, api, isToday, nowDecimal, expandedItem, setExpandedItem }) {
  // While a grip is held, `dragOrder` is the live order of the sized steps and
  // the layout is computed from it — so the times on every row re-derive as
  // the step moves, which is the whole feedback of the gesture.
  const [dragOrder, setDragOrder] = React.useState(null)
  const [dragId, setDragId] = React.useState(null)
  const startOrder = React.useRef(null)
  const rowEls = React.useRef(new Map())

  const working = React.useMemo(() => {
    if (!dragOrder) return items
    const rank = new Map(dragOrder.map((id, i) => [id, i]))
    return items.map((it) =>
      rank.has(it.id) ? { ...it, position: rank.get(it.id) } : { ...it, position: 1e6 + it.position }
    )
  }, [items, dragOrder])

  const layout = layoutSchedule(working, block)
  const live = isToday ? scheduleNow(layout, nowDecimal) : null
  const lateIds = new Set((live?.late ?? []).map((r) => r.item.id))
  const sizedIds = layout.rows.map((r) => r.item.id)

  const stopDrag = () => { setDragId(null); setDragOrder(null); startOrder.current = null }

  const gripFor = (id) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      e.stopPropagation()
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
      startOrder.current = sizedIds
      setDragId(id)
      setDragOrder(sizedIds)
    },
    onPointerMove: (e) => {
      if (dragId !== id || !dragOrder) return
      // Target slot = how many OTHER rows have their midpoint above the finger.
      let index = 0
      for (const otherId of dragOrder) {
        if (otherId === id) continue
        const el = rowEls.current.get(otherId)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientY > r.top + r.height / 2) index += 1
      }
      const next = moveId(dragOrder, id, index)
      if (next.join() !== dragOrder.join()) setDragOrder(next)
    },
    onPointerUp: () => {
      if (dragId !== id) return
      const order = dragOrder
      const changed = order && order.join() !== (startOrder.current ?? []).join()
      stopDrag()
      // Unsized steps keep their relative order, after the timeline.
      if (changed) api.reorder(block.id, [...order, ...layout.unscheduled.map((i) => i.id)])
    },
    onPointerCancel: stopDrag,
  })

  const sizeEvenly = () => {
    const n = layout.unscheduled.length
    if (!n) return
    const room = layout.freeMinutes > 0 ? layout.freeMinutes : n * DEFAULT_STEP_MINUTES
    const each = Math.max(5, Math.floor(room / n / 5) * 5)
    for (const it of layout.unscheduled) api.setEstimate(it, each)
  }

  // The end-of-block line sits before the first step that starts after the
  // block is over; a step that straddles the end stays above it, flagged.
  const endIndex = layout.rows.findIndex((r) => r.startsAfterEnd)

  const summary = layout.overMinutes > 0
    ? `${layout.overMinutes}m over`
    : `${layout.plannedMinutes} of ${layout.blockMinutes}m planned`

  const endLine = (
    <div className="sched-endline">
      <span>{fmtClock(layout.blockEnd)}</span>
      <span className="sched-endline-rule"></span>
      <span>block ends</span>
    </div>
  )

  return (
    <div className="bsched">
      <div className={`bsched-summary ${layout.overMinutes > 0 ? 'over' : ''}`}>{summary}</div>

      {layout.rows.length === 0 && layout.unscheduled.length === 0 && (
        <div className="bitem-empty">
          no steps yet. Add one below and it lands at {fmtClock(layout.blockStart)}.
        </div>
      )}

      <div className="bitem-list">
        {layout.rows.map((row, i) => (
          <React.Fragment key={row.item.id}>
            {i === endIndex && endLine}
            <AssignedItem
              item={row.item}
              api={api}
              recurDef={row.item.recurringKey ? api.recurringByKey.get(row.item.recurringKey) : null}
              expanded={expandedItem === row.item.id}
              onExpand={() => setExpandedItem((cur) => (cur === row.item.id ? null : row.item.id))}
              sched={{
                time: fmtClock(row.startHour),
                spills: row.spills,
                late: lateIds.has(row.item.id),
                now: live?.current?.item.id === row.item.id && !row.item.done,
                dragging: dragId === row.item.id,
                gripProps: gripFor(row.item.id),
                rowRef: (el) => {
                  if (el) rowEls.current.set(row.item.id, el)
                  else rowEls.current.delete(row.item.id)
                },
              }}
            />
          </React.Fragment>
        ))}
        {layout.rows.length > 0 && layout.freeMinutes > 0 && (
          <div className="sched-free">
            <span className="bitem-time">{fmtClock(layout.blockStart + layout.plannedMinutes / 60)}</span>
            <span className="sched-free-label">open</span>
            <span className="sched-free-min">{layout.freeMinutes}m</span>
          </div>
        )}
        {layout.overMinutes > 0 && endIndex === -1 && endLine}
      </div>

      {layout.unscheduled.length > 0 && (
        <div className="sched-unsized">
          <div className="sched-unsized-head">
            <span>not sized yet</span>
            {layout.unscheduled.length > 1 && (
              <button className="bitem-chip" onClick={sizeEvenly}>split the open time</button>
            )}
          </div>
          {layout.unscheduled.map((it) => (
            <div key={it.id} className={`sched-unsized-row ${it.done ? 'done' : ''}`}>
              <span className="sched-unsized-label">{it.label}</span>
              {QUICK_SIZES.map((m) => (
                <button key={m} className="bitem-chip" onClick={() => api.setEstimate(it, m)}>{m}m</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────── pull work in from Course+ ─────────────────────

// Exported so the dev preview (preview.html) can render it against fixture
// pillars — the real one is fed by usePillars, which needs a signed-in session.
export function CoursePicker({ pillar, block, onAdd, assignedTaskIds }) {
  const [open, setOpen] = React.useState(false)
  const [expandedProjects, setExpandedProjects] = React.useState(() => new Set())
  const today = new Date()

  const projects = pillar
    ? block.projectId
      ? pillar.projects.filter((p) => p.id === block.projectId)
      : pillar.projects
    : []
  const openTasks = pillar && !block.projectId ? pillar.openTasks ?? [] : []

  if (!pillar) return null

  const toggleProject = (id) =>
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const TaskRow = ({ t, urgent }) => {
    const taken = assignedTaskIds.has(t.id)
    return (
      <div
        className={`picker-task ${taken ? 'taken' : ''} ${urgent ? 'urgent' : ''}`}
        onClick={() => !taken && onAdd({ label: t.label, source: 'course', cpTaskId: t.id })}
      >
        <span className="picker-plus">{taken ? <IconCheck w={11} /> : <IconPlus w={11} />}</span>
        <span className="picker-task-label">{t.label}</span>
        {urgent && formatProjectDue(t.doDate) && (
          <span className="pblock-task-due">{formatProjectDue(t.doDate)}</span>
        )}
      </div>
    )
  }

  return (
    <div className="picker">
      <div className="picker-head" onClick={() => setOpen((o) => !o)}>
        <span className={`pblock-expand-chev ${open ? 'open' : ''}`}>›</span>
        <span>{open ? 'hide' : 'pull from'} Course+ · {pillar.name}</span>
      </div>
      {open && (
        <div className="picker-body">
          {projects.length === 0 && openTasks.length === 0 && (
            <div className="pblock-project-meta">no active projects in this pillar</div>
          )}
          {projects.map((project) => {
            const openList = project.tasks
            const sa = surfaceActions(openList, today)
            const surfaced = sa.state === 'urgent_double'
              ? [sa.primary, sa.secondary]
              : sa.state === 'empty' ? [] : [sa.primary]
            const urgentId = sa.state.startsWith('urgent') ? sa.primary.id : null
            const surfacedIds = new Set(surfaced.map((t) => t.id))
            const rest = openList.filter((t) => !surfacedIds.has(t.id))
            const isExp = expandedProjects.has(project.id)
            return (
              <div key={project.id} className="picker-project">
                <div className="picker-project-name">
                  <span>{project.name}</span>
                  {formatProjectDue(project.dueDate) && (
                    <span className="pblock-project-due">{formatProjectDue(project.dueDate)}</span>
                  )}
                </div>
                {surfaced.map((t) => <TaskRow key={t.id} t={t} urgent={t.id === urgentId} />)}
                {isExp && rest.map((t) => <TaskRow key={t.id} t={t} urgent={t.id === urgentId} />)}
                {sa.count > 0 && (
                  <div className="pblock-project-expand" onClick={() => toggleProject(project.id)}>
                    <span className={`pblock-expand-chev ${isExp ? 'open' : ''}`}>›</span>
                    <span>{isExp ? 'Show less' : `+${sa.count} more`}</span>
                  </div>
                )}
              </div>
            )
          })}
          {openTasks.length > 0 && (
            <div className="picker-project">
              <div className="picker-project-name"><span>Open tasks</span></div>
              {openTasks.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────── the sheet ───────────────────────────────

function nextUpcoming(placed, nowDecimal) {
  if (!placed) return null
  return placed.filter((b) => b.hour > nowDecimal).sort((a, b) => a.hour - b.hour)[0] ?? null
}

// `api` is the shared useBlockItems instance, owned by App. Sharing one hook
// (rather than mounting a second copy here) is what keeps the counts on
// Scheduling and Live in step with what you tick off inside the sheet.
//
// `isToday` turns on the clock-aware parts (the step you should be on, steps
// you are behind on). A tomorrow block is pure plan and gets neither.
export function BlockView({ block, placed, api, onClose, isToday = false }) {
  const { pillars } = usePillars()
  const [expandedItem, setExpandedItem] = React.useState(null)
  const [draft, setDraft] = React.useState('')
  const inputRef = React.useRef(null)

  // Re-derive "now" each minute while the sheet is open, so the current step
  // moves down the schedule without a reopen.
  const [, setMinute] = React.useState(0)
  React.useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => setMinute((n) => n + 1), 60 * 1000)
    return () => clearInterval(id)
  }, [isToday])

  if (!block) return null

  const view = api.viewByBlock?.get(block.id) === 'schedule' ? 'schedule' : 'list'
  const isSchedule = view === 'schedule'

  const pillar = pillars.find((p) => p.id === block.pillar)
  const pillarName = pillar?.name ?? PILLAR_NAMES[block.pillar] ?? null
  const colorClass = block.pillar || block.type || 'open'

  const items = api.byBlock.get(block.id) ?? []
  // Done items sink so the top of the list is always what is left.
  const ordered = [...items].sort((a, b) => (a.done === b.done ? a.position - b.position : a.done ? 1 : -1))
  const doneCount = items.filter((i) => i.done).length

  const now = new Date()
  const nowDecimal = now.getHours() + now.getMinutes() / 60
  const next = nextUpcoming(placed, nowDecimal)
  const nudge = next
    ? `next ${next.type === 'meeting' ? 'event' : 'block'} in ${Math.max(1, Math.round((next.hour - nowDecimal) * 60))} min · ${next.title}`
    : null

  const submitDraft = async (e) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    // A step added in Schedule view has to hold time to appear on the clock.
    await api.addItem(block.id, { label: text, estMinutes: isSchedule ? DEFAULT_STEP_MINUTES : null })
    inputRef.current?.focus()
  }

  const endHour = block.hour + block.duration / 60

  return (
    <div className="pblock-overlay visible">
      <div className="pblock-top">
        <div>
          <div className="pblock-title">
            <span className={`pillar-dot ${colorClass}`}></span>
            {block.title}
          </div>
          <div className="pblock-sub" style={{ marginTop: 6 }}>
            {fmtTime(block.hour)} – {fmtTime(endHour)}
            {pillarName ? ` · ${pillarName}` : ''}
            {items.length > 0 ? ` · ${doneCount}/${items.length} done` : ''}
          </div>
          {nudge && <div className="pblock-next-nudge">{nudge}</div>}
        </div>
        <button className="pblock-close" onClick={onClose}>close ↓</button>
      </div>

      <div className="pblock-body">
        <div className="bview-toggle" role="tablist">
          {[['list', 'List'], ['schedule', 'Schedule']].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              className={`bview-tab ${view === id ? 'on' : ''}`}
              onClick={() => { setExpandedItem(null); api.setBlockView?.(block.id, id) }}
            >
              {label}
            </button>
          ))}
        </div>

        {isSchedule ? (
          <ScheduleView
            block={block}
            items={items}
            api={api}
            isToday={isToday}
            nowDecimal={nowDecimal}
            expandedItem={expandedItem}
            setExpandedItem={setExpandedItem}
          />
        ) : (
        <div className="bitem-list">
          {ordered.length === 0 && (
            <div className="bitem-empty">
              nothing assigned to this block yet — add it below, or pull from Course+
            </div>
          )}
          {ordered.map((it) => (
            <AssignedItem
              key={it.id}
              item={it}
              api={api}
              recurDef={it.recurringKey ? api.recurringByKey.get(it.recurringKey) : null}
              expanded={expandedItem === it.id}
              onExpand={() => setExpandedItem((cur) => (cur === it.id ? null : it.id))}
            />
          ))}
        </div>
        )}

        <form className="bitem-add" onSubmit={submitDraft}>
          <span className="bitem-add-plus">+</span>
          <input
            ref={inputRef}
            className="bitem-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={isSchedule ? `add a step · ${DEFAULT_STEP_MINUTES}m` : 'add work to this block'}
            enterKeyHint="done"
          />
          {draft.trim() && <button type="submit" className="bitem-chip go">add</button>}
        </form>

        <CoursePicker
          pillar={pillar}
          block={block}
          assignedTaskIds={api.assignedTaskIds}
          onAdd={(payload) =>
            api.addItem(block.id, { ...payload, estMinutes: isSchedule ? DEFAULT_STEP_MINUTES : null })
          }
        />

        <div style={{ height: isToday ? 220 : 60 }} />
      </div>

      {/* A pomodoro is for working the block, not planning it the night
          before — on a tomorrow block it only covered the list. */}
      {isToday && <FocusTimer />}
    </div>
  )
}

