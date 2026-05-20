import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IconRegen } from '../icons.jsx'
import { MANTRA as FALLBACK_MANTRA, CAL_EVENTS } from '../data.js'

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function formatRelative(minutes) {
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `in ${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `in ${h}h ${m}m` : `in ${h}h`
}

export function Welcome({ onSwipeUp }) {
  const today = new Date()
  const day = today.toLocaleDateString('en-US', { weekday: 'long' })
  const date = today.getDate()
  const monthYear = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const [mantra, setMantra] = useState(FALLBACK_MANTRA)
  const [regenSpinning, setRegenSpinning] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('mantras')
      .select('text')
      .then(({ data, error }) => {
        if (cancelled || error || !data?.length) return
        setMantra({ text: pickRandom(data).text, source: '' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // First-up event: mock for now. Real wire-up will use a Shortcut-pushed gcal table.
  const firstUp = CAL_EVENTS[0]
  const [fh, fm] = firstUp.start.split(':').map((n) => parseInt(n, 10))
  const eventDate = new Date(today)
  eventDate.setHours(fh, fm, 0, 0)
  const minutesUntil = Math.round((eventDate - today) / 60000)
  const eventTimeLabel = eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  const handleRegen = () => {
    setRegenSpinning(true)
    setTimeout(() => setRegenSpinning(false), 900)
  }

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
          <div className="welcome-mantra-text">{mantra.text}</div>
          {mantra.source && <div className="welcome-mantra-source">— {mantra.source}</div>}
        </div>

        <div className="welcome-spacer"></div>

        <div className="welcome-bottom">
          <div className="firstup-label">
            <span>first up</span>
            <button
              className={`regen-btn ${regenSpinning ? 'spinning' : ''}`}
              title="Pull latest calendar"
              onClick={handleRegen}
            >
              <IconRegen />
            </button>
          </div>
          <div className="firstup-content">
            <span className="firstup-title">{firstUp.title}</span>
            <span className="firstup-meta">
              {eventTimeLabel}
              <span className="firstup-relative">· {formatRelative(minutesUntil)}</span>
            </span>
          </div>
        </div>

        <button
          className="swipe-hint welcome-swipe"
          onClick={onSwipeUp}
          style={{ background: 'transparent', border: 'none', width: '100%' }}
        >
          <span className="arrow">↑</span>
          <span>swipe to begin</span>
        </button>
      </div>
    </div>
  )
}
