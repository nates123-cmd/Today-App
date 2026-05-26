// Live — page four. Workday home base.
// Hero treatment for the active block, compact past/future blocks
// derived from placed_blocks (today's schedule).

import React from 'react'

// Routines that deep-link into another suite app when tapped from Live.
// Keyed by source_id (the routine slug from Scheduling's dock).
const ROUTINE_LINKS = {
  'r-gym': 'https://nates123-cmd.github.io/Tide-App/?tab=train',
}

function routineLink(block) {
  if (block?.type !== 'routine') return null;
  return ROUTINE_LINKS[block.sourceId] ?? null;
}

function pillarLabel(id) {
  if (!id) return null;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function fmtTime(h) {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  const mm = String(m).padStart(2, '0');
  const hr12 = hr > 12 ? hr - 12 : (hr === 0 ? 12 : hr);
  const ap = hr < 12 ? 'a' : 'p';
  return `${hr12}:${mm}${ap}`;
}

function ActiveBlockCard({ block, nowDecimal, onOpenBlock }) {
  const endDecimal = block.hour + block.duration / 60;
  const minsLeft = Math.max(0, Math.round((endDecimal - nowDecimal) * 60));
  const colorClass = block.pillar || block.type || 'open';
  const label = pillarLabel(block.pillar) ||
    (block.type === 'meeting' ? 'Meeting'
      : block.type === 'routine' ? 'Routine'
      : 'Block');
  const link = routineLink(block);
  const clickable = link || block.pillar;
  const onCardClick = () => {
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
    else if (block.pillar) onOpenBlock(block);
  };

  return (
    <div className={`active-card ${colorClass}`}
         role={clickable ? 'button' : undefined}
         tabIndex={clickable ? 0 : undefined}
         style={{ cursor: clickable ? 'pointer' : 'default' }}
         onClick={clickable ? onCardClick : undefined}
         onKeyDown={clickable ? (e) => {
           if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(); }
         } : undefined}>
      <div className="active-card-header">
        <div className="active-card-pillar">
          <span className={`pillar-dot ${colorClass}`}></span>
          <span className="active-card-pillar-name">{label}</span>
        </div>
        <div className="active-card-now">
          <span className="active-card-pulse"></span>
          {minsLeft} min left
        </div>
      </div>

      <div className="active-card-title">{block.title}</div>

      <div className="active-card-footer">
        <span>{fmtTime(block.hour)} – {fmtTime(endDecimal)}</span>
        {clickable && (
          <span className="active-card-open" aria-hidden="true">
            {link ? 'open Tide ↗' : 'focus ↗'}
          </span>
        )}
      </div>
    </div>
  );
}

function CompactBlock({ block, isPast, onOpenBlock }) {
  const link = routineLink(block);
  const cls = `compact-block ${block.type} ${isPast ? 'past' : ''}`;
  // Derive meta from live hour/duration so resize + drag in Scheduling reflect
  // here. Fall back to a saved `detail` string only if neither is set.
  const fmt = (h) => {
    const hr = Math.floor(h);
    const m = Math.round((h - hr) * 60);
    const hr12 = hr > 12 ? hr - 12 : (hr === 0 ? 12 : hr);
    const ap = hr < 12 ? 'a' : 'p';
    return m === 0 ? `${hr12}:00${ap}` : `${hr12}:${String(m).padStart(2,'0')}${ap}`;
  };
  let meta = block.detail;
  if (block.hour != null && block.duration != null) {
    const end = block.hour + block.duration / 60;
    const range = `${fmt(block.hour)} – ${fmt(end)}`;
    if (block.type === 'meeting') meta = range;
    else if (block.type === 'routine') meta = `${range} · routine`;
    else if (block.pillar) meta = `${range} · deep work`;
    else meta = range;
  }
  return (
    <div className={cls}
         style={{ cursor: (block.pillar || link) ? 'pointer' : 'default' }}
         onClick={() => {
           if (link) window.open(link, '_blank', 'noopener,noreferrer');
           else if (block.pillar) onOpenBlock(block);
         }}>
      <div className="compact-block-stripe"></div>
      <div className="compact-block-content">
        <div className="compact-block-title">{block.title}</div>
        <div className="compact-block-meta">{meta}</div>
      </div>
    </div>
  );
}

export function Live({ placed: placedProp, onOpenBlock }) {
  const PLACED = placedProp ?? [];

  // Real wall-clock time, re-derived each minute so the past / active /
  // upcoming split stays correct without remounting the surface.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60 * 1000);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const nowDecimal = nowHour + nowMinute / 60;
  const dateStr = now.toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric' });
  const hr12 = nowHour > 12 ? nowHour - 12 : (nowHour === 0 ? 12 : nowHour);
  const ap = nowHour < 12 ? 'a' : 'p';
  const nowTimeStr = `${hr12}:${String(nowMinute).padStart(2, '0')}${ap}`;

  // Group blocks into past / active / upcoming
  const activeBlock = PLACED.find(b =>
    nowDecimal >= b.hour && nowDecimal < b.hour + b.duration / 60
  );

  const past = PLACED
    .filter(b => b.hour + b.duration / 60 <= nowDecimal)
    .sort((a, b) => a.hour - b.hour);
  const upcoming = PLACED
    .filter(b => b.hour >= nowDecimal && b !== activeBlock)
    .sort((a, b) => a.hour - b.hour);

  return (
    <div className="page" data-screen-label="04 Live">
      <div className="live">
        <div className="live-header">
          <div className="live-title">Today</div>
          <div className="live-now">{nowTimeStr}</div>
        </div>
        <div className="live-subtitle">{dateStr}</div>

        {/* Recent past — compact */}
        {past.length > 0 && (
          <div className="past-strip">
            <div className="past-label">earlier</div>
            <div className="past-blocks">
              {past.slice(-2).map(b => (
                <CompactBlock key={b.id} block={b} isPast={true} onOpenBlock={onOpenBlock} />
              ))}
            </div>
          </div>
        )}

        {/* Now divider */}
        <div className="now-divider">
          <span className="now-divider-label">NOW · {nowTimeStr}</span>
          <span className="now-divider-line"></span>
        </div>

        {/* Active block — hero card */}
        {activeBlock ? (
          <ActiveBlockCard block={activeBlock} nowDecimal={nowDecimal} onOpenBlock={onOpenBlock} />
        ) : (
          <div className="active-card empty">
            <div className="active-card-pillar">
              <span className="pillar-dot open"></span>
              <span className="active-card-pillar-name">open block</span>
            </div>
            <div className="active-card-title">No block scheduled right now</div>
            <div className="active-card-empty-hint">drop something in from open tasks or wait for the next block</div>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="upcoming-strip">
            <div className="past-label">upcoming</div>
            {upcoming.map(b => (
              <div className="upcoming-row" key={b.id}>
                <div className="upcoming-time">{fmtTime(b.hour)}</div>
                <CompactBlock block={b} onOpenBlock={onOpenBlock} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

