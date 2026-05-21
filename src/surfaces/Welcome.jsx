import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IconRegen } from '../icons.jsx'
import { MANTRA as FALLBACK_MANTRA } from '../data.js'

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

// Pick the next meeting after now (or the first of the day if all are past).
function pickFirstUp(placed, now) {
  const meetings = (placed ?? [])
    .filter((b) => b.type === 'meeting')
    .sort((a, b) => a.hour - b.hour)
  if (!meetings.length) return null
  const nowDecimal = now.getHours() + now.getMinutes() / 60
  return meetings.find((b) => b.hour + b.duration / 60 > nowDecimal) ?? meetings[0]
}

export function Welcome({ placed, onSwipeUp }) {
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

  const firstUp = pickFirstUp(placed, today)
  let eventTimeLabel = null
  let minutesUntil = null
  if (firstUp) {
    const fh = Math.floor(firstUp.hour)
    const fm = Math.round((firstUp.hour - fh) * 60)
    const eventDate = new Date(today)
    eventDate.setHours(fh, fm, 0, 0)
    minutesUntil = Math.round((eventDate - today) / 60000)
    eventTimeLabel = eventDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

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
            {firstUp ? (
              <>
                <span className="firstup-title">{firstUp.title}</span>
                <span className="firstup-meta">
                  {eventTimeLabel}
                  <span className="firstup-relative">· {formatRelative(minutesUntil)}</span>
                </span>
              </>
            ) : (
              <span className="firstup-title" style={{ opacity: 0.6 }}>
                nothing scheduled
              </span>
            )}
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
