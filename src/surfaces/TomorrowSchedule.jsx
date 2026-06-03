// Tomorrow → Schedule mode. Renders tomorrow's hard-line events (from
// placed_blocks, ical) and the auto-generated proposed deep-work blocks
// (ghosted, draggable tomorrow). Generate/Regenerate recomputes; Accept all
// commits remaining proposals. This is the day-before PREVIEW pass — neutral
// readiness, only already-ingested events (decisions doc lifecycle).

import React from 'react'
import { useProposedSchedule } from '../lib/useProposedSchedule.js'

const PILLAR_NAMES = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', sidegig: 'Side gig', open: 'Open' }

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// decimal hour -> "9:30a"
function fmtTime(h) {
  const hr = Math.floor(h)
  const m = String(Math.round((h - hr) * 60)).padStart(2, '0')
  const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr
  return `${hr12}:${m}${hr < 12 ? 'a' : 'p'}`
}

function fmtDur(mins) {
  if (mins < 60) return `${mins}m`
  const h = mins / 60
  return h === Math.floor(h) ? `${h}h` : `${h.toFixed(1)}h`
}

export function TomorrowSchedule() {
  const dateISO = React.useMemo(() => tomorrowISO(), [])
  const { obstacles, proposed, generate, regenerate, acceptAll, acceptOne, loading } =
    useProposedSchedule(dateISO)

  const meetings = obstacles
    .filter((b) => b.type === 'meeting')
    .slice()
    .sort((a, b) => a.hour - b.hour)
  const sortedProposed = proposed.slice().sort((a, b) => a.hour - b.hour)

  return (
    <>
      <div className="morning-card-label" style={{ marginBottom: 8 }}>
        <span>hard-line events</span>
        <span style={{ color: 'var(--ink-faint)' }}>from gcal</span>
      </div>
      {meetings.length ? (
        meetings.map((e) => (
          <div key={e.id} className="tmrw-list-item">
            <div className="tmrw-list-item-time">{fmtTime(e.hour)}</div>
            <div className="tmrw-list-item-title">{e.title}</div>
          </div>
        ))
      ) : (
        <div className="tmrw-hint">
          no events ingested yet — tomorrow's calendar fills in overnight.
        </div>
      )}

      <div className="morning-card-label" style={{ marginTop: 24, marginBottom: 8 }}>
        <span>proposed schedule</span>
        <span style={{ color: 'var(--ink-faint)' }}>draggable tomorrow</span>
      </div>

      <div className="tmrw-sched-actions" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="tmrw-mode-toggle-btn"
          disabled={loading}
          onClick={() => (sortedProposed.length ? regenerate() : generate())}
          style={btnStyle}
        >
          {sortedProposed.length ? 'Regenerate' : 'Generate draft'}
        </button>
        {sortedProposed.length > 0 && (
          <button className="tmrw-mode-toggle-btn" onClick={acceptAll} style={btnStyle}>
            Accept all
          </button>
        )}
      </div>

      {sortedProposed.length === 0 ? (
        <div className="tmrw-hint">
          {loading ? 'loading backlog…' : 'tap Generate to draft tomorrow’s deep-work blocks.'}
        </div>
      ) : (
        <div>
          {sortedProposed.map((p) => (
            <button
              key={p.id}
              className={`block ${p.pillar} proposed`}
              onClick={() => acceptOne(p.id)}
              title="tap to accept this block"
              style={{
                display: 'block',
                marginBottom: 8,
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius, 8px)',
                border: '1px dashed var(--divider-strong)',
                borderLeft: `3px solid var(--pillar-${p.pillar}, var(--ink-secondary))`,
                background: `var(--pillar-${p.pillar}-soft, transparent)`,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span style={{ color: 'var(--ink-primary)', fontWeight: 600, fontSize: 14 }}>
                  {p.title}
                </span>
                <span
                  style={{
                    color: 'var(--ink-faint)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    flexShrink: 0,
                  }}
                >
                  proposed
                </span>
              </div>
              <div style={{ color: 'var(--ink-secondary)', fontSize: 12, marginTop: 3 }}>
                {PILLAR_NAMES[p.pillar] || p.pillar} · {fmtTime(p.hour)}–
                {fmtTime(p.hour + p.duration / 60)} · {fmtDur(p.duration)}
              </div>
            </button>
          ))}
          <div className="tmrw-hint">
            ghosted = proposed. tap one to accept it, or Accept all. you’ll review &amp; drag these tomorrow morning.
          </div>
        </div>
      )}
    </>
  )
}

const btnStyle = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 'var(--radius, 8px)',
  border: '1px solid var(--divider)',
  background: 'var(--surface, transparent)',
  color: 'var(--ink-primary)',
  fontSize: 13,
  cursor: 'pointer',
}
