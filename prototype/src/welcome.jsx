// welcome.jsx — first-open threshold surface.

function Welcome({ onSwipeUp }) {
  const { TODAY_DATE, MANTRA } = window.TODAY_DATA;
  const day = TODAY_DATE.toLocaleDateString('en-US', { weekday: 'long' });
  const date = TODAY_DATE.getDate();
  const monthYear = TODAY_DATE.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="page" data-screen-label="00 Welcome">
      <div className="welcome">
        <div className="welcome-top">
          <div className="welcome-day">{day}</div>
          <div className="welcome-date">
            {date}
            <span className="month">{monthYear}</span>
          </div>
        </div>

        <div className="welcome-mantra">
          <div className="welcome-mantra-label">mantra</div>
          <div className="welcome-mantra-text">{MANTRA.text}</div>
          <div className="welcome-mantra-source">— {MANTRA.source}</div>
        </div>

        <div className="welcome-spacer"></div>

        <div className="welcome-bottom">
          <div className="firstup-label">
            <span>first up</span>
            <button className="regen-btn" title="Pull latest calendar">
              <window.IconRegen />
            </button>
          </div>
          <div className="firstup-content">
            <span className="firstup-title">Call with Jon</span>
            <span className="firstup-meta">
              10:00 AM<span className="firstup-relative">· in 2h 36m</span>
            </span>
          </div>
        </div>

        <button className="swipe-hint welcome-swipe" onClick={onSwipeUp}
                style={{ background: 'transparent', border: 'none', width: '100%' }}>
          <span className="arrow">↑</span>
          <span>swipe to begin</span>
        </button>
      </div>
    </div>);

}

Object.assign(window, { Welcome });