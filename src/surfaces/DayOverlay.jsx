// DayOverlay — slides in from left (yesterday) or right (tomorrow).
// Yesterday: reflection — habit backfill + Ink highlight + stats grid.
// Tomorrow: preview — week tile + triage queue / proposed schedule mode toggle.

import React from 'react'
import { IconCheck } from '../icons.jsx'
import { YESTERDAY, TOMORROW, WEEK } from '../data.js'
import { useDailyHighlight } from '../lib/useDailyHighlight.js'

const PILLAR_NAMES = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', open: 'Open Tasks' }

// "20W" = day-of-month + first letter of weekday (matches the prototype's
// empty-state datestamp design).
function datestampFor(date) {
  const d = date.getDate()
  const w = date.toLocaleDateString('en-US', { weekday: 'long' })
  return `${d}${w[0].toUpperCase()}`
}
function dayWordFor(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
}
function yesterdayDateObj() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}
function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

export function DayOverlay({ kind, onClose }) {
  if (!kind) return null

  // Yesterday: checkable habits (state lives here so closing doesn't reset)
  const [yHabits, setYHabits] = React.useState(() =>
    YESTERDAY.habits.reduce((acc, h) => { acc[h.id] = h.checked; return acc }, {})
  )
  const toggleYHabit = (id) => setYHabits((s) => ({ ...s, [id]: !s[id] }))

  // Daily highlight: live read/write to Ink's entries table.
  const ydate = React.useMemo(yesterdayDateObj, [])
  const ydateISO = isoDate(ydate)
  const { highlight: highlightRow, save: saveHighlight } = useDailyHighlight(ydateISO)
  const [highlightDraft, setHighlightDraft] = React.useState('')
  const [highlightEditing, setHighlightEditing] = React.useState(false)
  const commitHighlight = async () => {
    const text = highlightDraft.trim()
    if (!text) {
      setHighlightEditing(false)
      return
    }
    await saveHighlight(text)
    setHighlightDraft('')
    setHighlightEditing(false)
  }

  // Tomorrow: week overview collapsed by default + mode toggle
  const [weekExpanded, setWeekExpanded] = React.useState(false)
  const [tomorrowMode, setTomorrowMode] = React.useState('triage')
  const [tmrwExpanded, setTmrwExpanded] = React.useState(() => new Set())
  const toggleTmrwExpanded = (id) =>
    setTmrwExpanded((s) => {
      const out = new Set(s)
      out.has(id) ? out.delete(id) : out.add(id)
      return out
    })

  const yCheckedCount = Object.values(yHabits).filter(Boolean).length

  return (
    <div
      className={`day-overlay ${kind === 'yesterday' ? 'in-left' : 'in-right'} visible`}
      data-screen-label={kind === 'yesterday' ? '← Yesterday' : '→ Tomorrow'}
    >
      <button className="day-overlay-close" onClick={onClose}>close</button>
      <div className="day-overlay-title">{kind === 'yesterday' ? 'Yesterday' : 'Tomorrow'}</div>
      <div className="day-overlay-sub">
        {kind === 'yesterday' ? 'reflection' : 'planning'}
      </div>

      {kind === 'yesterday' ? (
        <>
          <div className="coming-soon-pill">first design pass</div>

          {/* Habit log — checkable for backfill */}
          <div className="morning-card-label" style={{ marginBottom: 8 }}>
            <span>habit log</span>
            <span style={{ color: 'var(--ink-secondary)' }}>
              {yCheckedCount} / {YESTERDAY.habits.length}
            </span>
          </div>
          <div className="morning-card" style={{ marginBottom: 16, padding: '4px 16px' }}>
            {YESTERDAY.habits.map((h) => (
              <div key={h.id} className={`tide-item ${yHabits[h.id] ? 'checked' : ''}`}>
                <button
                  className={`tide-check ${yHabits[h.id] ? 'checked' : ''}`}
                  onClick={() => toggleYHabit(h.id)}
                >
                  <IconCheck w={10} />
                </button>
                <div className="tide-label">{h.label}</div>
                <div className="tide-tag">{h.tag}</div>
              </div>
            ))}
          </div>

          {/* Ink daily highlight */}
          <div className="morning-card-label" style={{ marginBottom: 8 }}>
            <span>daily highlight</span>
            <span style={{ color: 'var(--ink-faint)' }}>ink</span>
          </div>
          {highlightRow && !highlightEditing ? (
            <div
              className="morning-card"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 17,
                color: 'var(--ink-primary)',
                fontStyle: 'italic',
                lineHeight: 1.45,
                marginBottom: 20,
              }}
            >
              "{highlightRow.raw_text}"
            </div>
          ) : highlightEditing ? (
            <div className="highlight-empty" style={{ marginBottom: 20 }}>
              <div className="highlight-empty-head">
                <span className="highlight-empty-datestamp">{datestampFor(ydate)}</span>
                <span className="highlight-empty-day">{dayWordFor(ydate)}</span>
              </div>
              <textarea
                className="highlight-input"
                autoFocus
                value={highlightDraft}
                onChange={(e) => setHighlightDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    commitHighlight()
                  }
                  if (e.key === 'Escape') {
                    setHighlightDraft('')
                    setHighlightEditing(false)
                  }
                }}
                onBlur={commitHighlight}
                placeholder="What happened yesterday?"
              />
            </div>
          ) : (
            <button
              className="highlight-empty highlight-empty-button"
              style={{ marginBottom: 20 }}
              onClick={() => setHighlightEditing(true)}
            >
              <div className="highlight-empty-head">
                <span className="highlight-empty-datestamp">{datestampFor(ydate)}</span>
                <span className="highlight-empty-day">{dayWordFor(ydate)}</span>
              </div>
              <div className="highlight-empty-prompt">What happened yesterday?</div>
            </button>
          )}

          {/* Stats */}
          <div className="yesterday-stats" style={{ marginBottom: 8 }}>
            <div className="stat-card">
              <div className="stat-card-label">completed</div>
              <div className="stat-card-value">{YESTERDAY.completed}</div>
              <div className="stat-card-detail">of 13 committed</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">pushed</div>
              <div className="stat-card-value">{YESTERDAY.pushed}</div>
              <div className="stat-card-detail">forward to today</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">readiness</div>
              <div className="stat-card-value">{YESTERDAY.oura.score}</div>
              <div className="stat-card-detail">slept 6h 48m</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">focus</div>
              <div className="stat-card-value">2h 50m</div>
              <div className="stat-card-detail">5 pomodoros</div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="coming-soon-pill">first design pass</div>

          {/* Week overview — collapsible */}
          <button
            className={`week-tile ${weekExpanded ? 'expanded' : ''}`}
            onClick={() => setWeekExpanded((v) => !v)}
          >
            <div className="week-tile-header">
              <span>this week</span>
              <span className="week-tile-chev">{weekExpanded ? '▴' : '▾'}</span>
            </div>
            <div className="week-tile-row">
              {WEEK.map((d, i) => (
                <div
                  key={i}
                  className={`week-cell ${d.isToday ? 'today' : ''} ${d.isTomorrow ? 'tomorrow' : ''} ${d.isPast ? 'past' : ''}`}
                >
                  <div className="week-cell-day">{d.day}</div>
                  <div className="week-cell-date">{d.date}</div>
                  <div
                    className="week-cell-bar"
                    style={{ height: Math.min(d.focusH * 8, 32) + 'px' }}
                  ></div>
                </div>
              ))}
            </div>
            {weekExpanded && (
              <div className="week-tile-detail">
                {WEEK.map((d, i) => (
                  <div
                    key={i}
                    className={`week-detail-row ${d.isTomorrow ? 'highlight' : ''} ${d.isToday ? 'current' : ''}`}
                  >
                    <span className="week-detail-name">{d.label}</span>
                    <span className="week-detail-meta">
                      {d.meeting} meetings · {d.focusH}h focus · {d.blocks} blocks
                    </span>
                  </div>
                ))}
              </div>
            )}
          </button>

          {/* Mode toggle: triage vs schedule */}
          <div className="tmrw-mode-toggle">
            <button
              className={tomorrowMode === 'triage' ? 'active' : ''}
              onClick={() => setTomorrowMode('triage')}
            >
              Triage
            </button>
            <button
              className={tomorrowMode === 'schedule' ? 'active' : ''}
              onClick={() => setTomorrowMode('schedule')}
            >
              Schedule
            </button>
          </div>

          {tomorrowMode === 'triage' ? (
            <>
              <div className="morning-card-label" style={{ marginBottom: 8 }}>
                <span>queued for triage</span>
                <span style={{ color: 'var(--ink-faint)' }}>tap when ready</span>
              </div>
              {TOMORROW.triageQueue.map((q, i) => {
                const isOpen = tmrwExpanded.has(q.pillar)
                return (
                  <div key={i} className={`pillar ${isOpen ? '' : 'collapsed'} tmrw-pillar`}>
                    <div
                      className="pillar-header"
                      onClick={() => toggleTmrwExpanded(q.pillar)}
                    >
                      <div className="pillar-name">
                        <span className={`pillar-dot ${q.pillar}`}></span>
                        <span className="pillar-title">{PILLAR_NAMES[q.pillar] || q.pillar}</span>
                      </div>
                      <div className="pillar-meta">
                        <div className="pillar-count">{q.count} queued</div>
                        <div className="pillar-chevron">▾</div>
                      </div>
                    </div>
                    <div className="pillar-body" style={{ display: isOpen ? 'block' : 'none' }}>
                      <div className="tmrw-pillar-sample">
                        <span className="tmrw-pillar-sample-bullet">·</span>
                        <span className="tmrw-pillar-sample-label">{q.sample}</span>
                      </div>
                      {q.count > 1 && (
                        <div className="tmrw-pillar-rest">
                          + {q.count - 1} more · triage tomorrow morning
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="tmrw-hint">
                triage opens tomorrow morning. these are tonight's drafts.
              </div>
            </>
          ) : (
            <>
              <div className="morning-card-label" style={{ marginBottom: 8 }}>
                <span>hard-line events</span>
                <span style={{ color: 'var(--ink-faint)' }}>from gcal</span>
              </div>
              {TOMORROW.events.map((e, i) => (
                <div key={i} className="tmrw-list-item">
                  <div className="tmrw-list-item-time">{e.time}</div>
                  <div className="tmrw-list-item-title">{e.title}</div>
                </div>
              ))}
              <div className="morning-card-label" style={{ marginTop: 24, marginBottom: 8 }}>
                <span>proposed schedule</span>
                <span style={{ color: 'var(--ink-faint)' }}>draggable tomorrow</span>
              </div>
              <div>
                {TOMORROW.proposed.map((p, i) => (
                  <div key={i} className={`block ${p.pillar}`} style={{ marginBottom: 8 }}>
                    <div className="block-title">{p.label}</div>
                    <div className="block-detail">{p.detail}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
