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

import React from 'react'
import { IconCheck, IconPause, IconPlus, IconStopwatch } from '../icons.jsx'
import { usePillars } from '../lib/usePillars.js'
import { surfaceActions } from '../lib/surfaceActions.js'
import { liveElapsed, fmtDuration } from '../lib/useBlockItems.js'

const PILLAR_NAMES = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', sidegig: 'Side gig', open: 'Open Tasks' }
const EST_CHOICES = [5, 10, 15, 30, 45, 60, 90]

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

function AssignedItem({ item, api, recurDef, expanded, onExpand }) {
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
    <div className={`bitem ${item.done ? 'done' : ''}`}>
      <div className="bitem-row">
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
        {!hasClock && item.estMinutes != null && (
          <div className="bitem-est">{item.estMinutes}m</div>
        )}
        {item.source === 'course' && <div className="bitem-badge">course</div>}
        <button
          className={`bitem-timer-btn ${running ? 'running' : ''}`}
          onClick={onExpand}
          aria-label={running ? 'pause timing' : 'timing'}
        >
          {running ? <IconPause w={13} /> : <IconStopwatch w={15} />}
        </button>
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
            <span className="bitem-panel-label">estimate</span>
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
export function BlockView({ block, placed, api, onClose }) {
  const { pillars } = usePillars()
  const [expandedItem, setExpandedItem] = React.useState(null)
  const [draft, setDraft] = React.useState('')
  const inputRef = React.useRef(null)

  if (!block) return null

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
    await api.addItem(block.id, { label: text })
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

        <form className="bitem-add" onSubmit={submitDraft}>
          <span className="bitem-add-plus">+</span>
          <input
            ref={inputRef}
            className="bitem-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="add work to this block"
            enterKeyHint="done"
          />
          {draft.trim() && <button type="submit" className="bitem-chip go">add</button>}
        </form>

        <CoursePicker
          pillar={pillar}
          block={block}
          assignedTaskIds={api.assignedTaskIds}
          onAdd={(payload) => api.addItem(block.id, payload)}
        />

        <div style={{ height: 220 }} />
      </div>

      <FocusTimer />
    </div>
  )
}

