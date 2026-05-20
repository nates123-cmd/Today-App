// pillar-block.jsx — drill-in from page 4. The lock-in surface.

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
            <button className="focus-btn" onClick={stop}><window.IconPause /></button>
            <button className="focus-btn" onClick={reset}>reset</button>
          </>
        )}
      </div>
    </div>
  );
}

function PBlockTask({ task, initialStatus = 'active' }) {
  const [done, setDone] = React.useState(false);
  const [status, setStatus] = React.useState(initialStatus);
  const longPress = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const startLong = () => {
    longPress.current = setTimeout(() => setMenuOpen(true), 480);
  };
  const cancelLong = () => clearTimeout(longPress.current);

  const setSt = (s) => { setStatus(s); setMenuOpen(false); };

  return (
    <div className={`pblock-task ${done ? 'done' : ''}`}
         onMouseDown={startLong} onMouseUp={cancelLong} onMouseLeave={cancelLong}
         onTouchStart={startLong} onTouchEnd={cancelLong}>
      <div className={`pblock-task-check ${done ? 'done' : ''}`}
           onClick={(e) => { e.stopPropagation(); setDone(d => !d); }}>
        {done && <window.IconCheck w={10} />}
      </div>
      <div className="pblock-task-body">{task.label}</div>
      {status !== 'active' && (
        <div className={`pblock-task-status ${status}`}>{status}</div>
      )}
      <div className="pblock-task-status">{task.est}</div>
      {menuOpen && (
        <div className="decision-menu" style={{ top: 'auto', right: 6 }}
             onMouseLeave={() => setMenuOpen(false)}>
          <button onClick={() => setSt('active')}>active</button>
          <button onClick={() => setSt('waiting')}>waiting</button>
          <button onClick={() => setSt('blocked')}>blocked</button>
        </div>
      )}
    </div>
  );
}

function PillarBlockView({ block, onClose }) {
  const { PILLARS } = window.TODAY_DATA;
  const pillar = PILLARS.find(p => p.id === block?.pillar);

  if (!block || !pillar) return null;

  return (
    <div className={`pblock-overlay ${block ? 'visible' : ''}`}>
      <div className="pblock-top">
        <div>
          <div className="pblock-title">
            <span className={`pillar-dot ${pillar.color}`}></span>
            {pillar.name}
          </div>
          <div className="pblock-sub" style={{ marginTop: 6 }}>{block.title}</div>
          <div className="pblock-next-nudge">next event in 15 mins · Drane sync</div>
        </div>
        <button className="pblock-close" onClick={onClose}>close ↓</button>
      </div>

      <div className="pblock-body">
        {pillar.projects.slice(0, 2).map(project => (
          <div key={project.id} className="pblock-project">
            <div className="pblock-project-name">{project.name}</div>
            <div className="pblock-project-meta">{project.meta}</div>
            {project.tasks.map((t, i) => (
              <PBlockTask key={t.id} task={t}
                          initialStatus={i === 1 ? 'waiting' : 'active'} />
            ))}
          </div>
        ))}
        <div style={{ height: 220 }} />
      </div>

      <FocusTimer pillarColor={pillar.color} />
    </div>
  );
}

Object.assign(window, { PillarBlockView });
