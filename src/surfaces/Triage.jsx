// Triage — page two. The morning ritual.
// Swipe right → push tomorrow, swipe left → decision menu (drop / weekly review).
// Both tasks AND projects are swipeable. Swiping a project header animates
// the entire project block (header + child tasks) together as one unit.

import React from 'react'
import { createPortal } from 'react-dom'
import { IconCheck } from '../icons.jsx'
import { usePillars } from '../lib/usePillars.js'

const ReactDOM = { createPortal }

function formatProjectDue(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

function useSwipe({ onCommitRight, onCommitLeft, onLongPress,
                     threshPush = 80, threshMenu = 60, holdMs = 500 }) {
  const [dx, setDx] = React.useState(0);
  const [state, setState] = React.useState('idle'); // idle | pushed | dropped
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [tracking, setTracking] = React.useState(false);
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const intent = React.useRef(null); // 'h' | 'v' | null
  const pointerId = React.useRef(null);
  const holdTimer = React.useRef(null);
  const handleRef = React.useRef(null);
  // True when a long-press fired during the current gesture. Consumers
  // (e.g. the project header) use this to suppress their own onClick so a
  // long-press doesn't also trigger a tap action (like collapse).
  const longPressFired = React.useRef(false);

  const clearHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  };

  const onPointerDown = (e) => {
    if (state !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
    intent.current = null;
    longPressFired.current = false;
    setTracking(true);
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    }
    // Schedule long-press
    clearHold();
    if (onLongPress) {
      holdTimer.current = setTimeout(() => {
        // Only fire if no horizontal swipe in progress
        if (!intent.current || intent.current !== 'h') {
          longPressFired.current = true;
          onLongPress();
        }
      }, holdMs);
    }
  };

  const onPointerMove = (e) => {
    if (!tracking || e.pointerId !== pointerId.current) return;
    const ddx = e.clientX - startX.current;
    const ddy = e.clientY - startY.current;
    if (Math.abs(ddx) > 6 || Math.abs(ddy) > 6) {
      clearHold();
    }
    if (!intent.current) {
      if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) {
        intent.current = Math.abs(ddx) > Math.abs(ddy) * 1.2 ? 'h' : 'v';
        if (intent.current === 'v') {
          if (e.target.releasePointerCapture) {
            try { e.target.releasePointerCapture(e.pointerId); } catch {}
          }
          setTracking(false);
        }
      }
    }
    if (intent.current === 'h') {
      e.preventDefault();
      setDx(ddx);
    }
  };

  const onPointerUp = (e) => {
    if (e && e.pointerId !== pointerId.current) return;
    clearHold();
    if (intent.current === 'h') {
      if (dx > threshPush) {
        setState('pushed'); setDx(0);
        setTimeout(() => onCommitRight && onCommitRight(), 280);
      } else if (dx < -threshMenu) {
        setMenuOpen(true); setDx(-90);
      } else {
        setDx(0);
      }
    } else {
      setDx(0);
    }
    setTracking(false);
    intent.current = null;
    pointerId.current = null;
  };

  const commitLeftWith = (action) => {
    setMenuOpen(false);
    setState('dropped');
    setDx(-300);
    setTimeout(() => onCommitLeft && onCommitLeft(action), 280);
  };

  const cancelMenu = () => { setMenuOpen(false); setDx(0); };

  const bind = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: { touchAction: 'pan-y' },
  };

  return { dx, state, menuOpen, setMenuOpen, tracking, bind, commitLeftWith, cancelMenu, handleRef, longPressFired };
}

function SwipeMenu({ sw, onDrop, onWeekly, label }) {
  if (!sw.menuOpen) return null;
  return (
    <div className="decision-menu" onMouseLeave={sw.cancelMenu}>
      <div style={{
        padding: '4px 10px 6px', fontFamily: 'var(--font-mono)',
        fontSize: 9, color: 'var(--ink-tertiary)', letterSpacing: '0.12em',
        textTransform: 'uppercase'
      }}>{label}</div>
      <button onClick={() => sw.commitLeftWith('drop')}>
        <span>drop</span><span className="key">D</span>
      </button>
      <button onClick={() => sw.commitLeftWith('weekly')}>
        <span>weekly review</span><span className="key">W</span>
      </button>
      <button onClick={sw.cancelMenu}>
        <span>cancel</span><span className="key">esc</span>
      </button>
    </div>
  );
}

function SwipeBg({ dx }) {
  if (dx > 10) return <div className="swipe-bg right">↦ push to tomorrow</div>;
  if (dx < -10) return <div className="swipe-bg left">drop / weekly ↤</div>;
  return null;
}

const TASK_STATUSES = [
  { id: 'next',    label: 'next'    },
  { id: 'waiting', label: 'waiting' },
  { id: 'done',    label: 'done'    },
  { id: 'dropped', label: 'dropped' },
];
const PROJECT_STATUSES = [
  { id: 'idea',     label: 'idea'         },
  { id: 'active',   label: 'active'       },
  { id: 'paused',   label: 'paused'       },
  { id: 'review',   label: 'under review' },
  { id: 'completed',label: 'completed'    },
  { id: 'dropped',  label: 'dropped'      },
];

function CalEventRow({ event, hasPrep }) {
  const [menu, setMenu] = React.useState(false);
  const timer = React.useRef(null);
  const startPos = React.useRef({ x: 0, y: 0 });

  const onDown = (e) => {
    startPos.current = { x: e.clientX, y: e.clientY };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMenu(true), 500);
  };
  const onMove = (e) => {
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) > 8) clearTimeout(timer.current);
  };
  const onUp = () => clearTimeout(timer.current);

  const pick = (mins) => {
    setMenu(false);
    const [hh, mm] = event.start.split(':').map(Number);
    const startHour = hh + (mm || 0) / 60 - mins / 60;
    window.dispatchEvent(new CustomEvent('today:prep-added', { detail: {
      eventId: event.id,
      title: event.title,
      // event.pillar defaults to 'open' for meetings without a pillar tag —
      // don't propagate that to the prep block. Prep is its own thing.
      pillar: event.pillar && event.pillar !== 'open' ? event.pillar : null,
      hour: startHour, duration: mins,
    }}));
  };

  return (
    <>
      <div className="cal-event"
           onPointerDown={onDown} onPointerMove={onMove}
           onPointerUp={onUp} onPointerCancel={onUp}
           style={{ touchAction: 'pan-y', cursor: 'pointer', position: 'relative' }}>
        <div className="cal-event-time">{event.start} — {event.end}</div>
        <div className="cal-event-bar" style={{ background: `var(--pillar-${event.pillar})` }}></div>
        <div className="cal-event-title">{event.title}</div>
      </div>
      {menu && ReactDOM.createPortal(
        <div className="status-modal-backdrop" onPointerDown={() => setMenu(false)}>
          <div className="status-modal" onPointerDown={(e) => e.stopPropagation()}>
            <div className="status-modal-label">{hasPrep ? 'change prep block' : 'add prep block'}</div>
            <div className="status-modal-target">{event.title}</div>
            <div className="status-modal-opts">
              {[15, 30, 60].map(m => (
                <button key={m} className="status-modal-btn" onClick={() => pick(m)}>
                  <span className="status-modal-dot active"></span>
                  {m === 60 ? '1 hour' : `${m} min`} before
                </button>
              ))}
            </div>
            <button className="status-modal-cancel" onClick={() => setMenu(false)}>cancel</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function fmtHourLabel(decimal) {
  const hh = Math.floor(decimal);
  const mm = Math.round((decimal - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function CalPrepRow({ prep }) {
  const start = fmtHourLabel(prep.hour);
  const end = fmtHourLabel(prep.hour + prep.duration / 60);
  const remove = () => {
    window.dispatchEvent(new CustomEvent('today:prep-removed', { detail: {
      eventId: prep.sourceId,
    }}));
  };
  return (
    <div className="cal-event cal-event-prep" style={{ position: 'relative' }}>
      <div className="cal-event-time">{start} — {end}</div>
      <div className="cal-event-bar cal-event-bar-prep"></div>
      <div className="cal-event-title">Prep · {prep.title.replace(/^Prep · /, '')}</div>
      <button className="cal-event-prep-remove" onClick={remove}
              title="remove prep block">×</button>
    </div>
  );
}

function StatusMenu({ open, currentStatus, onPick, onClose, label, kind = 'task' }) {
  if (!open) return null;
  const opts = kind === 'project' ? PROJECT_STATUSES : TASK_STATUSES;
  return ReactDOM.createPortal(
    <div className="status-modal-backdrop" onPointerDown={onClose}>
      <div className="status-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="status-modal-label">set status</div>
        <div className="status-modal-target">{label}</div>
        <div className="status-modal-opts">
          {opts.map(o => (
            <button key={o.id}
                    className={`status-modal-btn ${o.id} ${currentStatus === o.id ? 'current' : ''}`}
                    onClick={() => onPick(o.id)}>
              <span className={`status-modal-dot ${o.id}`}></span>
              {o.label}
              {currentStatus === o.id && <span className="status-modal-now">●</span>}
            </button>
          ))}
        </div>
        <button className="status-modal-cancel" onClick={onClose}>cancel</button>
      </div>
    </div>,
    document.body
  );
}

function StatusPill({ status, neutral }) {
  if (!status) return null;
  if (neutral && status === 'next') return null;     // hide default-next pill for standalones
  if (neutral && status === 'idea') return null;     // hide default-idea pill for projects? no, show
  return <span className={`status-pill ${status}`}>{status === 'review' ? 'review' : status}</span>;
}

// ──────────────────────────────────────────────────────────────
// Task gesture: horizontal swipe (left/right) → menus.
//                long-press (no movement) → enter reorder mode.
// ──────────────────────────────────────────────────────────────
function useTaskGesture({
  onSwipeRight, onSwipeLeft,
  onReorderStart, onReorderMove, onReorderEnd,
  threshSwipe = 70, holdMs = 380,
}) {
  const [dx, setDx] = React.useState(0);
  const [mode, setMode] = React.useState('idle'); // idle | swiping | reordering | committed
  const startPos = React.useRef({ x: 0, y: 0 });
  const intent   = React.useRef(null);            // 'h' | 'v' | 'reorder' | null
  const pointerId = React.useRef(null);
  const tracking  = React.useRef(false);
  const holdTimer = React.useRef(null);

  const clearHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  };

  // Capture pointer only when we've decided the gesture is ours (swipe or
  // reorder). Capturing on pointerdown competes with native vertical
  // scrolling on iOS — the first ~8px of finger movement gets eaten while
  // intent resolves, which feels broken.
  const captureFor = (e) => {
    if (e && e.target && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    }
  };

  const onPointerDown = (e) => {
    if (mode !== 'idle' && mode !== 'committed') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    pointerId.current = e.pointerId;
    intent.current = null;
    tracking.current = true;
    setMode('idle');
    clearHold();
    // Long-press picks up the task into reorder mode. Stash the event target
    // so we can capture the pointer when the hold finally fires.
    const target = e.target;
    holdTimer.current = setTimeout(() => {
      if (intent.current === null && tracking.current) {
        intent.current = 'reorder';
        setMode('reordering');
        if (target && target.setPointerCapture) {
          try { target.setPointerCapture(pointerId.current); } catch {}
        }
        if (navigator.vibrate) navigator.vibrate(8);
        if (onReorderStart) onReorderStart();
      }
    }, holdMs);
  };

  const onPointerMove = (e) => {
    if (!tracking.current || e.pointerId !== pointerId.current) return;
    const ddx = e.clientX - startPos.current.x;
    const ddy = e.clientY - startPos.current.y;
    if (intent.current === null) {
      // 14px touch-friendly threshold — leaves room for finger tremor during
      // the long-press hold window.
      if (Math.abs(ddx) > 14 || Math.abs(ddy) > 14) {
        clearHold();
        if (Math.abs(ddx) > Math.abs(ddy) * 1.1) {
          intent.current = 'h';
          setMode('swiping');
          captureFor(e);
        } else {
          intent.current = 'v';
          tracking.current = false;
        }
      }
    }
    if (intent.current === 'h') {
      e.preventDefault();
      setDx(ddx);
    } else if (intent.current === 'reorder') {
      e.preventDefault();
      if (onReorderMove) onReorderMove(ddy, e.clientY);
    }
  };

  const onPointerUp = (e) => {
    if (e && e.pointerId !== pointerId.current) return;
    clearHold();
    if (intent.current === 'h') {
      if (dx > threshSwipe) {
        setMode('committed');
        if (onSwipeRight) onSwipeRight();
      } else if (dx < -threshSwipe) {
        setMode('committed');
        if (onSwipeLeft) onSwipeLeft();
      }
      setDx(0);
    } else if (intent.current === 'reorder') {
      if (onReorderEnd) onReorderEnd();
    }
    intent.current = null;
    tracking.current = false;
    pointerId.current = null;
    if (mode !== 'committed') setMode('idle');
    setTimeout(() => setMode('idle'), 50);
  };

  return {
    dx, mode,
    bind: {
      onPointerDown, onPointerMove, onPointerUp,
      onPointerCancel: onPointerUp,
      style: { touchAction: 'pan-y' },
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Time & depth modal — opens on swipe-left of a task
// ──────────────────────────────────────────────────────────────
const TIME_OPTIONS = [
  { id: '5',   label: '5m'  },
  { id: '15',  label: '15m' },
  { id: '30',  label: '30m' },
  { id: '60',  label: '1h'  },
  { id: '120', label: '2h+' },
];

function TimeDepthMenu({ open, onPick, onClose, label, currentTime, currentDepth }) {
  const [time, setTime] = React.useState(currentTime || null);
  const [depth, setDepth] = React.useState(currentDepth || null);

  React.useEffect(() => {
    if (open) { setTime(currentTime || null); setDepth(currentDepth || null); }
  }, [open, currentTime, currentDepth]);

  if (!open) return null;
  const save = () => onPick({ time, depth });

  return ReactDOM.createPortal(
    <div className="status-modal-backdrop" onPointerDown={onClose}>
      <div className="status-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="status-modal-label">estimate · type</div>
        <div className="status-modal-target">{label}</div>

        <div className="td-section-label">time</div>
        <div className="td-pills">
          {TIME_OPTIONS.map(t => (
            <button key={t.id}
                    className={`td-pill ${time === t.id ? 'on' : ''}`}
                    onClick={() => setTime(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="td-section-label">type</div>
        <div className="td-pills">
          <button className={`td-pill td-depth admin ${depth === 'admin' ? 'on' : ''}`}
                  onClick={() => setDepth('admin')}>admin</button>
          <button className={`td-pill td-depth deep ${depth === 'deep' ? 'on' : ''}`}
                  onClick={() => setDepth('deep')}>deep</button>
        </div>

        <div className="status-modal-actions">
          <button className="status-modal-cancel" onClick={onClose}>cancel</button>
          <button className="status-modal-save"
                  disabled={!time && !depth}
                  onClick={save}>save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ──────────────────────────────────────────────────────────────
// TaskList — manages reorder state for a list of tasks.
// Renders each task via the `renderTask` callback with reorder props.
// ──────────────────────────────────────────────────────────────
function TaskList({ tasks, onReorder, onMoveOut, getCrossTarget, renderTask }) {
  const [reorder, setReorder] = React.useState(null);
  const [crossTarget, setCrossTarget] = React.useState(null);
  const taskRefs = React.useRef({});

  const startReorder = (id, idx) => {
    const heights = tasks.map(t => {
      const el = taskRefs.current[t.id];
      return el ? el.getBoundingClientRect().height + 2 : 38;
    });
    setReorder({ id, startIdx: idx, dy: 0, hoverIdx: idx, heights });
    setCrossTarget(null);
  };

  const updateReorder = (dy, clientY) => {
    setReorder(r => {
      if (!r) return null;
      let hover = r.startIdx;
      const h = r.heights;
      if (dy > 0) {
        let traveled = 0;
        for (let i = r.startIdx + 1; i < tasks.length; i++) {
          traveled += h[i];
          if (dy > traveled - h[i] / 2) hover = i;
        }
      } else if (dy < 0) {
        let traveled = 0;
        for (let i = r.startIdx - 1; i >= 0; i--) {
          traveled += h[i];
          if (-dy > traveled - h[i] / 2) hover = i;
        }
      }
      return { ...r, dy, hoverIdx: hover };
    });
    if (getCrossTarget && clientY != null) {
      const t = getCrossTarget(clientY);
      setCrossTarget(t);
    }
  };

  const endReorder = () => {
    setReorder(r => {
      if (r) {
        if (crossTarget && onMoveOut) {
          onMoveOut(r.id, crossTarget);
        } else if (r.hoverIdx !== r.startIdx && onReorder) {
          onReorder(r.startIdx, r.hoverIdx);
        }
      }
      return null;
    });
    setCrossTarget(null);
  };

  return tasks.map((task, idx) => {
    const isDragging = reorder?.id === task.id;
    let isShifted = false, shiftAmount = 0;
    if (reorder && !isDragging && !crossTarget) {
      const from = reorder.startIdx, to = reorder.hoverIdx;
      const draggedH = reorder.heights[from];
      if (from < to) {
        if (idx > from && idx <= to) { isShifted = true; shiftAmount = -draggedH; }
      } else if (from > to) {
        if (idx >= to && idx < from) { isShifted = true; shiftAmount = draggedH; }
      }
    }
    const translateY = isDragging ? reorder.dy : (isShifted ? shiftAmount : 0);
    return renderTask(task, idx, {
      translateY, isDragging,
      crossTarget: isDragging ? crossTarget : null,
      taskRef: (el) => { if (el) taskRefs.current[task.id] = el; },
      onReorderStart: () => startReorder(task.id, idx),
      onReorderMove: updateReorder,
      onReorderEnd: endReorder,
    });
  });
}

// Quick title-based estimate heuristic. Stand-in for what will eventually
// be a model call + historical-data lookup. Returns minutes as a string.
function guessEstimateFromTitle(title) {
  const t = (title || '').toLowerCase();
  if (/\b(call|email|text|ping|reply|dm|slack|msg|message)\b/.test(t)) return '10m';
  if (/\b(pay|file|submit|book|schedule|order)\b/.test(t))             return '20m';
  if (/\b(draft|outline|sketch|brief)\b/.test(t))                      return '25m';
  if (/\b(write|review|edit|revise|read)\b/.test(t))                   return '30m';
  if (/\b(bounce|mix|master|render|export|design|build)\b/.test(t))    return '45m';
  if (/\b(research|spike|explore|investigate)\b/.test(t))              return '45m';
  if (t.split(/\s+/).length <= 3)                                      return '10m';
  return '15m';
}

function TaskRow({ task, defaultStatus = null,
                   translateY = 0, isDragging = false, crossTarget = null, taskRef,
                   onReorderStart, onReorderMove, onReorderEnd,
                   onStatusChange, onEstChange, onDepthChange }) {
  const [status, setStatus] = React.useState(defaultStatus);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [timeOpen, setTimeOpen] = React.useState(false);
  // Every estimate starts as a guess (from title; later: historical data),
  // and is only "confirmed" once the user picks one via the swipe menu.
  const initialEst = task.est || guessEstimateFromTitle(task.label);
  const [est, setEst] = React.useState(initialEst);
  const [estConfirmed, setEstConfirmed] = React.useState(!!task.estConfirmed);
  const [depth, setDepth] = React.useState(null);
  const lastNonDone = React.useRef(defaultStatus);

  // Publish the initial estimate guess upward so the time bank gets seeded
  // without needing the user to confirm.
  React.useEffect(() => {
    if (onEstChange) onEstChange(task.id, initialEst);
  }, []);

  const updateStatus = (s) => {
    setStatus(s);
    if (onStatusChange) onStatusChange(s);
  };

  const g = useTaskGesture({
    onSwipeRight: () => setStatusOpen(true),
    onSwipeLeft:  () => setTimeOpen(true),
    onReorderStart, onReorderMove, onReorderEnd,
  });

  const done = status === 'done';
  const dropped = status === 'dropped';
  const toggleDone = () => {
    if (done) updateStatus(lastNonDone.current);
    else { lastNonDone.current = status; updateStatus('done'); }
  };

  const showEst = est ? (est.match(/^\d+$/) ? `${est}m` : est) : null;

  return (
    <div className="swipe-row" ref={taskRef}
         style={{
           transform: translateY ? `translateY(${translateY}px)` : undefined,
           transition: isDragging ? 'none' : 'transform 0.18s ease',
           zIndex: isDragging ? 30 : undefined,
           position: 'relative',
         }}>
      {/* Swipe-reveal hints (left/right backgrounds) */}
      {g.dx > 10 && <div className="swipe-bg right">set status →</div>}
      {g.dx < -10 && <div className="swipe-bg left">← estimate · type</div>}

      <StatusMenu open={statusOpen} currentStatus={status} label={task.label} kind="task"
                  onPick={(s) => { updateStatus(s); setStatusOpen(false); }}
                  onClose={() => setStatusOpen(false)} />
      <TimeDepthMenu open={timeOpen} label={task.label}
                     currentTime={est} currentDepth={depth}
                     onPick={({ time, depth: d }) => {
                       if (time)  {
                         setEst(time); setEstConfirmed(true);
                         if (onEstChange) onEstChange(task.id, time);
                       }
                       if (d)     {
                         setDepth(d);
                         if (onDepthChange) onDepthChange(task.id, d);
                       }
                       setTimeOpen(false);
                     }}
                     onClose={() => setTimeOpen(false)} />

      <div className={`task ${done ? 'task-done' : ''} ${dropped ? 'task-dropped' : ''} ${isDragging ? 'task-reorder' : ''} ${depth ? `depth-${depth}` : ''} status-${status || 'none'}`}
           style={{ ...g.bind.style, transform: `translateX(${g.dx}px)` }}
           onPointerDown={g.bind.onPointerDown}
           onPointerMove={g.bind.onPointerMove}
           onPointerUp={g.bind.onPointerUp}
           onPointerCancel={g.bind.onPointerCancel}>
        <button className={`task-check ${done ? 'checked' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); toggleDone(); }}>
          {done && <IconCheck w={10} />}
        </button>
        <div className="task-body">{task.label}</div>
        {crossTarget && (
          <span className="task-reassign-badge">→ {crossTarget.name}</span>
        )}
        {!crossTarget && <StatusPill status={status} />}
        {!crossTarget && depth && <span className={`depth-pill ${depth}`}>{depth}</span>}
        {!crossTarget && showEst && (
          <div className={`task-meta ${estConfirmed ? '' : 'task-meta-guess'}`}
               title={estConfirmed ? 'You set this' : 'Guess from title — swipe left to confirm'}>
            {estConfirmed ? showEst : `~${showEst}`}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, liveTasks, onPushMany, onDropMany, onWeeklyMany,
                      onPushTask, onDropTask, onWeeklyTask, projectRef, isDropTarget,
                      isCollapsed = false, onToggleCollapse,
                      onProjectStatusChange,
                      onTaskStatusChange, onTaskEstChange, onTaskDepthChange,
                      onReorderStart, isReordering = false, reorderY = 0,
                      isShifted = false, shiftAmount = 0 }) {
  const allTaskIds = liveTasks.map(t => t.id);
  const [pStatus, setPStatus] = React.useState('idea');
  const [pStatusOpen, setPStatusOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [extras, setExtras] = React.useState([]);
  // Local order of tasks (combines liveTasks + extras)
  const [taskOrder, setTaskOrder] = React.useState(() => liveTasks.map(t => t.id));
  const didMove = React.useRef(false);

  // Keep taskOrder in sync with incoming liveTasks/extras (add new ids, remove deleted)
  React.useEffect(() => {
    setTaskOrder(prev => {
      const allIds = [...liveTasks, ...extras].map(t => t.id);
      const allSet = new Set(allIds);
      const kept = prev.filter(id => allSet.has(id));
      const additions = allIds.filter(id => !kept.includes(id));
      return [...kept, ...additions];
    });
  }, [liveTasks, extras]);

  const tasksById = React.useMemo(() => {
    const m = {};
    [...liveTasks, ...extras].forEach(t => { m[t.id] = t; });
    return m;
  }, [liveTasks, extras]);

  const orderedTasks = taskOrder.map(id => tasksById[id]).filter(Boolean);

  const reorderTasks = (from, to) => {
    setTaskOrder(arr => {
      const next = [...arr];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  };

  const sw = useSwipe({
    onCommitRight: () => onPushMany(allTaskIds, { scope: 'project', label: project.name }),
    onCommitLeft:  (a) => a === 'drop'
      ? onDropMany(allTaskIds, { scope: 'project', label: project.name })
      : onWeeklyMany(allTaskIds, { scope: 'project', label: project.name }),
    onLongPress: () => setPStatusOpen(true),
  });

  const setPStatusAndReport = (s) => {
    setPStatus(s);
    if (onProjectStatusChange) onProjectStatusChange(project.id, s);
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (text) {
      setExtras(arr => [...arr, {
        id: `pnew-${project.id}-${Date.now()}`,
        label: text, est: guessEstimateFromTitle(text),
      }]);
    }
    setDraft(''); setAdding(false);
  };

  const translateY = isReordering ? reorderY : (isShifted ? shiftAmount : 0);

  // Task-count summary while collapsed
  const taskCountSummary = (() => {
    if (orderedTasks.length === 0) return '0 tasks';
    return `${orderedTasks.length} task${orderedTasks.length === 1 ? '' : 's'}`;
  })();

  return (
    <div className={`project-swipe-wrap swipe-row ${sw.state} ${sw.tracking ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${isReordering ? 'reordering' : ''}`}
         ref={projectRef}
         style={{
           transform: translateY ? `translateY(${translateY}px)` : undefined,
           transition: isReordering ? 'none' : 'transform 0.18s ease',
           zIndex: isReordering ? 40 : undefined,
         }}>
      <SwipeBg dx={sw.dx} />
      <SwipeMenu sw={sw} label="entire project" onDrop={onDropMany} onWeekly={onWeeklyMany} />
      <StatusMenu open={pStatusOpen} currentStatus={pStatus} label={project.name} kind="project"
                  onPick={(s) => { setPStatusAndReport(s); setPStatusOpen(false); }}
                  onClose={() => setPStatusOpen(false)} />
      <div className={`project status-${pStatus} ${isCollapsed ? 'collapsed' : ''}`} style={{
        transform: `translateX(${sw.dx}px)`,
        transition: sw.tracking ? 'none' : 'transform 0.25s cubic-bezier(.4,0,.2,1)'
      }}>
        <div className="project-name project-handle"
             onPointerDown={(e) => {
               didMove.current = false;
               sw.bind.onPointerDown(e);
             }}
             onPointerMove={(e) => {
               // peek movement to set didMove
               const moveAmt = Math.hypot(
                 e.movementX || 0,
                 e.movementY || 0
               );
               if (moveAmt > 2) didMove.current = true;
               sw.bind.onPointerMove(e);
             }}
             onPointerUp={sw.bind.onPointerUp}
             onPointerCancel={sw.bind.onPointerCancel}
             onClick={(e) => {
               // Only toggle collapse if no swipe / drag / long-press occurred.
               // Long-press is its own action (open status modal) — it must
               // not double-fire as a tap.
               if (sw.longPressFired.current) return;
               if (!didMove.current && onToggleCollapse) {
                 onToggleCollapse(project.id);
               }
             }}
             style={{ ...sw.bind.style, cursor: 'pointer' }}>
          <span>{project.name}</span>
          <span className="project-meta">· {project.meta} · {orderedTasks.length}</span>
          {formatProjectDue(project.dueDate) && (
            <span className="project-due">{formatProjectDue(project.dueDate)}</span>
          )}
          <StatusPill status={pStatus} />
          <button className="project-grip"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (onReorderStart) onReorderStart(project.id, e);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="drag to reorder">⋮⋮</button>
        </div>
        <div className="project-body" style={{ display: isCollapsed ? 'none' : 'block' }}>
            {project.outcome && (
              <div className="project-outcome">{project.outcome}</div>
            )}
            <TaskList tasks={orderedTasks} onReorder={reorderTasks}
                      renderTask={(task, idx, rp) => (
                        <TaskRow key={task.id} task={task}
                                 translateY={rp.translateY} isDragging={rp.isDragging}
                                 taskRef={rp.taskRef}
                                 onReorderStart={rp.onReorderStart}
                                 onReorderMove={rp.onReorderMove}
                                 onReorderEnd={rp.onReorderEnd}
                                 onStatusChange={(s) => onTaskStatusChange && onTaskStatusChange(task.id, s)}
                                 onEstChange={onTaskEstChange}
                                 onDepthChange={onTaskDepthChange} />
                      )} />
            {/* Inline subtle "+" to add a task to this project */}
            {!adding ? (
              <button className="project-add-task" onClick={() => setAdding(true)}
                      title="add task to project">+</button>
            ) : (
              <div className="project-add-input-wrap">
                <span className="project-add-dot">+</span>
                <input className="project-add-input"
                       autoFocus value={draft}
                       onChange={(e) => setDraft(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') commitDraft();
                         if (e.key === 'Escape') { setDraft(''); setAdding(false); }
                       }}
                       onBlur={commitDraft}
                       placeholder={`task in ${project.name.toLowerCase()}`} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function PillarBox({ pillar, state, onToggle, onPushTask, onDropTask, onWeeklyTask,
                     onPushMany, onDropMany, onWeeklyMany, removedIds,
                     taskStatuses = {}, onTaskStatusChange,
                     onTaskEstChange, onTaskDepthChange,
                     onAssignPillar,
                     onReorderStart, isDragging, dragOffsetY, isShifted, shiftAmount, dragHandleRef,
                     // cross-pillar drag
                     registerProject, registerPillar,
                     getGlobalCrossTarget, onCrossReassign,
                     globalReassignedOut, globalProjectAdditions, globalOpenAdditions,
                     globalDropTargetId,
                     pillarRootRef }) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [extraTasks, setExtraTasks] = React.useState([]); // [{id, label, est}]
  // Track open-task statuses so we can collapse the section when all are done/dropped
  const [openStatuses, setOpenStatuses] = React.useState({});
  const [showCompletedOpen, setShowCompletedOpen] = React.useState(false);
  const [reassignToast, setReassignToast] = React.useState(null);

  // Project-level collapse + reorder + completed filtering
  const [projectCollapsed, setProjectCollapsed] = React.useState({});
  const [projectOrder, setProjectOrder] = React.useState(pillar.projects.map(p => p.id));
  const [projectReorder, setProjectReorder] = React.useState(null);
  const [completedProjects, setCompletedProjects] = React.useState(new Set());
  const [showCompletedProjects, setShowCompletedProjects] = React.useState(false);
  const projectElRefs = React.useRef({});

  const toggleProjectCollapse = (pid) =>
    setProjectCollapsed(p => ({ ...p, [pid]: !p[pid] }));

  const handleProjectStatusChange = (pid, status) => {
    setCompletedProjects(s => {
      const n = new Set(s);
      if (status === 'completed') n.add(pid);
      else n.delete(pid);
      return n;
    });
  };

  // Project reorder gesture (parallel to pillar reorder)
  const startProjectReorder = (pid, e) => {
    e.stopPropagation();
    const visibleOrder = projectOrder.filter(p => !completedProjects.has(p) || showCompletedProjects);
    const heights = visibleOrder.map(p => {
      const el = projectElRefs.current[p];
      return el ? el.getBoundingClientRect().height + 12 : 80;
    });
    setProjectReorder({
      id: pid, startY: e.clientY, dy: 0,
      originalIndex: visibleOrder.indexOf(pid),
      hoverIndex: visibleOrder.indexOf(pid),
      heights, visibleOrder,
    });
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    }
  };

  React.useEffect(() => {
    if (!projectReorder) return;
    const onMove = (e) => {
      const dy = e.clientY - projectReorder.startY;
      let hover = projectReorder.originalIndex;
      const h = projectReorder.heights;
      const start = projectReorder.originalIndex;
      if (dy > 0) {
        let traveled = 0;
        for (let i = start + 1; i < projectReorder.visibleOrder.length; i++) {
          traveled += h[i];
          if (dy > traveled - h[i] / 2) hover = i;
        }
      } else if (dy < 0) {
        let traveled = 0;
        for (let i = start - 1; i >= 0; i--) {
          traveled += h[i];
          if (-dy > traveled - h[i] / 2) hover = i;
        }
      }
      setProjectReorder(r => r ? { ...r, dy, hoverIndex: hover } : null);
    };
    const onUp = () => {
      if (projectReorder.hoverIndex !== projectReorder.originalIndex) {
        const movedId = projectReorder.id;
        const newVisibleOrder = [...projectReorder.visibleOrder];
        newVisibleOrder.splice(projectReorder.originalIndex, 1);
        newVisibleOrder.splice(projectReorder.hoverIndex, 0, movedId);
        setProjectOrder(prev => {
          // Apply new visible order, keep non-visible in their original positions
          const result = [];
          const visibleSet = new Set(newVisibleOrder);
          let vIdx = 0;
          for (const id of prev) {
            if (visibleSet.has(id)) {
              result.push(newVisibleOrder[vIdx++]);
            } else {
              result.push(id);
            }
          }
          return result;
        });
      }
      setProjectReorder(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [projectReorder]);

  const projectsById = React.useMemo(() => {
    const m = {}; pillar.projects.forEach(p => m[p.id] = p); return m;
  }, [pillar.projects]);

  // Pillar-level long-press menu
  const [pillarMenuOpen, setPillarMenuOpen] = React.useState(false);
  const [pillarCreatingProject, setPillarCreatingProject] = React.useState(false);
  const [pillarProjectDraft, setPillarProjectDraft] = React.useState('');
  const [pillarExtraProjects, setPillarExtraProjects] = React.useState([]); // new projects created via menu
  const holdTimerRef = React.useRef(null);
  const headerMovedRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);

  const onHeaderPointerDown = (e) => {
    headerMovedRef.current = false;
    suppressClickRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (!headerMovedRef.current) {
        suppressClickRef.current = true;
        setPillarMenuOpen(true);
        if (navigator.vibrate) navigator.vibrate(8);
      }
    }, 480);
  };
  const onHeaderPointerMove = (e) => {
    const m = Math.hypot(e.movementX || 0, e.movementY || 0);
    if (m > 3) {
      headerMovedRef.current = true;
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    }
  };
  const onHeaderPointerUp = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };
  const onHeaderClick = (e) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (!isDragging) onToggle(pillar.id);
  };

  const commitNewProject = () => {
    const text = pillarProjectDraft.trim();
    if (text) {
      const newId = `pnew-${pillar.id}-${Date.now()}`;
      setPillarExtraProjects(arr => [...arr, {
        id: newId, name: text, meta: 'new', tasks: []
      }]);
      setProjectOrder(arr => [...arr, newId]);
    }
    setPillarProjectDraft('');
    setPillarCreatingProject(false);
  };

  // Merge new projects into the lookup
  const allProjectsById = React.useMemo(() => {
    const m = { ...projectsById };
    pillarExtraProjects.forEach(p => { m[p.id] = p; });
    return m;
  }, [projectsById, pillarExtraProjects]);

  // Register pillar root for cross-pillar drag
  const pillarRef = React.useRef(null);
  React.useEffect(() => {
    if (registerPillar && pillarRef.current) {
      registerPillar(pillar.id, pillar.name, pillarRef.current);
    }
    return () => { if (registerPillar) registerPillar(pillar.id, pillar.name, null); };
  }, [pillar.id, pillar.name, registerPillar]);

  // Open tasks are noise when they're scheduled for a future day — only
  // show ones with no do_date (always-available) or do_date = today. Tasks
  // scheduled for later live in Course until their day arrives.
  const todayISO = new Date().toISOString().slice(0, 10);
  const pillarOpenTasks = (pillar.openTasks || []).filter(
    (t) => !t.doDate || t.doDate === todayISO
  );
  const openExtrasFromOther = globalOpenAdditions?.[pillar.id] || [];
  // A task is "still open" if it's not removed (pushed/dropped via swipe),
  // not reassigned out, and its status isn't done/dropped.
  const isStillOpen = (t) => {
    if (removedIds.has(t.id) || globalReassignedOut.has(t.id)) return false;
    const s = taskStatuses[t.id];
    if (s === 'done' || s === 'dropped') return false;
    return true;
  };
  const totalTasks = pillar.projects.reduce(
    (acc, p) => acc + p.tasks.filter(isStillOpen).length, 0
  ) + Object.values(globalProjectAdditions || {}).flat().filter(t => {
        // Count reassignments landing in this pillar's projects
        return pillar.projects.some(p => (globalProjectAdditions[p.id] || []).some(x => x.id === t.id))
          && isStillOpen(t);
      }).length
    + pillarOpenTasks.filter(isStillOpen).length
    + extraTasks.filter(isStillOpen).length
    + openExtrasFromOther.filter(t => !globalReassignedOut.has(t.id) && isStillOpen(t)).length;
  const pushedCount = pillar.projects.reduce(
    (acc, p) => acc + p.tasks.filter(t => removedIds.has(t.id)).length, 0
  ) + pillarOpenTasks.filter(t => removedIds.has(t.id)).length;
  const isCollapsed = state === 'collapsed';
  const isEmpty = totalTasks === 0 && pushedCount > 0;

  let countLabel;
  if (isEmpty)         countLabel = 'all cleared';
  else if (isCollapsed) countLabel = `${totalTasks} committed`;
  else if (pushedCount) countLabel = `${totalTasks} kept · ${pushedCount} pushed`;
  else                  countLabel = `${totalTasks} open`;

  const translateY = isDragging ? dragOffsetY :
                     isShifted   ? shiftAmount : 0;

  const commitDraft = () => {
    const text = draft.trim();
    if (text) {
      setExtraTasks(arr => [...arr, {
        id: `new-${pillar.id}-${Date.now()}`,
        label: text,
        est: guessEstimateFromTitle(text),
      }]);
    }
    setDraft(''); setAdding(false);
  };

  return (
    <div ref={(el) => { pillarRef.current = el; if (dragHandleRef) dragHandleRef(el); }}
         className={`pillar ${isCollapsed ? 'collapsed' : ''} ${isEmpty ? 'empty' : ''} ${isDragging ? 'reorder-dragging' : ''} ${isShifted ? 'reorder-shifted' : ''} ${globalDropTargetId === `pillar:${pillar.id}` ? 'pillar-drop-target' : ''}`}
         style={{
           transform: translateY ? `translateY(${translateY}px)` : undefined,
           transition: isDragging ? 'none' : 'transform 0.18s ease',
           zIndex: isDragging ? 50 : undefined,
         }}>
      <div className="pillar-header"
           onPointerDown={onHeaderPointerDown}
           onPointerMove={onHeaderPointerMove}
           onPointerUp={onHeaderPointerUp}
           onPointerCancel={onHeaderPointerUp}
           onClick={onHeaderClick}>
        <div className="pillar-name">
          <div className={`pillar-dot ${pillar.color}`}></div>
          <div className="pillar-title">{pillar.name}</div>
        </div>
        <div className="pillar-meta">
          <div className="pillar-count">{countLabel}</div>
          <div className="pillar-chevron">▾</div>
          <button className="pillar-grip"
                  onPointerDown={(e) => onReorderStart(pillar.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  title="drag to reorder">⋮⋮</button>
        </div>
      </div>
      <div className="pillar-body" style={{ display: isCollapsed ? 'none' : 'block' }}>
          {projectOrder.map((pid, idx) => {
            const project = allProjectsById[pid];
            if (!project) return null;
            const isCompleted = completedProjects.has(pid);
            if (isCompleted && !showCompletedProjects) return null;
            const liveTasks = project.tasks.filter(t => !removedIds.has(t.id) && !globalReassignedOut.has(t.id));
            // Single dedup pass — kills DB-vs-optimistic overlap plus any
            // self-duplicates from a double-fired drag.
            const seenProj = new Set();
            const allProjectTasks = [];
            for (const t of [...liveTasks, ...(globalProjectAdditions?.[project.id] || [])]) {
              if (seenProj.has(t.id)) continue;
              seenProj.add(t.id);
              allProjectTasks.push(t);
            }
            if (allProjectTasks.length === 0 && !isCompleted) return null;

            // Reorder visual props
            const isReordering = projectReorder && projectReorder.id === pid;
            let isShifted = false, shiftAmount = 0;
            if (projectReorder && !isReordering) {
              const visIdx = projectReorder.visibleOrder.indexOf(pid);
              if (visIdx >= 0) {
                const from = projectReorder.originalIndex, to = projectReorder.hoverIndex;
                const draggedH = projectReorder.heights[from];
                if (from < to) {
                  if (visIdx > from && visIdx <= to) { isShifted = true; shiftAmount = -draggedH; }
                } else if (from > to) {
                  if (visIdx >= to && visIdx < from) { isShifted = true; shiftAmount = draggedH; }
                }
              }
            }

            return (
              <ProjectRow key={project.id}
                          project={project}
                          liveTasks={allProjectTasks}
                          projectRef={(el) => {
                            if (el) projectElRefs.current[pid] = el;
                            else delete projectElRefs.current[pid];
                            if (registerProject) registerProject(project.id, project.name, pillar.id, el);
                          }}
                          isDropTarget={globalDropTargetId === `project:${project.id}`}
                          isCollapsed={!!projectCollapsed[pid]}
                          onToggleCollapse={toggleProjectCollapse}
                          onProjectStatusChange={handleProjectStatusChange}
                          onReorderStart={startProjectReorder}
                          isReordering={isReordering}
                          reorderY={isReordering ? projectReorder.dy : 0}
                          isShifted={isShifted}
                          shiftAmount={shiftAmount}
                          onPushMany={onPushMany} onDropMany={onDropMany} onWeeklyMany={onWeeklyMany}
                          onPushTask={onPushTask} onDropTask={onDropTask} onWeeklyTask={onWeeklyTask}
                          onTaskStatusChange={onTaskStatusChange}
                          onTaskEstChange={onTaskEstChange}
                          onTaskDepthChange={onTaskDepthChange} />
            );
          })}

          {/* Inline new-project input, appears when "create project" picked from long-press menu */}
          {pillarCreatingProject && (
            <div className="add-task-input-wrap" style={{ marginTop: 14 }}>
              <span className={`pillar-dot ${pillar.color}`} style={{ marginLeft: 4 }}></span>
              <input className="add-task-input"
                     autoFocus value={pillarProjectDraft}
                     onChange={(e) => setPillarProjectDraft(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') commitNewProject();
                       if (e.key === 'Escape') { setPillarProjectDraft(''); setPillarCreatingProject(false); }
                     }}
                     onBlur={commitNewProject}
                     placeholder={`new ${pillar.name.toLowerCase()} project`}
                     style={{ fontWeight: 500 }} />
              <button className="add-task-cancel"
                      onMouseDown={(e) => { e.preventDefault(); setPillarCreatingProject(false); setPillarProjectDraft(''); }}>
                esc
              </button>
            </div>
          )}

          {/* Completed-projects show/hide affordance */}
          {completedProjects.size > 0 && (
            <button className="completed-projects-toggle"
                    onClick={() => setShowCompletedProjects(v => !v)}>
              <span className="check-pill">✓</span>
              <span>{completedProjects.size} completed project{completedProjects.size === 1 ? '' : 's'}</span>
              <span className="pillar-opentasks-show">{showCompletedProjects ? 'hide' : 'show'}</span>
            </button>
          )}

          {/* Open tasks section — pillar-level, separate from projects */}
          {(() => {
            const liveOpenTasks = pillarOpenTasks.filter(t => !removedIds.has(t.id) && !globalReassignedOut.has(t.id));
            const liveExtras    = extraTasks.filter(t => !removedIds.has(t.id) && !globalReassignedOut.has(t.id));
            // Single dedup pass across all three sources. Catches DB-vs-
            // optimistic overlap AND any self-duplicates from a glitchy drag
            // that double-fired onCrossReassign before the state hygiene fix.
            const seen = new Set();
            const allOpenTasks = [];
            for (const t of [...liveOpenTasks, ...liveExtras, ...openExtrasFromOther]) {
              if (seen.has(t.id)) continue;
              seen.add(t.id);
              allOpenTasks.push(t);
            }
            const hasOpen       = allOpenTasks.length > 0;

            const isDone = (id) => {
              const s = openStatuses[id] || 'next';
              return s === 'done' || s === 'dropped';
            };
            const pendingCount = allOpenTasks.filter(t => !isDone(t.id)).length;
            const allComplete = hasOpen && pendingCount === 0;
            const showCollapsed = allComplete && !showCompletedOpen;

            const handleMoveOut = (taskId, target) => {
              const task = allOpenTasks.find(t => t.id === taskId);
              if (!task) return;
              const isOwnPillarNoOp = target.kind === 'pillar' && target.id === pillar.id;
              if (!isOwnPillarNoOp) {
                // Project move within same pillar OR cross-pillar — both get a toast.
                setReassignToast({ taskLabel: task.label, label: target.name });
                setTimeout(() => setReassignToast(null), 2400);
              }
              // Always notify the parent so the global drop-target highlight clears,
              // even when the drop is a no-op (e.g. dragging an open task back into
              // its own pillar's open-tasks zone).
              if (onCrossReassign) onCrossReassign(taskId, task, target);
            };

            if (showCollapsed) {
              return (
                <div className="pillar-opentasks-collapsed"
                     onClick={() => setShowCompletedOpen(true)}>
                  <span className="check-pill">✓</span>
                  <span>all open tasks complete · {allOpenTasks.length}</span>
                  <span className="pillar-opentasks-show">show</span>
                </div>
              );
            }

            return (
              <div className="pillar-opentasks">
                <div className="pillar-opentasks-label">
                  <span>open tasks</span>
                  <span className="pillar-opentasks-count">
                    {hasOpen
                      ? (pendingCount === allOpenTasks.length
                          ? `${allOpenTasks.length}`
                          : `${pendingCount} of ${allOpenTasks.length}`)
                      : 'none yet'}
                  </span>
                </div>
                <TaskList tasks={allOpenTasks}
                          getCrossTarget={getGlobalCrossTarget}
                          onMoveOut={handleMoveOut}
                          renderTask={(task, idx, rp) => (
                            <TaskRow key={task.id} task={task} defaultStatus="next"
                                     translateY={rp.translateY} isDragging={rp.isDragging}
                                     crossTarget={rp.crossTarget}
                                     taskRef={rp.taskRef}
                                     onReorderStart={rp.onReorderStart}
                                     onReorderMove={rp.onReorderMove}
                                     onReorderEnd={rp.onReorderEnd}
                                     onStatusChange={(s) => {
                                       setOpenStatuses(o => ({ ...o, [task.id]: s }));
                                       if (onTaskStatusChange) onTaskStatusChange(task.id, s);
                                     }}
                                     onEstChange={onTaskEstChange}
                                     onDepthChange={onTaskDepthChange} />
                          )} />
                {!adding ? (
                  <button className="add-task-btn" onClick={() => setAdding(true)}
                          title="add open task">+</button>
                ) : (
                  <div className="add-task-input-wrap">
                    <span className={`pillar-dot ${pillar.color}`} style={{ marginLeft: 4 }}></span>
                    <input className="add-task-input"
                           autoFocus value={draft}
                           onChange={(e) => setDraft(e.target.value)}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') commitDraft();
                             if (e.key === 'Escape') { setDraft(''); setAdding(false); }
                           }}
                           onBlur={commitDraft}
                           placeholder={`new ${pillar.name.toLowerCase()} task`} />
                    <button className="add-task-cancel"
                            onMouseDown={(e) => { e.preventDefault(); setAdding(false); setDraft(''); }}>
                      esc
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {reassignToast && (
            <div className="reassign-toast">
              <span className="reassign-toast-icon">→</span>
              <span><b>{reassignToast.taskLabel}</b> moved to {reassignToast.label}</span>
            </div>
          )}

          {totalTasks === 0 && (
            <div style={{
              padding: '12px 0 4px', fontFamily: 'var(--font-mono)',
              fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.05em'
            }}>
              triaged to zero. tap to collapse.
            </div>
          )}
        </div>
    </div>
  );
}

// Convert a placed_blocks row (hour decimal, duration minutes) into the
// {start, end, title, pillar} shape CalEventRow expects.
function placedToCalEvent(b) {
  const fmt = (decimal) => {
    const hh = Math.floor(decimal)
    const mm = Math.round((decimal - hh) * 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  return {
    id: b.id,
    start: fmt(b.hour),
    end: fmt(b.hour + b.duration / 60),
    title: b.title,
    pillar: b.pillar ?? 'open',
  }
}

export function Triage({ placed, initialProgress = 'mid', onPushNext, onRemainingMinsChange }) {
  const calEvents = React.useMemo(
    () =>
      (placed ?? [])
        .filter((b) => b.type === 'meeting')
        .sort((a, b) => a.hour - b.hour)
        .map(placedToCalEvent),
    [placed]
  )
  // Existing prep blocks keyed by the meeting they're for (source_id).
  // Used to (a) tell CalEventRow whether prep already exists and (b) render
  // the prep as its own row in the calendar list, just before the meeting.
  const prepBlockByEventId = React.useMemo(() => {
    const m = new Map()
    for (const b of placed ?? []) {
      if (b.type === 'prep' && b.sourceId) m.set(b.sourceId, b)
    }
    return m
  }, [placed])

  // Build the interleaved render list: prep rows positioned just before their
  // meeting. Time-sorted overall so an unrelated meeting between prep and
  // its own meeting still appears in the right place.
  const calRows = React.useMemo(() => {
    const startDecimal = (s) => {
      const [hh, mm] = s.split(':').map(Number)
      return hh + (mm || 0) / 60
    }
    const rows = []
    for (const e of calEvents) {
      const prep = prepBlockByEventId.get(e.id)
      if (prep) rows.push({ kind: 'prep', hour: prep.hour, prep })
      rows.push({ kind: 'meeting', hour: startDecimal(e.start), event: e, hasPrep: !!prep })
    }
    return rows.sort((a, b) => a.hour - b.hour)
  }, [calEvents, prepBlockByEventId])
  const { pillars: PILLARS, loading, error, updateTaskStatus: writeTaskStatus, updateTask: writeTaskPatch, updateTaskPillar: writeTaskPillar, getTaskSnapshot } = usePillars()

  const initial = React.useMemo(() => {
    if (initialProgress === 'empty')
      return { arrow: 'open', sunny: 'open', life: 'open', open: 'open' };
    if (initialProgress === 'mid')
      return { arrow: 'collapsed', sunny: 'open', life: 'open', open: 'open' };
    if (initialProgress === 'done')
      return { arrow: 'collapsed', sunny: 'collapsed', life: 'collapsed', open: 'collapsed' };
    return { arrow: 'open', sunny: 'open', life: 'open', open: 'open' };
  }, [initialProgress]);

  const [pillarState, setPillarState] = React.useState(initial);
  const [removed, setRemoved] = React.useState(new Set());
  // Global map of task id → current status. Drives the open-count in the
  // pillar header and the remaining-time bank on the Scheduling page.
  const [taskStatuses, setTaskStatuses] = React.useState({});
  const updateTaskStatus = React.useCallback((taskId, status) => {
    // Write through to course_tasks. Don't block UI on the round-trip;
    // the hook logs failures to the console. Re-fetch on next open.
    if (writeTaskStatus && taskId && status && !String(taskId).startsWith('new-') && !String(taskId).startsWith('pnew-')) {
      writeTaskStatus(taskId, status)
    }
    setTaskStatuses(s => {
      if (status === 'next' || status === null) {
        if (!(taskId in s)) return s;
        const out = { ...s }; delete out[taskId]; return out;
      }
      if (s[taskId] === status) return s;
      return { ...s, [taskId]: status };
    });
  }, [writeTaskStatus]);
  // User overrides on estimate ("~15m" guess → confirmed "60m") and depth
  // ('deep' / 'admin') — drives both per-pillar remaining mins and the
  // dock's D/A task counts. Keyed by task id.
  const [taskEstimates, setTaskEstimates] = React.useState({});
  const [taskDepths, setTaskDepths] = React.useState({});
  const updateTaskEst = React.useCallback((taskId, est) => {
    setTaskEstimates(s => (s[taskId] === est ? s : { ...s, [taskId]: est }));
  }, []);
  const updateTaskDepth = React.useCallback((taskId, depth) => {
    setTaskDepths(s => (s[taskId] === depth ? s : { ...s, [taskId]: depth }));
  }, []);
  const [toast, setToast] = React.useState(null); // { kind, ids: [...], n, key }
  const toastTimer = React.useRef(null);
  // Fingerprint of the last toast + when it fired, used to dedupe.
  const lastToastFp = React.useRef(null);
  const lastToastAt = React.useRef(0);
  const [order, setOrder] = React.useState(() => PILLARS.map(p => p.id));
  // Populate order when pillars arrive from the async fetch.
  React.useEffect(() => {
    if (PILLARS.length && order.length === 0) {
      setOrder(PILLARS.map(p => p.id));
    }
  }, [PILLARS, order.length]);
  const [reorder, setReorder] = React.useState(null); // { id, startY, dy, hoverIndex, heights }
  const pillarRefs = React.useRef({});

  // ─── Global cross-pillar drag state ───
  const projectRegistry = React.useRef({}); // pid -> { name, pillarId, el }
  const pillarRegistry  = React.useRef({}); // pillarId -> { name, el }
  const [reassignedOut, setReassignedOut] = React.useState(new Set());
  const [projectAdditions, setProjectAdditions] = React.useState({}); // pid -> [task]
  const [openAdditions, setOpenAdditions] = React.useState({}); // pillarId -> [task]
  const [globalDropTargetId, setGlobalDropTargetId] = React.useState(null);

  // usePillars only re-fires when the DB refetches (initial load + after a
  // cross-pillar writeback). At that point the DB is authoritative — keeping
  // the optimistic openAdditions / reassignedOut state would double-render
  // the moved task in the target pillar.
  React.useEffect(() => {
    setOpenAdditions({});
    setProjectAdditions({});
    setReassignedOut(new Set());
  }, [PILLARS]);

  const registerProject = React.useCallback((pid, name, pillarId, el) => {
    if (el) projectRegistry.current[pid] = { name, pillarId, el };
    else delete projectRegistry.current[pid];
  }, []);
  const registerPillar = React.useCallback((pillarId, name, el) => {
    if (el) pillarRegistry.current[pillarId] = { name, el };
    else delete pillarRegistry.current[pillarId];
  }, []);

  const getGlobalCrossTarget = React.useCallback((clientY) => {
    // Prefer project hit (more specific)
    for (const [pid, info] of Object.entries(projectRegistry.current)) {
      if (!info.el) continue;
      const r = info.el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        const target = { kind: 'project', id: pid, name: info.name, pillarId: info.pillarId };
        setGlobalDropTargetId(`project:${pid}`);
        return target;
      }
    }
    // Otherwise pillar hit (drop into another pillar's open tasks)
    for (const [pillarId, info] of Object.entries(pillarRegistry.current)) {
      if (!info.el) continue;
      const r = info.el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        const target = { kind: 'pillar', id: pillarId, name: info.name };
        setGlobalDropTargetId(`pillar:${pillarId}`);
        return target;
      }
    }
    setGlobalDropTargetId(null);
    return null;
  }, []);

  const onCrossReassign = React.useCallback((taskId, task, target) => {
    // Clear the global drop-target highlight no matter what — fixes a bug
    // where a no-op drop (e.g. own-pillar) left the pillar visually highlighted.
    setGlobalDropTargetId(null);
    // No-op drops still flow through here just to clear the highlight.
    if (!task || !target) return;
    // Dropping a task back into the pillar it already lives in is a no-op
    // beyond clearing the highlight.
    const sourcePillarId = task.pillar
      ?? (target.kind === 'pillar' && target.id === task.pillar ? target.id : null);
    if (target.kind === 'pillar' && sourcePillarId && target.id === sourcePillarId) return;

    setReassignedOut(s => new Set([...s, taskId]));
    if (target.kind === 'project') {
      setProjectAdditions(prev => {
        const existing = prev[target.id] || [];
        // Idempotent: if a stray double-fire of the gesture lands here twice,
        // don't stack a second copy. Render-time dedup helps too, but state
        // hygiene is the real fix.
        if (existing.some(t => t.id === task.id)) return prev;
        return { ...prev, [target.id]: [...existing, task] };
      });
    } else if (target.kind === 'pillar') {
      setOpenAdditions(prev => {
        const existing = prev[target.id] || [];
        if (existing.some(t => t.id === task.id)) return prev;
        return { ...prev, [target.id]: [...existing, task] };
      });
      // Persist the assignment when dropping a task onto a pillar header.
      // Mirrors what the inline "move to Arrow/Sunny/Life" chips do on the
      // synthetic Open Tasks pillar — writes course_tasks.pillar + Notion.
      if (target.id === 'arrow' || target.id === 'sunny' || target.id === 'life' || target.id === 'sidegig') {
        writeTaskPillar(taskId, target.id);
      }
    }
  }, [writeTaskPillar]);

  React.useEffect(() => { setPillarState(initial); }, [initial]);

  // Compute remaining-minutes per pillar and publish upward whenever
  // statuses, removals, estimates or depths change. The Scheduling page
  // uses this to size the time bank in its dock and update the D/A task
  // counts as items get completed or re-estimated.
  React.useEffect(() => {
    if (!onRemainingMinsChange) return;
    const parseMins = (est) => {
      if (!est) return 0;
      const m = String(est).match(/^(\d+)\s*m?$/);
      if (m) return parseInt(m[1], 10);
      const h = String(est).match(/^(\d+(?:\.\d+)?)\s*h$/);
      if (h) return Math.round(parseFloat(h[1]) * 60);
      return 0;
    };
    const isOpen = (t) => {
      if (removed.has(t.id)) return false;
      const s = taskStatuses[t.id];
      if (s === 'done' || s === 'dropped') return false;
      return true;
    };
    const out = {};
    PILLARS.forEach(p => {
      let mins = 0, deep = 0, admin = 0;
      const visit = (t) => {
        if (!isOpen(t)) return;
        const est = taskEstimates[t.id] || t.est;
        const m = parseMins(est);
        mins += m;
        // Classify: explicit user depth wins; otherwise heuristic by duration.
        const explicit = taskDepths[t.id];
        if (explicit === 'deep') deep += 1;
        else if (explicit === 'admin') admin += 1;
        else if (m >= 30) deep += 1;
        else admin += 1;
      };
      (p.openTasks || []).forEach(visit);
      (p.projects  || []).forEach(proj => (proj.tasks || []).forEach(visit));
      out[p.id] = { mins, deep, admin };
    });
    onRemainingMinsChange(out);
  }, [taskStatuses, taskEstimates, taskDepths, removed, PILLARS, onRemainingMinsChange]);

  const toggle = (id) => setPillarState(s => ({ ...s, [id]: s[id] === 'collapsed' ? 'open' : 'collapsed' }));

  // For each toast: capture pre-state per task so undo can replay it.
  const tomorrowISO = () => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  const patchForKind = (kind) => {
    if (kind === 'pushed')  return { do_date: tomorrowISO() };
    if (kind === 'dropped') return { status: 'dropped' };
    if (kind === 'weekly')  return { status: 'triage', do_date: null };
    return null;
  };

  // Skip writebacks for client-only ids (tasks added in this session that
  // don't yet exist in course_tasks).
  const isPersistedId = (id) =>
    !!id && !String(id).startsWith('new-') && !String(id).startsWith('pnew-');

  const applyAction = (kind, ids, opts = {}) => {
    const persisted = ids.filter(isPersistedId);
    const prevByTask = {};
    persisted.forEach((id) => {
      const snap = getTaskSnapshot && getTaskSnapshot(id);
      if (snap) prevByTask[id] = snap;
    });
    setRemoved((s) => new Set([...s, ...ids]));
    const patch = patchForKind(kind);
    if (patch && writeTaskPatch) {
      persisted.forEach((id) => writeTaskPatch(id, patch));
    }
    showToast(kind, ids, { ...opts, prevByTask });
  };

  // Toast: small notification with an undo button. Lives for 2s, then
  // disappears entirely. Tapping undo restores local state + replays prev
  // DB state for each affected task.
  const showToast = (kind, ids, opts = {}) => {
    // Dedupe: ignore double-fires of the same action within 250ms.
    const now = Date.now();
    const fp = `${kind}|${opts.scope || 'task'}|${[...ids].sort().join(',')}`;
    if (lastToastFp.current === fp && now - lastToastAt.current < 250) return;
    lastToastFp.current = fp;
    lastToastAt.current = now;

    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({
      kind, ids: [...ids], n: ids.length,
      scope: opts.scope || 'task',
      label: opts.label || null,
      prevByTask: opts.prevByTask || {},
      key: now,
    });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  const undoToast = () => {
    if (!toast) return;
    setRemoved(s => {
      const out = new Set(s);
      toast.ids.forEach(id => out.delete(id));
      return out;
    });
    // Replay prev DB state for each touched task.
    if (writeTaskPatch && toast.prevByTask) {
      Object.entries(toast.prevByTask).forEach(([id, prev]) => {
        writeTaskPatch(id, prev);
      });
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };

  const pushOne   = (id)  => applyAction('pushed',  [id]);
  const dropOne   = (id)  => applyAction('dropped', [id]);
  const weeklyOne = (id)  => applyAction('weekly',  [id]);
  const pushMany  = (ids, opts) => applyAction('pushed',  ids, opts);
  const dropMany  = (ids, opts) => applyAction('dropped', ids, opts);
  const weeklyMany= (ids, opts) => applyAction('weekly',  ids, opts);

  // ─── Reorder pillars ───
  const startReorder = (id, e) => {
    e.stopPropagation();
    const heights = order.map(pid => {
      const el = pillarRefs.current[pid];
      return el ? el.getBoundingClientRect().height + 12 /* mb */ : 100;
    });
    setReorder({
      id, startY: e.clientY, dy: 0,
      originalIndex: order.indexOf(id),
      hoverIndex: order.indexOf(id),
      heights,
    });
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    }
  };

  React.useEffect(() => {
    if (!reorder) return;
    const onMove = (e) => {
      const dy = e.clientY - reorder.startY;
      // Compute hover index based on cumulative height + dy
      let hover = reorder.originalIndex;
      const h = reorder.heights;
      let acc = 0;
      // First, "lift" out the dragged pillar's slot
      const start = reorder.originalIndex;
      if (dy > 0) {
        // Moving down: see how many slots below have midpoints crossed
        let traveled = 0;
        for (let i = start + 1; i < order.length; i++) {
          traveled += h[i];
          if (dy > traveled - h[i] / 2) hover = i;
        }
      } else if (dy < 0) {
        let traveled = 0;
        for (let i = start - 1; i >= 0; i--) {
          traveled += h[i];
          if (-dy > traveled - h[i] / 2) hover = i;
        }
      }
      setReorder(r => r ? { ...r, dy, hoverIndex: hover } : null);
    };
    const onUp = () => {
      if (reorder.hoverIndex !== reorder.originalIndex) {
        setOrder(o => {
          const next = o.filter(id => id !== reorder.id);
          next.splice(reorder.hoverIndex, 0, reorder.id);
          return next;
        });
      }
      setReorder(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [reorder, order]);

  // Map pillar id → pillar object
  const pillarsById = React.useMemo(() => {
    const m = {}; PILLARS.forEach(p => m[p.id] = p); return m;
  }, [PILLARS]);

  const collapsedCount = Object.values(pillarState).filter(v => v === 'collapsed').length;
  const allCollapsed = collapsedCount === PILLARS.length;

  return (
    <div className="page" data-screen-label="02 Triage">
      <div className="triage">
        <div className="triage-header">
          <div className="triage-title">Triage</div>
          <div className="triage-progress">
            <span className="done">{collapsedCount}</span> / {PILLARS.length} committed
          </div>
        </div>
        <div className="triage-subtitle">tasks: swipe → status · swipe ← time · hold to move</div>

        <div className="cal-summary">
          <div className="cal-summary-label">today's calendar · hold to add prep time</div>
          {calEvents.length === 0 && (
            <div className="cal-summary-empty" style={{ opacity: 0.5, padding: '8px 0', fontSize: 13 }}>
              no meetings today
            </div>
          )}
          {calRows.map((r) =>
            r.kind === 'prep'
              ? <CalPrepRow key={r.prep.id} prep={r.prep} />
              : <CalEventRow key={r.event.id} event={r.event} hasPrep={r.hasPrep} />
          )}
        </div>

        {order.map((id, idx) => {
          const pillar = pillarsById[id];
          if (!pillar) return null;
          const isDragging = reorder && reorder.id === id;

          // Compute shift for non-dragged pillars based on hover index
          let isShifted = false;
          let shiftAmount = 0;
          if (reorder && !isDragging) {
            const draggedFromIdx = reorder.originalIndex;
            const draggedToIdx = reorder.hoverIndex;
            const draggedHeight = reorder.heights[draggedFromIdx];
            if (draggedFromIdx < draggedToIdx) {
              // moving down: pillars between fromIdx and toIdx shift up
              if (idx > draggedFromIdx && idx <= draggedToIdx) {
                isShifted = true; shiftAmount = -draggedHeight;
              }
            } else if (draggedFromIdx > draggedToIdx) {
              // moving up: pillars between toIdx and fromIdx shift down
              if (idx >= draggedToIdx && idx < draggedFromIdx) {
                isShifted = true; shiftAmount = draggedHeight;
              }
            }
          }

          return (
            <PillarBox key={pillar.id}
                       pillar={pillar}
                       state={pillarState[pillar.id]}
                       onToggle={toggle}
                       onPushTask={pushOne} onDropTask={dropOne} onWeeklyTask={weeklyOne}
                       onPushMany={pushMany} onDropMany={dropMany} onWeeklyMany={weeklyMany}
                       removedIds={removed}
                       taskStatuses={taskStatuses}
                       onTaskStatusChange={updateTaskStatus}
                       onTaskEstChange={updateTaskEst}
                       onTaskDepthChange={updateTaskDepth}
                       onAssignPillar={writeTaskPillar}
                       onReorderStart={startReorder}
                       isDragging={isDragging}
                       dragOffsetY={isDragging ? reorder.dy : 0}
                       isShifted={isShifted}
                       shiftAmount={shiftAmount}
                       dragHandleRef={(el) => pillarRefs.current[pillar.id] = el}
                       registerProject={registerProject}
                       registerPillar={registerPillar}
                       getGlobalCrossTarget={getGlobalCrossTarget}
                       onCrossReassign={onCrossReassign}
                       globalReassignedOut={reassignedOut}
                       globalProjectAdditions={projectAdditions}
                       globalOpenAdditions={openAdditions}
                       globalDropTargetId={globalDropTargetId} />
          );
        })}

        {allCollapsed ? (
          <button className="push-next" onClick={onPushNext}>
            <span>schedule the day</span>
            <span className="push-next-hint">page 3 →</span>
          </button>
        ) : (
          <div className="triage-blocked">
            {PILLARS.length - collapsedCount} more pillar{PILLARS.length - collapsedCount === 1 ? '' : 's'} to commit
          </div>
        )}
      </div>

      {toast && ReactDOM.createPortal(
        <div className="action-toast" key={toast.key}>
          <span className="action-toast-msg">
            {(() => {
              const isProject = toast.scope === 'project';
              const subject = isProject
                ? (toast.label ? `“${toast.label}”` : 'project')
                : (toast.n > 1 ? `${toast.n} tasks` : 'task');
              if (toast.kind === 'pushed')  return `Pushed ${subject} to tomorrow`;
              if (toast.kind === 'dropped') return `Dropped ${subject}`;
              if (toast.kind === 'weekly')  return `Sent ${subject} to weekly review`;
              return '';
            })()}
          </span>
          <button className="action-toast-undo" onClick={undoToast}>undo</button>
        </div>,
        // Anchor to .phone so the toast is pinned to the viewport bottom,
        // not the (scrollable) .page container — otherwise it'd be parked
        // at the bottom of scroll content, out of view.
        document.querySelector('.phone') || document.body
      )}
    </div>
  );
}

