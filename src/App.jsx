import { useEffect, useRef, useState } from 'react'
import { Welcome } from './surfaces/Welcome.jsx'
import { Morning } from './surfaces/Morning.jsx'
import { Triage } from './surfaces/Triage.jsx'
import { Scheduling } from './surfaces/Scheduling.jsx'
import { Live } from './surfaces/Live.jsx'
import { PillarBlockView } from './surfaces/PillarBlockView.jsx'
import { CAL_EVENTS, ROUTINES } from './data.js'

const TODAY_KEY = 'today.lastOpened'
const PAGE_KEY = 'today.lastPage'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function seedPlacedBlocks() {
  const out = []
  CAL_EVENTS.forEach((e) => {
    const [sh, sm] = e.start.split(':').map((n) => parseInt(n, 10))
    const [eh, em] = e.end.split(':').map((n) => parseInt(n, 10))
    const dur = eh * 60 + (em || 0) - (sh * 60 + (sm || 0))
    out.push({
      id: e.id,
      type: 'meeting',
      hour: sh + (sm || 0) / 60,
      duration: dur,
      title: e.title,
      pillar: null,
    })
  })
  ROUTINES.filter((r) => r.autoPlaced).forEach((r) => {
    out.push({
      id: r.id,
      type: 'routine',
      hour: r.hour,
      duration: r.duration,
      title: r.name,
      pillar: null,
    })
  })
  return out
}

function DayOverlayStub({ kind, onClose }) {
  if (!kind) return null
  return (
    <div
      className={`day-overlay ${kind === 'yesterday' ? 'in-left' : 'in-right'} visible`}
      data-screen-label={kind === 'yesterday' ? '← Yesterday' : '→ Tomorrow'}
    >
      <button className="day-overlay-close" onClick={onClose}>
        close
      </button>
      <div className="day-overlay-title">
        {kind === 'yesterday' ? 'Yesterday' : 'Tomorrow'}
      </div>
      <div className="day-overlay-sub">
        {kind === 'yesterday' ? 'reflection — port pending' : 'preview — port pending'}
      </div>
    </div>
  )
}

export default function App() {
  // Capture session-stable values once. Recomputing these on every render
  // (especially after the first localStorage write) was making the pages
  // array shrink mid-session and the pager bounce between welcome and morning.
  const [isFirstOpenToday] = useState(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(TODAY_KEY) !== todayISO()
  })

  const [pages] = useState(() =>
    isFirstOpenToday
      ? ['welcome', 'morning', 'triage', 'scheduling', 'live']
      : ['morning', 'triage', 'scheduling', 'live']
  )

  const [initialIdx] = useState(() => {
    if (isFirstOpenToday) return 0
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(PAGE_KEY) : null
    const candidate = pages.indexOf(last ?? 'live')
    return candidate < 0 ? pages.indexOf('live') : candidate
  })

  const [activePage, setActivePage] = useState(initialIdx)
  const [placed, setPlaced] = useState(seedPlacedBlocks)
  const [remainingMinsByPillar, setRemainingMinsByPillar] = useState({})
  const [dayOverlay, setDayOverlay] = useState(null)
  const [openBlock, setOpenBlock] = useState(null)

  const pagerRef = useRef(null)
  const phoneRef = useRef(null)

  // Persist last-page + mark today as "opened" once the user moves past
  // welcome. Staying on welcome and reloading should still show welcome —
  // the ritual hasn't begun yet.
  useEffect(() => {
    const name = pages[activePage]
    if (!name || name === 'welcome') return
    localStorage.setItem(PAGE_KEY, name)
    if (isFirstOpenToday) localStorage.setItem(TODAY_KEY, todayISO())
  }, [activePage, pages, isFirstOpenToday])

  // Initial scroll-to-page (runs once — initialIdx is session-stable).
  useEffect(() => {
    if (!pagerRef.current) return
    pagerRef.current.scrollTop = initialIdx * pagerRef.current.clientHeight
  }, [initialIdx])

  const onPagerScroll = (e) => {
    const idx = Math.round(e.target.scrollTop / e.target.clientHeight)
    if (idx !== activePage) setActivePage(idx)
  }

  const goToPage = (idx) => {
    if (!pagerRef.current) return
    pagerRef.current.scrollTo({
      top: idx * pagerRef.current.clientHeight,
      behavior: 'smooth',
    })
  }

  // Horizontal swipe for day spine.
  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    const el = phoneRef.current
    if (!el) return
    const onTouchStart = (e) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      tracking = true
    }
    const onTouchEnd = (e) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.6 && !dayOverlay) {
        setDayOverlay(dx < 0 ? 'tomorrow' : 'yesterday')
      }
    }
    el.addEventListener('touchstart', onTouchStart)
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [dayOverlay])

  const currentPage = pages[activePage]
  const showDaySpine = currentPage !== 'welcome'

  return (
    <div className="stage">
      <div className="phone" ref={phoneRef}>
        <div className="status-bar">
          <span>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="right">●●●</span>
        </div>

        <div className="pager" ref={pagerRef} onScroll={onPagerScroll}>
          {isFirstOpenToday && (
            <Welcome onSwipeUp={() => goToPage(pages.indexOf('morning'))} />
          )}
          <Morning onOpenYesterday={() => setDayOverlay('yesterday')} />
          <Triage
            onPushNext={() => goToPage(pages.indexOf('scheduling'))}
            onRemainingMinsChange={setRemainingMinsByPillar}
          />
          <Scheduling
            placed={placed}
            setPlaced={setPlaced}
            remainingMinsByPillar={remainingMinsByPillar}
          />
          <Live placed={placed} onOpenBlock={setOpenBlock} />
        </div>

        <div className="dot-rail">
          {pages.map((p, i) => (
            <div key={p} className={`dot ${i === activePage ? 'active' : ''}`} title={p}></div>
          ))}
        </div>

        {showDaySpine && (
          <div className="day-spine">
            <button
              type="button"
              className="day-spine-btn"
              onClick={() => setDayOverlay('yesterday')}
            >
              <span>yesterday</span>
            </button>
            <button type="button" className="day-spine-btn current">
              <span>today</span>
            </button>
            <button
              type="button"
              className="day-spine-btn"
              onClick={() => setDayOverlay('tomorrow')}
            >
              <span>tomorrow</span>
            </button>
          </div>
        )}

        <DayOverlayStub kind={dayOverlay} onClose={() => setDayOverlay(null)} />

        {openBlock && <PillarBlockView block={openBlock} onClose={() => setOpenBlock(null)} />}
      </div>
    </div>
  )
}
