export function Triage({ onPushNext }) {
  return (
    <div className="page" data-screen-label="02 Triage">
      <div className="surface-stub">
        <div className="surface-stub-label">page 2 of 4</div>
        <h2 className="surface-stub-title">Triage</h2>
        <p className="surface-stub-body">
          Active processing of every Pillar's open items. Swipe gestures, sticky
          headers, collapse = commit.
        </p>
        <button className="surface-stub-cta" onClick={onPushNext}>
          schedule the day →
        </button>
      </div>
    </div>
  )
}
