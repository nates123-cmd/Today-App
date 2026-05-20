// live.jsx — Page four. Workday home base.
// Hero treatment for the active block (auto-expanded subtask preview),
// compact past/future blocks, checkable open tasks.

function ActiveBlockCard({ block, onOpenBlock }) {
  const { PILLARS } = window.TODAY_DATA;
  const pillar = PILLARS.find(p => p.id === block.pillar);
  // Heuristic: surface the project whose name best matches the block title
  const titleLower = block.title.toLowerCase();
  const project = pillar?.projects.find(p =>
    titleLower.includes(p.name.toLowerCase().split(' ')[0])
  ) || pillar?.projects[0];

  const [done, setDone] = React.useState(new Set());
  const toggle = (id) => setDone(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  if (!pillar || !project) return null;

  const completed = project.tasks.filter(t => done.has(t.id)).length;

  return (
    <div className={`active-card ${pillar.color}`}>
      <div className="active-card-header">
        <div className="active-card-pillar">
          <span className={`pillar-dot ${pillar.color}`}></span>
          <span className="active-card-pillar-name">{pillar.name}</span>
          <span className="active-card-divider">·</span>
          <span className="active-card-project">{project.name}</span>
        </div>
        <div className="active-card-now">
          <span className="active-card-pulse"></span>
          16 min left
        </div>
      </div>

      <div className="active-card-title">{block.title.replace(`${pillar.name} · `, '')}</div>

      <div className="active-card-tasks">
        {project.tasks.map(t => (
          <div key={t.id} className={`active-task ${done.has(t.id) ? 'done' : ''}`}
               onClick={() => toggle(t.id)}>
            <div className={`active-task-check ${done.has(t.id) ? 'checked' : ''}`}>
              {done.has(t.id) && <window.IconCheck w={11} />}
            </div>
            <div className="active-task-label">{t.label}</div>
            <div className="active-task-est">{t.est}</div>
          </div>
        ))}
      </div>

      <div className="active-card-footer">
        <span>{completed} / {project.tasks.length} done</span>
        <button className="active-card-open" onClick={() => onOpenBlock(block)}>
          focus ↗
        </button>
      </div>
    </div>
  );
}

// ─── Suggest-block overlay ───
// Full-bleed mini-surface that lets the user pick which block to start
// next. Shows the calendar-driven suggestion at the top, then a list of
// other "open right now" candidates. Supports multi-select — picking
// several queues them up back-to-back inside a single focus session.
function SuggestBlockOverlay({ primary, others, fmtTime, onClose, onDismiss }) {
  // Selection is a Set of keys. The primary suggestion's key is 'primary';
  // task keys are 'task:<id>'.
  const [selected, setSelected] = React.useState(() => new Set(['primary']));
  const [duration, setDuration]   = React.useState(25); // minutes

  const toggle = (key) => {
    setSelected(s => {
      const out = new Set(s);
      if (out.has(key)) out.delete(key);
      else out.add(key);
      return out;
    });
  };

  const selectedItems = React.useMemo(() => {
    const items = [];
    if (selected.has('primary')) {
      items.push({ kind: 'primary', label: primary.text.replace(/^"|"$/g, ''), pillar: primary.pillar });
    }
    others.forEach(t => {
      if (selected.has(`task:${t.id}`)) {
        items.push({ kind: 'task', id: t.id, label: t.label, pillar: t.pillar, est: t.est });
      }
    });
    return items;
  }, [selected, primary, others]);

  const n = selectedItems.length;
  const startLabel = n === 0 ? 'select something'
                    : n === 1 ? `start focus · ${duration}m`
                              : `start focus · ${n} blocks`;
  const startingLabel = n === 0 ? 'nothing selected'
                       : n === 1 ? selectedItems[0].label
                                 : `${n} blocks queued, starting with “${selectedItems[0].label}”`;

  return (
    <div className="suggest-overlay">
      <button className="suggest-overlay-close" onClick={onClose}>close</button>
      <div className="suggest-overlay-eyebrow">suggest a block</div>
      <div className="suggest-overlay-title">What's next?</div>
      <div className="suggest-overlay-sub">Pick one — or stack a few — and start a focus session.</div>

      <div className="suggest-overlay-section-label">calendar suggestion</div>
      {(() => {
        const isOn = selected.has('primary');
        return (
          <button className={`suggest-candidate primary ${isOn ? 'selected' : ''}`}
                  onClick={() => toggle('primary')}>
            <span className={`pillar-dot ${primary.pillar}`}></span>
            <div className="suggest-candidate-body">
              <div className="suggest-candidate-eyebrow">{primary.pillar} · suggested at {fmtTime(primary.hour)}</div>
              <div className="suggest-candidate-text">{primary.text.replace(/^"|"$/g, '')}</div>
            </div>
            <div className={`suggest-candidate-check ${isOn ? 'on' : ''}`}>
              {isOn && <window.IconCheck w={10} />}
            </div>
          </button>
        );
      })()}

      {others.length > 0 && (
        <>
          <div className="suggest-overlay-section-label">also open right now</div>
          <div className="suggest-candidate-list">
            {others.map(t => {
              const key = `task:${t.id}`;
              const isOn = selected.has(key);
              return (
                <button key={t.id}
                        className={`suggest-candidate ${isOn ? 'selected' : ''}`}
                        onClick={() => toggle(key)}>
                  <span className={`pillar-dot ${t.pillar}`}></span>
                  <div className="suggest-candidate-body">
                    <div className="suggest-candidate-text">{t.label}</div>
                    <div className="suggest-candidate-meta">{t.est} · {t.pillar}</div>
                  </div>
                  <div className={`suggest-candidate-check ${isOn ? 'on' : ''}`}>
                    {isOn && <window.IconCheck w={10} />}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="suggest-overlay-section-label">focus length</div>
      <div className="suggest-duration-row">
        {[15, 25, 45, 60].map(m => (
          <button key={m}
                  className={`suggest-duration-pill ${duration === m ? 'on' : ''}`}
                  onClick={() => setDuration(m)}>{m}m</button>
        ))}
      </div>

      <div className="suggest-overlay-actions">
        <button className="suggest-overlay-secondary" onClick={onDismiss}>not today</button>
        <button className="suggest-overlay-secondary" onClick={onClose}>snooze 1h</button>
        <button className="suggest-overlay-primary"
                disabled={n === 0}
                onClick={onClose}>
          {startLabel}
        </button>
      </div>

      <div className="suggest-overlay-target" title={startingLabel}>
        {n > 1 ? <>queued: <em>{n} blocks</em></> : <>starting: <em>{startingLabel}</em></>}
      </div>
    </div>
  );
}

function CompactBlock({ block, isPast, onOpenBlock }) {
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
         onClick={() => block.pillar && onOpenBlock(block)}>
      <div className="compact-block-stripe"></div>
      <div className="compact-block-content">
        <div className="compact-block-title">{block.title}</div>
        <div className="compact-block-meta">{meta}</div>
      </div>
    </div>
  );
}

function Live({ nowHour = 11, nowMinute = 14, placed: placedProp, onOpenBlock }) {
  const { PLACED_BLOCKS, SUGGESTIONS, OPEN_TASKS, PILLARS } = window.TODAY_DATA;
  // Use the lifted schedule from App when available; fall back to the static
  // demo data so the component still renders if mounted standalone.
  const PLACED = placedProp ?? PLACED_BLOCKS;
  const [showAllOpen, setShowAllOpen] = React.useState(false);
  const [suggestionAction, setSuggestionAction] = React.useState(null); // {kind, text, until}
  const [dismissedSuggestion, setDismissedSuggestion] = React.useState(false);
  const dateStr = window.TODAY_DATA.TODAY_DATE.toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric' });
  const nowTimeStr = `${nowHour > 12 ? nowHour - 12 : nowHour}:${String(nowMinute).padStart(2, '0')}`;

  // Group blocks into past / active / upcoming
  const nowDecimal = nowHour + nowMinute / 60;
  const activeBlock = PLACED.find(b =>
    nowDecimal >= b.hour && nowDecimal < b.hour + b.duration / 60 && b.pillar
  ) || PLACED.find(b => b.active);

  const past = PLACED
    .filter(b => b.hour + b.duration / 60 <= nowDecimal)
    .sort((a, b) => a.hour - b.hour);
  const upcoming = PLACED
    .filter(b => b.hour >= nowDecimal && b !== activeBlock)
    .sort((a, b) => a.hour - b.hour);

  // Checkable open tasks
  const [openDone, setOpenDone] = React.useState(new Set());
  const toggleOpen = (id) => setOpenDone(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Additional open tasks beyond the top 4 — aggregated from pillars/projects.
  const moreOpen = React.useMemo(() => {
    const rows = [];
    PILLARS.forEach(pillar => {
      (pillar.openTasks || []).forEach(t => rows.push({ ...t, pillar: pillar.id }));
      (pillar.projects || []).forEach(proj => {
        (proj.tasks || []).forEach(t => rows.push({ ...t, pillar: pillar.id, projectName: proj.name }));
      });
    });
    return rows.slice(0, 7);
  }, [PILLARS]);

  const visibleOpen = showAllOpen ? [...OPEN_TASKS, ...moreOpen] : OPEN_TASKS;

  // Optional: a next-up suggestion (first SUGGESTIONS entry after now)
  const nextSuggestion = SUGGESTIONS.find(s => s.hour > nowDecimal);

  const fmtTime = (h) => {
    const hr = Math.floor(h);
    const m = Math.round((h - hr) * 60);
    const mm = String(m).padStart(2, '0');
    const hr12 = hr > 12 ? hr - 12 : hr;
    return `${hr12}:${mm}${hr < 12 ? 'a' : 'p'}`;
  };

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
        {activeBlock && activeBlock.pillar ? (
          <ActiveBlockCard block={activeBlock} onOpenBlock={onOpenBlock} />
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

        {nextSuggestion && !dismissedSuggestion && (
          <button className="next-suggestion next-suggestion-btn"
                  onClick={() => setSuggestionAction({ open: true })}>
            <span className="suggestion-pillar">{nextSuggestion.pillar} · suggested next</span>
            <span className="suggestion-text">{nextSuggestion.text}</span>
          </button>
        )}

        {/* Suggest-block overlay — a dedicated surface that lets the user
            choose from a few candidate blocks (the calendar-suggested one +
            other open tasks they could pick up right now). */}
        {suggestionAction?.open && nextSuggestion && ReactDOM.createPortal(
          <SuggestBlockOverlay
            primary={nextSuggestion}
            others={OPEN_TASKS.slice(0, 4)}
            fmtTime={fmtTime}
            onClose={() => setSuggestionAction(null)}
            onDismiss={() => { setDismissedSuggestion(true); setSuggestionAction(null); }} />,
          document.body
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

        {/* Open Tasks with checkboxes */}
        <div className="open-tasks">
          <div className="open-tasks-header">
            <div className="open-tasks-title">Open tasks</div>
            <button className="open-tasks-see-more"
                    onClick={() => setShowAllOpen(v => !v)}>
              {showAllOpen ? 'show less ↑' : `See ${moreOpen.length} more →`}
            </button>
          </div>
          {visibleOpen.map(t => (
            <div className={`open-task ${openDone.has(t.id) ? 'done' : ''}`} key={t.id}>
              <button className={`open-task-check ${openDone.has(t.id) ? 'checked' : ''}`}
                      onClick={() => toggleOpen(t.id)}>
                {openDone.has(t.id) && <window.IconCheck w={10} />}
              </button>
              <div className={`open-task-dot ${t.pillar}`}></div>
              <div className="open-task-text">{t.label}</div>
              <div className="open-task-est">{t.est}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Live });
