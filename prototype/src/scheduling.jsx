// scheduling.jsx — Page three. Visual calendar with proportional block heights.
// - Hour rows are gridlines (continuous time axis, blocks span their actual duration)
// - Drag a block by its body to move it on the clock
// - Drag the bottom-edge handle of a block to resize it (15-min steps)
// - Tap (no drag) cycles 30 → 45 → 60 → 30
// - Click an empty hour line to insert an ad-hoc block

const HOUR_PX = 38; // visual height per hour
const STEP_MIN = 15; // smallest schedulable increment
const STEP_PX = HOUR_PX * (STEP_MIN / 60);
const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const TOTAL_HOURS = LAST_HOUR - FIRST_HOUR + 1;

function Scheduling({ placed: placedProp, setPlaced: setPlacedProp, remainingMinsByPillar }) {
  const { CAL_EVENTS, PILLARS, ROUTINES } = window.TODAY_DATA;

  const hours = React.useMemo(() => {
    const arr = [];for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) arr.push(h);return arr;
  }, []);

  const initialPlaced = React.useMemo(() => {
    const placed = [];
    CAL_EVENTS.forEach((e) => {
      const h = parseInt(e.start.split(':')[0], 10);
      const m = parseInt(e.start.split(':')[1], 10) || 0;
      const [eh, em] = e.end.split(':').map((n) => parseInt(n, 10));
      const dur = eh * 60 + (em || 0) - (h * 60 + m);
      placed.push({
        id: e.id, type: 'meeting', hour: h + m / 60, duration: dur,
        title: e.title, pillar: null
      });
    });
    ROUTINES.filter((r) => r.autoPlaced).forEach((r) => {
      placed.push({
        id: r.id, type: 'routine', hour: r.hour, duration: r.duration,
        title: r.name, pillar: null
      });
    });
    return placed;
  }, []);

  // If App provided shared schedule state, use it. Otherwise fall back to
  // local state (so this component still works standalone).
  const [localPlaced, setLocalPlaced] = React.useState(initialPlaced);
  const placed    = placedProp    ?? localPlaced;
  const setPlaced = setPlacedProp ?? setLocalPlaced;
  const [drag, setDrag] = React.useState(null);
  const [resize, setResize] = React.useState(null);
  const [adHocHour, setAdHocHour] = React.useState(null);
  const [adHocText, setAdHocText] = React.useState('');
  const dragStartRef = React.useRef(null);
  const calRef = React.useRef(null);

  // Listen for prep-block additions from Triage's calendar long-press
  React.useEffect(() => {
    const onPrepAdded = (e) => {
      const d = e.detail;
      setPlaced((prev) => {
        const filtered = prev.filter((b) => b.id !== d.id);
        return [...filtered, {
          id: d.id, type: 'prep', hour: d.hour, duration: d.duration,
          title: `Prep · ${d.title}`,
          pillar: d.pillar || null
        }];
      });
    };
    const onPrepRemoved = (e) => {
      setPlaced((prev) => prev.filter((b) => b.id !== e.detail.id));
    };
    window.addEventListener('today:prep-added', onPrepAdded);
    window.addEventListener('today:prep-removed', onPrepRemoved);
    return () => {
      window.removeEventListener('today:prep-added', onPrepAdded);
      window.removeEventListener('today:prep-removed', onPrepRemoved);
    };
  }, []);

  // Time bank per pillar. Defaults are baseline; the live rollup from
  // Triage (mins + deep/admin counts) overrides them so the dock reflects
  // actual remaining work.
  const pillarBlocks = React.useMemo(() => {
    const defaults = [
      { id: 'arrow', projects: 3, deep: 2, admin: 3, totalMins: 180, name: 'Arrow' },
      { id: 'sunny', projects: 3, deep: 1, admin: 0, totalMins: 60,  name: 'Sunny' },
      { id: 'life',  projects: 2, deep: 0, admin: 1, totalMins: 30,  name: 'Life'  },
    ];
    return defaults.map(d => {
      const live = remainingMinsByPillar?.[d.id];
      if (live == null) return d;
      return {
        ...d,
        totalMins: live.mins ?? d.totalMins,
        deep:      live.deep  ?? d.deep,
        admin:     live.admin ?? d.admin,
      };
    });
  }, [remainingMinsByPillar]);

  // Sum placed minutes per pillar — drives the depleting time bank
  const placedMinutesByPillar = React.useMemo(() => {
    const m = {};
    placed.filter((b) => b.pillar).forEach((b) => {
      m[b.pillar] = (m[b.pillar] || 0) + b.duration;
    });
    return m;
  }, [placed]);

  // Format a duration in minutes (e.g. 90 → "1.5h", 30 → "30m")
  const fmtMins = (mins) => {
    if (mins <= 0) return '0';
    if (mins < 60) return `${mins}m`;
    const hours = mins / 60;
    return hours === Math.floor(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  };

  const placedPillarCounts = React.useMemo(() => {
    const counts = {};
    placed.filter((b) => b.pillar).forEach((b) => {counts[b.pillar] = (counts[b.pillar] || 0) + 1;});
    return counts;
  }, [placed]);
  const placedRoutineSet = React.useMemo(() => new Set(placed.filter((b) => b.type === 'routine').map((b) => b.id)), [placed]);

  const fmtHour = (h) => {
    const hr = Math.floor(h);
    return hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
  };
  const fmtTime = (h) => {
    const hr = Math.floor(h);
    const mins = Math.round((h - hr) * 60);
    const m = String(mins).padStart(2, '0');
    const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    const ampm = hr < 12 ? 'a' : 'p';
    return `${hr12}:${m}${ampm}`;
  };

  // Translate a y-coordinate (clientY) into an hour value snapped to STEP_MIN
  const yToHour = (clientY) => {
    const r = calRef.current.getBoundingClientRect();
    const y = clientY - r.top;
    const steps = Math.round(y / STEP_PX);
    return FIRST_HOUR + steps * (STEP_MIN / 60);
  };

  // ─────────── Drag system ───────────
  const TAP_DIST = 5;
  const TAP_TIME = 350;

  const startDrag = (source, payload, e) => {
    e.stopPropagation();
    if (e.target.setPointerCapture) {
      try {e.target.setPointerCapture(e.pointerId);} catch {}
    }
    dragStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now(),
      capture: e.currentTarget, pointerId: e.pointerId };
    setDrag({ source, ...payload, x: e.clientX, y: e.clientY, moved: false });
  };

  const moveDrag = (e) => {
    if (!drag) return;
    if (dragStartRef.current && e.pointerId !== dragStartRef.current.pointerId) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const moved = Math.hypot(dx, dy) > TAP_DIST;
    setDrag((d) => d ? { ...d, x: e.clientX, y: e.clientY, moved: d.moved || moved } : null);
  };

  const endDrag = (e) => {
    if (!drag) return;
    const wasTap = !drag.moved && Date.now() - dragStartRef.current.t < TAP_TIME;

    if (wasTap) {
      if (drag.source === 'placed' && drag.blockId) {
        setPlaced((prev) => prev.map((b) => {
          if (b.id !== drag.blockId) return b;
          if (b.type === 'meeting' || b.type === 'routine') return b;
          const next = b.duration >= 60 ? 30 : b.duration >= 45 ? 60 : 45;
          return { ...b, duration: next };
        }));
      }
    } else {
      const targetHour = yToHour(e.clientY);
      const clamped = Math.max(FIRST_HOUR, Math.min(LAST_HOUR + 0.75, targetHour));
      const isMeetingHour = (h, dur, exceptId) => placed.some((b) =>
      b.id !== exceptId && b.type === 'meeting' &&
      rangesOverlap(h, h + dur / 60, b.hour, b.hour + b.duration / 60)
      );

      if (drag.source === 'dock') {
        if (!isMeetingHour(clamped, 30)) {
          setPlaced((prev) => [
          ...prev,
          {
            id: `pb-${drag.pillarId}-${Date.now()}`,
            type: drag.pillarId, hour: clamped, duration: 30,
            title: drag.name,
            pillar: drag.pillarId
          }]
          );
        }
      } else if (drag.source === 'dock-routine') {
        if (!isMeetingHour(clamped, drag.duration)) {
          setPlaced((prev) => [
          ...prev.filter((b) => b.id !== drag.blockId),
          { id: drag.blockId, type: 'routine', hour: clamped,
            duration: drag.duration, title: drag.name, pillar: null }]
          );
        }
      } else if (drag.source === 'placed') {
        const cur = placed.find((b) => b.id === drag.blockId);
        if (cur && !isMeetingHour(clamped, cur.duration, cur.id)) {
          setPlaced((prev) => prev.map((b) => b.id === drag.blockId ? { ...b, hour: clamped } : b));
        }
      }
    }
    setDrag(null);
    dragStartRef.current = null;
  };

  // ─────────── Resize system ───────────
  const startResize = (block, e) => {
    e.stopPropagation();
    if (e.target.setPointerCapture) {
      try {e.target.setPointerCapture(e.pointerId);} catch {}
    }
    setResize({ blockId: block.id, originalDuration: block.duration, startY: e.clientY,
      pointerId: e.pointerId });
  };
  const moveResize = (e) => {
    if (!resize) return;
    if (e.pointerId !== resize.pointerId) return;
    const dy = e.clientY - resize.startY;
    const steps = Math.round(dy / STEP_PX);
    const newDur = Math.max(STEP_MIN, resize.originalDuration + steps * STEP_MIN);
    setPlaced((prev) => prev.map((b) => b.id === resize.blockId ? { ...b, duration: newDur } : b));
  };
  const endResize = () => {setResize(null);};

  // ─────────── Window-level pointer listeners ───────────
  React.useEffect(() => {
    const onMove = (e) => {moveDrag(e);moveResize(e);};
    const onUp = (e) => {endDrag(e);endResize(e);};
    if (drag || resize) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }
  }, [drag, resize, placed]);

  // ─────────── Ad-hoc create ───────────
  const onCalendarClick = (e) => {
    if (drag || resize) return;
    if (e.target.closest('.sched-block-abs')) return;
    if (e.target.closest('.adhoc-input-wrap')) return;
    const h = yToHour(e.clientY);
    const clamped = Math.max(FIRST_HOUR, Math.min(LAST_HOUR + 0.5, h));
    // Don't open if there's already a block within 15min
    const conflict = placed.some((b) => Math.abs(b.hour - clamped) < 0.25);
    if (conflict) return;
    setAdHocHour(clamped);setAdHocText('');
  };
  const commitAdHoc = () => {
    const text = adHocText.trim();
    if (text && adHocHour != null) {
      setPlaced((prev) => [...prev, {
        id: `adhoc-${Date.now()}`, type: 'adhoc',
        hour: adHocHour, duration: 30,
        title: text, pillar: null
      }]);
    }
    setAdHocHour(null);setAdHocText('');
  };

  return (
    <div className="page" data-screen-label="03 Scheduling">
      <div className="scheduling">
        <div className="sched-header">
          <div className="sched-title">Schedule</div>
          <div className="sched-meta">8a — 6p</div>
        </div>
        <div className="sched-subtitle">drag · tap to expand · pull bottom edge to resize</div>

        <div className="hour-cal-scroll">
          <div className="hour-cal" ref={calRef}
          style={{ height: TOTAL_HOURS * HOUR_PX, position: 'relative' }}
          onClick={onCalendarClick}>
            {/* Hour gridlines */}
            {hours.map((h, i) =>
            <div className="hour-line" key={h}
            style={{ position: 'absolute', top: i * HOUR_PX, left: 0, right: 0,
              height: HOUR_PX, borderTop: i === 0 ? 'none' : '1px solid var(--divider)' }}>
                <div className="hour-label-abs">{fmtHour(h)}{h < 12 ? 'a' : 'p'}</div>
                {/* Half-hour mark */}
                <div style={{ position: 'absolute', top: HOUR_PX / 2, left: 44, right: 4,
                height: 1, borderTop: '1px dashed var(--divider)', opacity: 0.55 }}></div>
              </div>
            )}

            {/* Placed blocks (absolutely positioned) */}
            {placed.map((b) => {
              const top = (b.hour - FIRST_HOUR) * HOUR_PX;
              const height = b.duration / 60 * HOUR_PX;
              const draggable = b.type !== 'meeting';
              const isThisDragging = drag?.blockId === b.id;
              const isThisResizing = resize?.blockId === b.id;
              return (
                <div key={b.id}
                className={`sched-block-abs ${b.type} ${isThisDragging ? 'dragging' : ''} ${isThisResizing ? 'resizing' : ''}`}
                style={{ top, height: Math.max(STEP_PX, height) - 2,
                  cursor: draggable ? 'grab' : 'default',
                  opacity: isThisDragging ? 0.4 : 1 }}
                onPointerDown={draggable ? (e) => {
                  const payload = {
                    pillarId: b.type,
                    name: b.title.split(' · ')[0],
                    label: b.title.split(' · ').slice(1).join(' · ') || b.title,
                    blockId: b.id
                  };
                  startDrag('placed', payload, e);
                } : undefined}>
                  <div className="sched-block-title">{b.title}</div>
                  <div className="sched-block-meta">
                    {b.type === 'meeting' ? `meeting · ${fmtTime(b.hour)} – ${fmtTime(b.hour + b.duration / 60)}` :
                    b.type === 'routine' ? `routine · ${b.duration}m` :
                    b.type === 'adhoc' ? `ad-hoc · ${b.duration}m` :
                    b.type === 'prep' ? `prep · ${b.duration}m before` :
                    `${b.duration}m`}
                  </div>
                  {draggable &&
                  <div className="resize-handle"
                  onPointerDown={(e) => startResize(b, e)}
                  title="Drag to resize"></div>
                  }
                </div>);

            })}

            {/* Drop preview — shows the exact snap position while dragging */}
            {drag && drag.moved && calRef.current && (() => {
              const r = calRef.current.getBoundingClientRect();
              if (drag.x < r.left - 40 || drag.x > r.right + 40) return null;
              const snapHour = yToHour(drag.y);
              const clamped = Math.max(FIRST_HOUR, Math.min(LAST_HOUR + 0.75, snapHour));
              const placedBlock = drag.source === 'placed' ? placed.find((b) => b.id === drag.blockId) : null;
              const duration = drag.source === 'dock' ? 30 :
              drag.source === 'dock-routine' ? drag.duration :
              placedBlock?.duration || 30;
              const top = (clamped - FIRST_HOUR) * HOUR_PX;
              const height = duration / 60 * HOUR_PX;
              const conflict = placed.some((b) =>
              b.id !== drag.blockId && b.type === 'meeting' &&
              rangesOverlap(clamped, clamped + duration / 60, b.hour, b.hour + b.duration / 60)
              );
              const type = drag.source === 'placed' ? placedBlock?.type || 'adhoc' :
              drag.source === 'dock-routine' ? 'routine' :
              drag.pillarId;
              return (
                <div className={`sched-block-abs drop-preview ${type} ${conflict ? 'conflict' : ''}`}
                style={{ top, height: Math.max(STEP_PX, height) - 2 }}>
                  <div className="sched-block-title">
                    {conflict ? '✕ overlaps meeting' : drag.name || placedBlock?.title || ''}
                  </div>
                  <div className="sched-block-meta">
                    ↪ {fmtTime(clamped)} – {fmtTime(clamped + duration / 60)} · {duration}m
                  </div>
                </div>);

            })()}

            {/* Ad-hoc inline input */}
            {adHocHour != null &&
            <div className="sched-block-abs adhoc-ghost"
            style={{ top: (adHocHour - FIRST_HOUR) * HOUR_PX,
              height: HOUR_PX * 0.5 }}>
                <div className="adhoc-input-wrap">
                  <input className="adhoc-input"
                autoFocus value={adHocText}
                onChange={(e) => setAdHocText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdHoc();
                  if (e.key === 'Escape') {setAdHocHour(null);setAdHocText('');}
                }}
                onBlur={commitAdHoc}
                placeholder={`new block at ${fmtTime(adHocHour)}`} />
                </div>
              </div>
            }
          </div>
        </div>

        {/* Sticky bottom dock */}
        <div className="sched-dock">
          <div className="dock-label">
            <span>triage · {pillarBlocks.length} pillars · drag to place</span>
            <span style={{ color: 'var(--ink-faint)' }}>reusable</span>
          </div>
          <div className="dock-blocks-row">
            {pillarBlocks.map((b) => {
              const placedCount = placedPillarCounts[b.id] || 0;
              const usedMins = placedMinutesByPillar[b.id] || 0;
              const remaining = Math.max(0, b.totalMins - usedMins);
              const overBudget = usedMins > b.totalMins;
              const fullyBooked = remaining === 0 && usedMins > 0;
              // Proportional task estimate — guard div-by-zero when there
              // is no remaining time bank (everything done) or no tasks.
              const totalTasks = b.deep + b.admin;
              const tasksRemaining = (totalTasks > 0 && b.totalMins > 0)
                ? Math.max(0, Math.round(totalTasks * (remaining / b.totalMins)))
                : 0;
              const deepRemaining = (b.deep > 0 && totalTasks > 0)
                ? Math.min(b.deep, Math.ceil(b.deep / totalTasks * tasksRemaining))
                : 0;
              const adminRemaining = Math.max(0, tasksRemaining - deepRemaining);
              return (
                <div key={b.id}
                className={`dock-block ${b.id} ${fullyBooked ? 'fully-booked' : ''} ${overBudget ? 'over-budget' : ''} ${drag?.source === 'dock' && drag?.pillarId === b.id ? 'dragging' : ''}`}
                onPointerDown={(e) => startDrag('dock', { pillarId: b.id, name: b.name, label: b.name }, e)}>
                  <div className={`pillar-dot ${b.id}`}></div>
                  <span className="dock-name">{b.name}</span>
                  {fullyBooked ?
                  null :

                  <>
                      <span className="dock-tag projects" title={`${b.projects} projects`}>{b.projects}<i>P</i></span>
                      <span className="dock-tag deep" title={`${deepRemaining} of ${b.deep} deep`}>{deepRemaining}<i>D</i></span>
                      <span className="dock-tag admin" title={`${adminRemaining} of ${b.admin} admin`}>{adminRemaining}<i>A</i></span>
                      <span className="dock-est"
                    title={`${fmtMins(usedMins)} placed of ${fmtMins(b.totalMins)}`}>
                        {overBudget ?
                      <span className="dock-over">+{fmtMins(usedMins - b.totalMins)}</span> :
                      fmtMins(remaining)}
                      </span>
                      {placedCount > 0 && <span className="dock-placed-count">{placedCount}↓</span>}
                    </>
                  }
                </div>);

            })}
            {pillarBlocks.length === 0 &&
            <div className="dock-empty">nothing to schedule — triage harder.</div>
            }
          </div>
          <div className="dock-divider"></div>
          <div className="dock-label">
            <span>routines</span>
            <span style={{ color: 'var(--ink-faint)' }}>drag to place</span>
          </div>
          <div className="dock-blocks-row">
            {ROUTINES.map((r) => {
              const isPlaced = placedRoutineSet.has(r.id);
              return (
                <div key={r.id}
                className={`dock-block routine ${isPlaced ? 'placed' : ''} ${drag?.source === 'dock-routine' && drag?.blockId === r.id ? 'dragging' : ''}`}
                onPointerDown={(e) => startDrag('dock-routine', {
                  pillarId: 'routine', name: r.name, label: `${r.duration}m`,
                  blockId: r.id, duration: r.duration
                }, e)}>
                  <span>{r.name}</span>
                  <span className="dock-count">{r.duration}m</span>
                </div>);

            })}
          </div>
        </div>
      </div>

      {drag && drag.moved && !calRef.current?.getBoundingClientRect ? null : drag && drag.moved &&
      <div className={`drag-ghost ${drag.pillarId || 'adhoc'}`}
      style={{ left: drag.x, top: drag.y, opacity: 0.7, transform: 'translate(-50%, -50%) scale(0.85)' }}>
          {drag.name}{drag.label ? ` · ${drag.label}` : ''}
        </div>
      }
    </div>);

}

function rangesOverlap(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

Object.assign(window, { Scheduling });