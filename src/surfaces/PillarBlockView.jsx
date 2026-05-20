export function PillarBlockView({ block, onClose }) {
  return (
    <div className="day-overlay visible" style={{ background: 'var(--bg-canvas)' }}>
      <button className="day-overlay-close" onClick={onClose}>
        close
      </button>
      <div className="day-overlay-title">{block?.title ?? 'Pillar Block'}</div>
      <div className="day-overlay-sub">Focus surface — task editor + pomodoro</div>
    </div>
  )
}
