// app.jsx — main shell. Vertical pager + horizontal day spine + Tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#c89456",
  "density": "regular",
  "triageProgress": "mid",
  "showWelcome": true,
  "startPage": "morning",
  "fontPairing": "fraunces"
} /*EDITMODE-END*/;

const ACCENT_OPTIONS = ['#c89456', '#9c7dc0', '#5b9aa6', '#c95f4e'];

function DayOverlay({ kind, visible, onClose }) {
  if (!visible) return null;
  const { YESTERDAY, TOMORROW, WEEK } = window.TODAY_DATA;

  // Yesterday: checkable habits (state lives here so closes don't reset)
  const [yHabits, setYHabits] = React.useState(() =>
  YESTERDAY.habits.reduce((acc, h) => {acc[h.id] = h.checked;return acc;}, {})
  );
  const toggleYHabit = (id) => setYHabits((s) => ({ ...s, [id]: !s[id] }));

  // Tomorrow: week overview collapsed by default, expand state
  const [weekExpanded, setWeekExpanded] = React.useState(false);
  const [tomorrowMode, setTomorrowMode] = React.useState('triage'); // 'triage' | 'schedule'
  // Tomorrow triage queue: which pillar rows are expanded (samples shown)
  const [tmrwExpanded, setTmrwExpanded] = React.useState(() => new Set());
  const toggleTmrwExpanded = (id) => setTmrwExpanded(s => {
    const out = new Set(s); out.has(id) ? out.delete(id) : out.add(id); return out;
  });

  const yCheckedCount = Object.values(yHabits).filter(Boolean).length;

  return (
    <div className={`day-overlay ${kind === 'yesterday' ? 'in-left' : 'in-right'} visible`}
    data-screen-label={kind === 'yesterday' ? '\u2190 Yesterday' : '\u2192 Tomorrow'}>
      <button className="day-overlay-close" onClick={onClose}>close</button>
      <div className="day-overlay-title">{kind === 'yesterday' ? 'Yesterday' : 'Tomorrow'}</div>
      <div className="day-overlay-sub">
        {kind === 'yesterday' ? 'monday · may 18 · reflection' : 'wednesday · may 20 · planning'}
      </div>

      {kind === 'yesterday' ?
      <>
          <div className="coming-soon-pill">first design pass</div>

          {/* Habit log — checkable for backfill */}
          <div className="morning-card-label" style={{ marginBottom: 8 }}>
            <span>habit log</span>
            <span style={{ color: 'var(--ink-secondary)' }}>{yCheckedCount} / {YESTERDAY.habits.length}</span>
          </div>
          <div className="morning-card" style={{ marginBottom: 16, padding: '4px 16px' }}>
            {YESTERDAY.habits.map((h) =>
          <div key={h.id} className={`tide-item ${yHabits[h.id] ? 'checked' : ''}`}>
                <button className={`tide-check ${yHabits[h.id] ? 'checked' : ''}`}
            onClick={() => toggleYHabit(h.id)}>
                  <window.IconCheck w={10} />
                </button>
                <div className="tide-label">{h.label}</div>
                <div className="tide-tag">{h.tag}</div>
              </div>
          )}
          </div>

          {/* Ink daily highlight */}
          <div className="morning-card-label" style={{ marginBottom: 8 }}>
            <span>daily highlight</span>
            <span style={{ color: 'var(--ink-faint)' }}>ink</span>
          </div>
          {YESTERDAY.highlight ?
        <div className="morning-card" style={{
          fontFamily: 'var(--font-display)', fontSize: 17,
          color: 'var(--ink-primary)', fontStyle: 'italic',
          lineHeight: 1.45, marginBottom: 20
        }}>
              "{YESTERDAY.highlight}"
            </div> :

        <div className="highlight-empty" style={{ marginBottom: 20 }}>
              <div className="highlight-empty-head">
                <span className="highlight-empty-datestamp">18M</span>
                <span className="highlight-empty-day">monday</span>
              </div>
              <div className="highlight-empty-prompt">What happened yesterday?</div>
            </div>
        }

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
        </> :

      <>
          <div className="coming-soon-pill">first design pass</div>

          {/* Week overview — collapsible */}
          <button className={`week-tile ${weekExpanded ? 'expanded' : ''}`}
        onClick={() => setWeekExpanded((v) => !v)}>
            <div className="week-tile-header">
              <span>this week</span>
              <span className="week-tile-chev">{weekExpanded ? '▴' : '▾'}</span>
            </div>
            <div className="week-tile-row">
              {WEEK.map((d, i) =>
            <div key={i} className={`week-cell ${d.isToday ? 'today' : ''} ${d.isTomorrow ? 'tomorrow' : ''} ${d.isPast ? 'past' : ''}`}>
                  <div className="week-cell-day">{d.day}</div>
                  <div className="week-cell-date">{d.date}</div>
                  <div className="week-cell-bar"
              style={{ height: Math.min(d.focusH * 8, 32) + 'px' }}></div>
                </div>
            )}
            </div>
            {weekExpanded &&
          <div className="week-tile-detail">
                {WEEK.map((d, i) =>
            <div key={i} className={`week-detail-row ${d.isTomorrow ? 'highlight' : ''} ${d.isToday ? 'current' : ''}`}>
                    <span className="week-detail-name">{d.label}</span>
                    <span className="week-detail-meta">
                      {d.meeting} meetings · {d.focusH}h focus · {d.blocks} blocks
                    </span>
                  </div>
            )}
              </div>
          }
          </button>

          {/* Mode toggle: triage vs schedule */}
          <div className="tmrw-mode-toggle">
            <button className={tomorrowMode === 'triage' ? 'active' : ''}
          onClick={() => setTomorrowMode('triage')}>Triage</button>
            <button className={tomorrowMode === 'schedule' ? 'active' : ''}
          onClick={() => setTomorrowMode('schedule')}>Schedule</button>
          </div>

          {tomorrowMode === 'triage' ?
        <>
              <div className="morning-card-label" style={{ marginBottom: 8 }}>
                <span>queued for triage</span>
                <span style={{ color: 'var(--ink-faint)' }}>tap when ready</span>
              </div>
              {TOMORROW.triageQueue.map((q, i) => {
                const isOpen = tmrwExpanded.has(q.pillar);
                const PILLAR_NAMES = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', open: 'Open Tasks' };
                return (
                  <div key={i} className={`pillar ${isOpen ? '' : 'collapsed'} tmrw-pillar`}>
                    <div className="pillar-header"
                         onClick={() => toggleTmrwExpanded(q.pillar)}>
                      <div className="pillar-name">
                        <span className={`pillar-dot ${q.pillar}`}></span>
                        <span className="pillar-title">{PILLAR_NAMES[q.pillar] || q.pillar}</span>
                      </div>
                      <div className="pillar-meta">
                        <div className="pillar-count">{q.count} queued</div>
                        <div className="pillar-chevron">▾</div>
                      </div>
                    </div>
                    <div className="pillar-body"
                         style={{ display: isOpen ? 'block' : 'none' }}>
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
                );
              })}
              <div className="tmrw-hint">
                triage opens tomorrow morning. these are tonight's drafts.
              </div>
            </> :

        <>
              <div className="morning-card-label" style={{ marginBottom: 8 }}>
                <span>hard-line events</span>
                <span style={{ color: 'var(--ink-faint)' }}>from gcal</span>
              </div>
              {TOMORROW.events.map((e, i) =>
          <div key={i} className="tmrw-list-item">
                  <div className="tmrw-list-item-time">{e.time}</div>
                  <div className="tmrw-list-item-title">{e.title}</div>
                </div>
          )}
              <div className="morning-card-label" style={{ marginTop: 24, marginBottom: 8 }}>
                <span>proposed schedule</span>
                <span style={{ color: 'var(--ink-faint)' }}>draggable tomorrow</span>
              </div>
              <div>
                {TOMORROW.proposed.map((p, i) =>
            <div key={i} className={`block ${p.pillar}`} style={{ marginBottom: 8 }}>
                    <div className="block-title">{p.label}</div>
                    <div className="block-detail">{p.detail}</div>
                  </div>
            )}
              </div>
            </>
        }
        </>
      }
    </div>);

}

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // ─── Shared day schedule ───
  // Lifted to App so Scheduling (where it's edited) and Live (where it's
  // viewed) stay in sync. Both screens read/write through these.
  //
  // Initial state: only the immovable items from external sources —
  // calendar meetings (Google Cal) + auto-placed routines. Everything else
  // (pillar work, manual routines, ad-hoc) the user schedules themselves.
  const { CAL_EVENTS, ROUTINES } = window.TODAY_DATA;
  const [placedBlocks, setPlacedBlocks] = React.useState(() => {
    const out = [];
    CAL_EVENTS.forEach((e) => {
      const [sh, sm] = e.start.split(':').map((n) => parseInt(n, 10));
      const [eh, em] = e.end.split(':').map((n) => parseInt(n, 10));
      const dur = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
      out.push({
        id: e.id, type: 'meeting',
        hour: sh + (sm || 0) / 60, duration: dur,
        title: e.title, pillar: null
      });
    });
    ROUTINES.filter((r) => r.autoPlaced).forEach((r) => {
      out.push({
        id: r.id, type: 'routine', hour: r.hour, duration: r.duration,
        title: r.name, pillar: null
      });
    });
    return out;
  });
  // Remaining task minutes per pillar — published by Triage as tasks are
  // completed / dropped / pushed. Scheduling uses this to size the dock's
  // time bank so the budget actually reflects what's left to do.
  const [remainingMinsByPillar, setRemainingMinsByPillar] = React.useState({});

  // Apply tweaks to the DOM
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme);
    document.documentElement.setAttribute('data-density', t.density);
    const root = document.documentElement.style;
    if (t.accent && t.accent !== TWEAK_DEFAULTS.accent) {
      root.setProperty('--accent', t.accent);
      // derive soft & faint
      root.setProperty('--accent-soft', t.accent + '33');
      root.setProperty('--accent-faint', t.accent + '14');
    } else {
      root.removeProperty('--accent');
      root.removeProperty('--accent-soft');
      root.removeProperty('--accent-faint');
    }
    if (t.fontPairing === 'inter') {
      root.setProperty('--font-display', "'Inter Tight', system-ui, sans-serif");
    } else if (t.fontPairing === 'mono') {
      root.setProperty('--font-display', "'JetBrains Mono', ui-monospace, monospace");
    } else {
      root.removeProperty('--font-display');
    }
  }, [t]);

  const pagerRef = React.useRef(null);
  const [activePage, setActivePage] = React.useState(0);
  const pages = t.showWelcome ?
  ['welcome', 'morning', 'triage', 'scheduling', 'live'] :
  ['morning', 'triage', 'scheduling', 'live'];

  // Initial scroll position
  React.useEffect(() => {
    const idx = pages.indexOf(t.startPage);
    if (idx < 0 || !pagerRef.current) return;
    pagerRef.current.scrollTop = idx * pagerRef.current.clientHeight;
    setActivePage(idx);
  }, [t.showWelcome, t.startPage]);

  // Track which page is in view
  const onPagerScroll = (e) => {
    const idx = Math.round(e.target.scrollTop / e.target.clientHeight);
    if (idx !== activePage) setActivePage(idx);
  };

  const goToPage = (idx) => {
    if (!pagerRef.current) return;
    pagerRef.current.scrollTo({ top: idx * pagerRef.current.clientHeight, behavior: 'smooth' });
  };

  // Day overlay state
  const [dayOverlay, setDayOverlay] = React.useState(null); // 'yesterday' | 'tomorrow' | null

  // Pillar block drill-in
  const [openBlock, setOpenBlock] = React.useState(null);

  // Horizontal swipe for day spine (on the whole phone)
  const phoneRef = React.useRef(null);
  React.useEffect(() => {
    let startX = 0,startY = 0,tracking = false;
    const el = phoneRef.current;if (!el) return;
    const onTouchStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };
    const onTouchEnd = (e) => {
      if (!tracking) return;tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        if (dx < 0 && !dayOverlay) setDayOverlay('tomorrow');else
        if (dx > 0 && !dayOverlay) setDayOverlay('yesterday');
      }
    };
    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [dayOverlay]);

  return (
    <div className="stage">
      <div className="phone" ref={phoneRef}>
        <div className="status-bar">
          <span>{t.startPage === 'live' ? '11:14' : '7:24'}</span>
          <span className="right">●●●</span>
        </div>

        <div className="pager" ref={pagerRef} onScroll={onPagerScroll}>
          {t.showWelcome &&
          <window.Welcome onSwipeUp={() => goToPage(1)} />
          }
          <window.Morning onOpenYesterday={() => setDayOverlay('yesterday')} />
          <window.Triage initialProgress={t.triageProgress}
          onPushNext={() => goToPage(t.showWelcome ? 3 : 2)}
          onRemainingMinsChange={setRemainingMinsByPillar} />
          <window.Scheduling placed={placedBlocks} setPlaced={setPlacedBlocks}
          remainingMinsByPillar={remainingMinsByPillar} />
          <window.Live nowHour={11} nowMinute={14}
          placed={placedBlocks}
          onOpenBlock={setOpenBlock} />
        </div>

        {/* Dot rail */}
        <div className="dot-rail">
          {pages.map((p, i) =>
          <div key={p}
          className={`dot ${i === activePage ? 'active' : ''}`}
          title={p}></div>
          )}
        </div>

        {/* Day spine — hidden on welcome (no nav chrome at the threshold) */}
        {pages[activePage] !== 'welcome' &&
        <div className="day-spine">
            <button type="button" className="day-spine-btn"
                    onClick={() => setDayOverlay('yesterday')}>
              <span>yesterday</span>
            </button>
            <button type="button" className="day-spine-btn current">
              <span>today</span>
            </button>
            <button type="button" className="day-spine-btn"
                    onClick={() => setDayOverlay('tomorrow')}>
              <span>tomorrow</span>
            </button>
          </div>
        }

        {/* Yesterday/Tomorrow overlay */}
        <DayOverlay kind={dayOverlay}
        visible={!!dayOverlay}
        onClose={() => setDayOverlay(null)} />

        {/* Pillar Block drill-in */}
        {openBlock &&
        <window.PillarBlockView block={openBlock}
        onClose={() => setOpenBlock(null)} />
        }
      </div>

      <window.TweaksPanel>
        <window.TweakSection label="Theme" />
        <window.TweakRadio label="Mode"
        value={t.theme}
        options={['dark', 'light']}
        onChange={(v) => setTweak('theme', v)} />
        <window.TweakColor label="Accent"
        value={t.accent}
        options={ACCENT_OPTIONS}
        onChange={(v) => setTweak('accent', v)} />
        <window.TweakSelect label="Type pairing"
        value={t.fontPairing}
        options={[
        { value: 'fraunces', label: 'Fraunces + Inter' },
        { value: 'inter', label: 'Inter Tight only' },
        { value: 'mono', label: 'JetBrains Mono display' }]
        }
        onChange={(v) => setTweak('fontPairing', v)} />
        <window.TweakRadio label="Density"
        value={t.density}
        options={['compact', 'regular', 'comfy']}
        onChange={(v) => setTweak('density', v)} />

        <window.TweakSection label="State" />
        <window.TweakSelect label="Start on"
        value={t.startPage}
        options={[
        { value: 'welcome', label: '0 · Welcome' },
        { value: 'morning', label: '1 · Morning' },
        { value: 'triage', label: '2 · Triage' },
        { value: 'scheduling', label: '3 · Scheduling' },
        { value: 'live', label: '4 · Live' }]
        }
        onChange={(v) => setTweak('startPage', v)} />
        <window.TweakSelect label="Triage progress"
        value={t.triageProgress}
        options={[
        { value: 'empty', label: 'untouched' },
        { value: 'mid', label: 'mid-triage' },
        { value: 'done', label: 'all committed' }]
        }
        onChange={(v) => setTweak('triageProgress', v)} />
        <window.TweakToggle label="Show welcome page"
        value={t.showWelcome}
        onChange={(v) => setTweak('showWelcome', v)} />
      </window.TweaksPanel>
    </div>);

}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);