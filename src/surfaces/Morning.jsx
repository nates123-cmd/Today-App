// Morning — page one. Passive grounding.

import React from 'react'
import { IconCheck, IconRegen, groundingIcons } from '../icons.jsx'
import { TIDE_BACKFILL, GROUNDING } from '../data.js'
import { useOura } from '../lib/useOura.js'
import { useHabits } from '../lib/useHabits.js'

const OURA_FALLBACK = {
  readiness: '—',
  delta: null,
  syncedAtLabel: 'no data',
  rows: [
    { label: 'sleep', value: '—', delta: null },
    { label: 'hrv', value: '—', delta: null },
    { label: 'rhr', value: '—', delta: null },
    { label: 'temp', value: '—', delta: null },
  ],
}

export function Morning({ onOpenYesterday }) {
  const { data: ouraLive, loading: ouraLoading } = useOura()
  const { habits, toggle: toggleHabit } = useHabits()
  const OURA = ouraLive ?? OURA_FALLBACK
  const [backfill, setBackfill] = React.useState(TIDE_BACKFILL);
  const [ouraSyncing, setOuraSyncing] = React.useState(false);
  const ouraSyncedAt = ouraLoading ? 'syncing…' : OURA.syncedAtLabel;

  return (
    <div className="page" data-screen-label="01 Morning">
      <div className="morning">
        <div className="morning-header">
          <div className="morning-title">Good morning, Nate</div>
          <div className="morning-time">page 1 of 4</div>
        </div>

        {/* Oura — clickable, links to Tide */}
        <div className="morning-card clickable"
             role="link" tabIndex={0}
             title="Open Tide for full stats"
             onClick={() => console.log('→ Tide')}>
          <div className="morning-card-label">
            <span>Oura · tide</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--ink-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                {ouraSyncing ? 'syncing…' : ouraSyncedAt}
              </span>
              <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {OURA.delta} <span style={{ fontSize: 10, opacity: 0.7 }}>↗</span>
              </span>
              <button className={`regen-btn ${ouraSyncing ? 'spinning' : ''}`}
                      title="Re-sync Oura ring"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ouraSyncing) return;
                        // Spin only — a real re-sync would hit the oura-proxy
                        // edge fn; deferred until that contract is wired.
                        setOuraSyncing(true);
                        setTimeout(() => setOuraSyncing(false), 900);
                      }}>
                <IconRegen />
              </button>
            </span>
          </div>
          <div className="oura">
            <div className="oura-primary">
              <div className="oura-primary-value">{OURA.readiness}</div>
              <div className="oura-primary-label">readiness</div>
            </div>
            <div className="oura-secondary">
              {OURA.rows.map(row => (
                <div className="oura-row" key={row.label}>
                  <span className="oura-row-label">{row.label}</span>
                  <span className="oura-row-value">
                    {row.value}
                    {row.delta && (
                      <span className={`delta ${row.dir === 'down' ? 'down' : ''}`}>{row.delta}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tide checklist */}
        <div className="morning-card">
          <div className="morning-card-label">
            <span>tide checklist</span>
            <span>{habits.filter(h => h.checked).length} / {habits.length}</span>
          </div>
          {habits.map(h => (
            <div key={h.id} className={`tide-item ${h.checked ? 'checked' : ''}`}>
              <button className={`tide-check ${h.checked ? 'checked' : ''}`}
                      onClick={() => toggleHabit(h.id)}>
                <IconCheck />
              </button>
              <div className="tide-label">{h.label}</div>
              <div className="tide-tag">{h.tag}</div>
            </div>
          ))}

          {backfill.length > 0 && (
            <button className="backfill-note"
                    onClick={() => onOpenYesterday && onOpenYesterday()}>
              <span className="backfill-note-arrow">←</span>
              <span>Yesterday habits and highlight unfilled</span>
            </button>
          )}
        </div>

        {/* Morning grounding */}
        <div className="morning-card">
          <div className="morning-card-label"><span>morning grounding</span></div>
          <div className="grounding-grid">
            {GROUNDING.map((g, i) => {
              const I = groundingIcons[g.name];
              const disabled = !g.action;
              return (
                <button
                  key={i}
                  className="grounding-tile"
                  disabled={disabled}
                  onClick={() => { if (g.action) window.location.href = g.action; }}
                  title={disabled ? 'Not wired up yet' : g.action}
                >
                  {I && <I className="grounding-tile-icon" />}
                  <div>
                    <div className="grounding-tile-name">{g.name}</div>
                    <div className="grounding-tile-src">{g.src}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

