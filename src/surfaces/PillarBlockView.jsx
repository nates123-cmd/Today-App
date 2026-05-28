// PillarBlockView — drill-in from page 4. The lock-in surface.

import React from 'react'
import { IconCheck, IconPause } from '../icons.jsx'
import { usePillars } from '../lib/usePillars.js'
import { surfaceActions } from '../lib/surfaceActions.js'

const PILLAR_NAMES = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', sidegig: 'Side gig', open: 'Open Tasks' }

function formatProjectDue(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

function FocusTimer({ pillarColor }) {
  const [seconds, setSeconds] = React.useState(25 * 60);
  const [running, setRunning] = React.useState(false);
  const [mode, setMode] = React.useState(null); // 'local' | 'shortcut' | null

  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { setRunning(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const start = (m) => { setMode(m); setRunning(true); };
  const stop = () => setRunning(false);
  const reset = () => { setRunning(false); setSeconds(25 * 60); setMode(null); };

  return (
    <div className={`focus-timer ${running ? 'running' : ''}`}>
      <div className="focus-display">
        <div className="focus-time">{mm}:{ss}</div>
        <div className="focus-mode">
          {running ? (mode === 'shortcut' ? 'shortcut · dnd on' : 'local · ticking')
                   : 'pomodoro · 25 min'}
        </div>
      </div>
      <div className="focus-actions">
        {!running ? (
          <>
            <button className="focus-btn" onClick={() => start('local')}>
              local
              <span className="sublabel">just count</span>
            </button>
            <button className="focus-btn primary" onClick={() => start('shortcut')}>
              shortcut
              <span className="sublabel">dnd · focus · murmur</span>
            </button>
          </>
        ) : (
          <>
            <button className="focus-btn" onClick={stop}><IconPause /></button>
            <button className="focus-btn" onClick={reset}>reset</button>
          </>
        )}
      </div>
    </div>
  );
}

function PBlockTask({ task, onToggleDone, urgent }) {
  const done = task.status === 'done';
  const status = task.status;
  const due = urgent ? formatProjectDue(task.doDate) : null;

  return (
    <div className={`pblock-task ${done ? 'done' : ''} ${urgent ? 'urgent' : ''}`}>
      <div className={`pblock-task-check ${done ? 'done' : ''}`}
           onClick={(e) => { e.stopPropagation(); onToggleDone(task.id, done ? 'open' : 'done'); }}>
        {done && <IconCheck w={10} />}
      </div>
      <div className="pblock-task-body">{task.label}</div>
      {due && <div className="pblock-task-due">{due}</div>}
      {status && status !== 'open' && status !== 'done' && (
        <div className={`pblock-task-status ${status}`}>{status}</div>
      )}
      {task.est && <div className="pblock-task-status">{task.est}</div>}
    </div>
  );
}

function nextUpcoming(placed, nowDecimal) {
  if (!placed) return null;
  return placed
    .filter(b => b.hour > nowDecimal)
    .sort((a, b) => a.hour - b.hour)[0] ?? null;
}

export function PillarBlockView({ block, placed, onClose }) {
  const { pillars, updateTaskStatus } = usePillars();
  // Per-project disclosure: collapsed by default; expand reveals the rest of
  // the open task list beneath the surfaced action(s).
  const [expanded, setExpanded] = React.useState(() => new Set());
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const today = new Date();

  if (!block) return null;

  const pillar = pillars.find(p => p.id === block.pillar);
  const pillarName = pillar?.name ?? PILLAR_NAMES[block.pillar] ?? 'Block';
  const colorClass = block.pillar || block.type || 'open';

  // If the block is tied to a specific Course project, show just that one.
  // Otherwise show every project under this pillar.
  const projects = pillar
    ? (block.projectId
        ? pillar.projects.filter(p => p.id === block.projectId)
        : pillar.projects)
    : [];
  // Orphan tasks tagged with this pillar (project_id null in course_tasks).
  // Hidden when the block is scoped to a specific project — those open tasks
  // aren't part of that project's work.
  const openTasks = pillar && !block.projectId ? (pillar.openTasks ?? []) : [];

  const now = new Date();
  const nowDecimal = now.getHours() + now.getMinutes() / 60;
  const next = nextUpcoming(placed, nowDecimal);
  let nudge = null;
  if (next) {
    const mins = Math.max(1, Math.round((next.hour - nowDecimal) * 60));
    nudge = `next ${next.type === 'meeting' ? 'event' : 'block'} in ${mins} min · ${next.title}`;
  }

  return (
    <div className="pblock-overlay visible">
      <div className="pblock-top">
        <div>
          <div className="pblock-title">
            <span className={`pillar-dot ${colorClass}`}></span>
            {pillarName}
          </div>
          <div className="pblock-sub" style={{ marginTop: 6 }}>{block.title}</div>
          {nudge && <div className="pblock-next-nudge">{nudge}</div>}
        </div>
        <button className="pblock-close" onClick={onClose}>close ↓</button>
      </div>

      <div className="pblock-body">
        {projects.length === 0 && openTasks.length === 0 && (
          <div className="pblock-project">
            <div className="pblock-project-meta">
              {pillar ? 'no active projects or open tasks in this pillar' : 'loading…'}
            </div>
          </div>
        )}
        {projects.map(project => {
          const open = project.tasks; // already incomplete, in project order
          const sa = surfaceActions(open, today);
          const surfaced = sa.state === 'urgent_double'
            ? [sa.primary, sa.secondary]
            : sa.state === 'empty' ? [] : [sa.primary];
          const urgentId = sa.state.startsWith('urgent') ? sa.primary.id : null;
          const surfacedIds = new Set(surfaced.map(t => t.id));
          const remaining = open.filter(t => !surfacedIds.has(t.id));
          const isExp = expanded.has(project.id);
          return (
            <div key={project.id} className="pblock-project">
              <div className="pblock-project-name">
                <span>{project.name}</span>
                {formatProjectDue(project.dueDate) && (
                  <span className="pblock-project-due">{formatProjectDue(project.dueDate)}</span>
                )}
              </div>
              <div className="pblock-project-meta">{project.meta}</div>
              {project.outcome && (
                <div className="pblock-project-outcome">{project.outcome}</div>
              )}
              {sa.state === 'empty' ? (
                <div className="pblock-project-meta" style={{ opacity: 0.6 }}>
                  no next action
                </div>
              ) : (
                <>
                  {surfaced.map(t => (
                    <PBlockTask key={t.id} task={t} urgent={t.id === urgentId} onToggleDone={updateTaskStatus} />
                  ))}
                  {isExp && remaining.map(t => (
                    <PBlockTask key={t.id} task={t} urgent={t.id === urgentId} onToggleDone={updateTaskStatus} />
                  ))}
                </>
              )}
              {sa.count > 0 && (
                <div className="pblock-project-expand" onClick={() => toggleExpand(project.id)}>
                  <span className={`pblock-expand-chev ${isExp ? 'open' : ''}`}>›</span>
                  <span>{isExp ? 'Show less' : `+${sa.count} more`}</span>
                </div>
              )}
            </div>
          );
        })}
        {openTasks.length > 0 && (
          <div className="pblock-project">
            <div className="pblock-project-name">Open tasks</div>
            <div className="pblock-project-meta">unassigned to a project</div>
            {openTasks.map(t => (
              <PBlockTask key={t.id} task={t} onToggleDone={updateTaskStatus} />
            ))}
          </div>
        )}
        <div style={{ height: 220 }} />
      </div>

      <FocusTimer pillarColor={colorClass} />
    </div>
  );
}

