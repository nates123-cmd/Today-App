// morning.jsx — Page one. Passive grounding.

function Morning({ onOpenYesterday }) {
  const { OURA, HEALTH_INSIGHT, TIDE_HABITS, TIDE_BACKFILL, GROUNDING } = window.TODAY_DATA;
  const [habits, setHabits] = React.useState(TIDE_HABITS);
  const [backfill, setBackfill] = React.useState(TIDE_BACKFILL);
  const [insightVersion, setInsightVersion] = React.useState(0);
  const [ouraSyncing, setOuraSyncing] = React.useState(false);
  const [ouraSyncedAt, setOuraSyncedAt] = React.useState('synced 6:42a');

  const toggle = (id, list, setList) =>
    setList(list.map(h => h.id === id ? { ...h, checked: !h.checked } : h));

  const insights = [
    'HRV up, RHR down. Body is recovered. Schedule the hard work this morning.',
    'Sleep solid (7h12m). Cognitive load can be heavy today.',
    'Temp neutral. No infection signal. Train normally.',
  ];

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
                        setOuraSyncing(true);
                        setTimeout(() => {
                          setOuraSyncing(false);
                          const now = new Date();
                          const h = ((now.getHours() % 12) || 12);
                          const m = String(now.getMinutes()).padStart(2, '0');
                          const ap = now.getHours() < 12 ? 'a' : 'p';
                          setOuraSyncedAt(`synced ${h}:${m}${ap}`);
                        }, 900);
                      }}>
                <window.IconRegen />
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

        {/* Insight — clickable, also links to Tide */}
        <div className="morning-card clickable"
             role="link" tabIndex={0}
             title="Open Tide for full insight"
             onClick={() => console.log('→ Tide')}>
          <div className="morning-card-label">
            <span>insight</span>
            <button className="regen-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setInsightVersion(v => (v + 1) % insights.length); }}>
              <window.IconRegen />
            </button>
          </div>
          <div className="insight-text fade-in" key={insightVersion}>{insights[insightVersion]}</div>
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
                      onClick={() => toggle(h.id, habits, setHabits)}>
                <window.IconCheck />
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
              const I = window.groundingIcons[g.name];
              return (
                <button key={i} className="grounding-tile">
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

Object.assign(window, { Morning });
