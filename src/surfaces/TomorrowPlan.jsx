// Tomorrow → Plan. The next-day briefing, in the order you actually think:
//
//   01  agenda      — the raw hard-line day (ical meetings + placed routines)
//   02  course+     — what Course+ says matters: overdue / due / started / next
//   03  suggested   — generated deep-work blocks, each confirm-or-deny
//   ->  fill in time — the same drag grid as today, pointed at tomorrow
//
// Stages 1-2 are read-only orientation; nothing is written until stage 3. The
// grid is `Scheduling` in embedded mode sharing this surface's placed/setPlaced,
// so a block dragged here writes straight to tomorrow's `placed_blocks` row.

import React from 'react'
import { Scheduling } from './Scheduling.jsx'
import { useProposedSchedule } from '../lib/useProposedSchedule.js'
import { buildBriefing, pillarTimeBank } from '../lib/tomorrowBriefing.js'
import { freeMinutes } from '../lib/proposeSchedule.js'
import { isReingested } from '../lib/dismissedEvents.js'
import { useReminders, dueLabelFor } from '../lib/useReminders.js'
import { addDays, isoDate } from '../lib/day.js'

const PILLAR_NAMES = {
  arrow: 'Arrow',
  sunny: 'Sunny',
  life: 'Life',
  sidegig: 'Side gig',
  open: 'Open',
}
const WINDOW = { first: 8, last: 18 }



// decimal hour -> "9:30a"
function fmtTime(h) {
  const hr = Math.floor(h)
  const m = String(Math.round((h - hr) * 60)).padStart(2, '0')
  const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr
  return `${hr12}:${m}${hr < 12 ? 'a' : 'p'}`
}

// "14:30" -> "2:30p". The stored value is wall clock as written on the phone,
// so this is pure formatting — no timezone conversion, deliberately.
// Returns '' for midnight: Apple stores an ALL-DAY reminder as 00:00, and
// rendering those as "12:00a" would put a fake time on most of the list.
function fmtClock(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '')
  if (!m) return hhmm || ''
  if (m[1] === '00' && m[2] === '00') return ''
  const h = parseInt(m[1], 10)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]}${h < 12 ? 'a' : 'p'}`
}

function fmtDur(mins) {
  if (mins <= 0) return '0m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// "due that day" / "2d overdue" / "in 3d"
function dueLabel(days) {
  if (days == null) return null
  if (days === 0) return 'due'
  if (days < 0) return `${-days}d overdue`
  return `in ${days}d`
}

function SectionLabel({ n, children, right }) {
  return (
    <div className="tmrw-step-label">
      <span className="tmrw-step-n">{n}</span>
      <span className="tmrw-step-title">{children}</span>
      {right ? <span className="tmrw-step-right">{right}</span> : null}
    </div>
  )
}

export function TomorrowPlan() {
  const date = React.useMemo(() => addDays(1), [])
  const dateISO = React.useMemo(() => isoDate(date), [date])
  const {
    pillars,
    placed,
    setPlaced,
    obstacles,
    proposed,
    denied,
    generate,
    regenerate,
    acceptAll,
    acceptOne,
    denyOne,
    clearDenied,
    loading,
    dismiss,
    restoreDismissed,
    dismissedCount,
  } = useProposedSchedule(dateISO)

  // Reminders are their own strip, not Course+ tasks — errands live beside the
  // plan rather than competing with the Now lane for deep-work slots.
  const { reminders, complete: completeReminder } = useReminders(dateISO)

  const [view, setView] = React.useState('brief') // 'brief' | 'grid'

  // Stage 1 — the raw day. Meetings and already-placed routines are the fixed
  // shape of tomorrow; everything else gets fitted around them.
  // `obstacles` already excludes dismissed events (the hook filters them), so
  // this list is what's actually still on the day.
  const agenda = React.useMemo(
    () =>
      obstacles
        .filter((b) => b.type === 'meeting' || b.type === 'routine')
        .slice()
        .sort((a, b) => a.hour - b.hour),
    [obstacles]
  )

  // Removing an event from the day. An ical row is NOT ours to delete — the
  // Shortcut re-ingests the whole day on its next run and would bring it
  // straight back — so those are dismissed (hidden durably) instead. Blocks
  // Today owns (routines, ad-hoc) get a real delete.
  const removeFromDay = React.useCallback(
    (block) => {
      if (isReingested(block)) dismiss(block)
      else setPlaced((prev) => prev.filter((b) => b.id !== block.id))
    },
    [dismiss, setPlaced]
  )



  const free = React.useMemo(() => freeMinutes(WINDOW, obstacles), [obstacles])
  const bookedMins = React.useMemo(
    () => agenda.reduce((sum, b) => sum + (b.duration || 0), 0),
    [agenda]
  )

  // Stage 2 — Course+ / reminders for that day.
  const briefing = React.useMemo(() => buildBriefing(pillars, dateISO), [pillars, dateISO])
  const timeBank = React.useMemo(() => pillarTimeBank(pillars), [pillars])

  const sortedProposed = React.useMemo(
    () => proposed.slice().sort((a, b) => a.hour - b.hour),
    [proposed]
  )
  const committed = React.useMemo(
    () => placed.filter((b) => b.source === 'today_user').length,
    [placed]
  )

  const dayName = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  if (view === 'grid') {
    return (
      <>
        <div className="tmrw-gridhead">
          <button className="tmrw-back" onClick={() => setView('brief')}>
            ← briefing
          </button>
          <span className="tmrw-gridhead-date">{dayName}</span>
        </div>
        <Scheduling
          embedded
          placed={placed}
          setPlaced={setPlaced}
          remainingMinsByPillar={timeBank}
          title="Tomorrow"
          subtitle="drag from the dock · tap to expand · pull bottom edge to resize"
        />
      </>
    )
  }

  return (
    <>
      {/* ─── day header ─── */}
      <div className="tmrw-daycard">
        <div className="tmrw-daycard-date">{dayName}</div>
        <div className="tmrw-daycard-stats">
          <span>
            <b>{agenda.length}</b> fixed
          </span>
          <span>
            <b>{fmtDur(bookedMins)}</b> booked
          </span>
          <span>
            <b>{fmtDur(free)}</b> open
          </span>
        </div>
      </div>

      {/* ─── 01 agenda ─── */}
      <SectionLabel n="01" right="from gcal">
        agenda
      </SectionLabel>
      {agenda.length ? (
        agenda.map((e) => (
          <div key={e.id} className={`tmrw-list-item ${e.type}`}>
            <div className="tmrw-list-item-time">{fmtTime(e.hour)}</div>
            <div className="tmrw-list-item-title">{e.title}</div>
            <div className="tmrw-list-item-dur">{fmtDur(e.duration)}</div>
            <button
              className="tmrw-list-item-del"
              onClick={() => removeFromDay(e)}
              title={
                isReingested(e)
                  ? 'not happening — hide it and free the time'
                  : 'remove from tomorrow'
              }
              aria-label={`remove ${e.title}`}
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <div className="tmrw-hint">
          {loading
            ? 'loading…'
            : dismissedCount
              ? 'every event hidden — nothing fixed on the day.'
              : "nothing on the calendar yet — tomorrow's events sync in overnight."}
        </div>
      )}
      {dismissedCount > 0 && (
        <button className="tmrw-undeny" onClick={restoreDismissed}>
          {dismissedCount} hidden · restore
        </button>
      )}

      {/* ─── 02 course+ ─── */}
      <SectionLabel n="02" right={briefing.total ? `${briefing.total} open` : null}>
        from course+
      </SectionLabel>
      {briefing.groups.length ? (
        briefing.groups.map((g) => (
          <div key={g.key} className="tmrw-brief-group">
            <div className={`tmrw-brief-head ${g.key}`}>
              <span>{g.label}</span>
              <span className="tmrw-brief-count">{g.items.length}</span>
            </div>
            {g.items.map((t) => (
              <div key={t.id} className="tmrw-brief-row">
                <span className={`pillar-dot ${t.pillar}`}></span>
                <div className="tmrw-brief-body">
                  <div className="tmrw-brief-label">{t.label}</div>
                  <div className="tmrw-brief-meta">
                    {t.projectName || PILLAR_NAMES[t.pillar] || t.pillar}
                    {dueLabel(t.days) ? ` · ${dueLabel(t.days)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      ) : (
        <div className="tmrw-hint">
          {loading ? 'loading backlog…' : 'nothing due or in flight — a clear day.'}
        </div>
      )}

      {/* ─── reminders ─── */}
      {reminders.length > 0 && (
        <>
          <SectionLabel n="—" right="overdue · today · tomorrow">
            errands
          </SectionLabel>
          {reminders.map((r) => (
            <div key={r.id} className="tmrw-rem-row">
              <button
                className="tmrw-rem-check"
                onClick={() => completeReminder(r.id)}
                title="mark done"
                aria-label={`complete ${r.title}`}
              />
              <div className="tmrw-rem-body">
                <div className="tmrw-rem-title">{r.title}</div>
                <div className="tmrw-rem-meta">
                  {dueLabelFor(r.dueDate) ?? r.list ?? 'reminders'}
                  {fmtClock(r.dueTime) ? ` · ${fmtClock(r.dueTime)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ─── 03 suggested slotting ─── */}
      <SectionLabel n="03" right={committed ? `${committed} committed` : 'confirm or deny'}>
        suggested
      </SectionLabel>

      <div className="tmrw-sched-actions">
        <button
          className="tmrw-btn"
          disabled={loading}
          onClick={() => (sortedProposed.length ? regenerate() : generate())}
        >
          {sortedProposed.length ? 'Regenerate' : 'Suggest a fill'}
        </button>
        {sortedProposed.length > 0 && (
          <button className="tmrw-btn primary" onClick={acceptAll}>
            Confirm all
          </button>
        )}
      </div>

      {sortedProposed.length === 0 ? (
        <div className="tmrw-hint">
          {loading
            ? 'loading backlog…'
            : free < 45
              ? 'no room left for a deep block — the day is already full.'
              : 'tap Suggest a fill to draft deep-work blocks around the agenda above.'}
        </div>
      ) : (
        <div>
          {sortedProposed.map((p) => (
            <div key={p.id} className={`tmrw-prop ${p.pillar}`}>
              <div className="tmrw-prop-body">
                <div className="tmrw-prop-title">{p.title}</div>
                <div className="tmrw-prop-meta">
                  {PILLAR_NAMES[p.pillar] || p.pillar} · {fmtTime(p.hour)}–
                  {fmtTime(p.hour + p.duration / 60)} · {fmtDur(p.duration)}
                </div>
              </div>
              <div className="tmrw-prop-actions">
                <button
                  className="tmrw-prop-btn deny"
                  onClick={() => denyOne(p.id)}
                  title="not tomorrow — won't be suggested again"
                  aria-label="deny"
                >
                  ✕
                </button>
                <button
                  className="tmrw-prop-btn confirm"
                  onClick={() => acceptOne(p.id)}
                  title="confirm this block"
                  aria-label="confirm"
                >
                  ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {denied.size > 0 && (
        <button className="tmrw-undeny" onClick={clearDenied}>
          {denied.size} denied · allow again
        </button>
      )}

      <button className="tmrw-fill-cta" onClick={() => setView('grid')}>
        Fill in time by hand →
      </button>
      <div className="tmrw-hint">
        confirmed blocks land on tomorrow's schedule. drag to adjust them there.
      </div>
    </>
  )
}
