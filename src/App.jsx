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
  // First-open-of-day: show welcome only if today != last-opened day.
  const lastOpened = typeof localStorage !== 'undefined' ? localStorage.getItem(TODAY_KEY) : null
  const lastPage = typeof localStorage !== 'undefined' ? localStorage.getItem(PAGE_KEY) : null
  const isFirstOpenToday = lastOpened !== todayISO()

  const pages = isFirstOpenToday
    ? ['welcome', 'morning', 'triage', 'scheduling', 'live']
    : ['morning', 'triage', 'scheduling', 'live']

  // Resume rule: first-open → welcome (idx 0); else last page if known, else live.
  const initialIdx = isFirstOpenToday
    ? 0
    : Math.max(0, pages.indexOf(lastPage ?? 'live'))

  const [activePage, setActivePage] = useState(initialIdx)
  const [placed, setPlaced] = useState(seedPlacedBlocks)
  const [remainingMinsByPillar, setRemainingMinsByPillar] = useState({})
  const [dayOverlay, setDayOverlay] = useState(null)
  const [openBlock, setOpenBlock] = useState(null)

  const pagerRef = useRef(null)
  const phoneRef = useRef(null)

  // Persist last-opened date + last page.
  useEffect(() => {
    localStorage.setItem(TODAY_KEY, todayISO())
  }, [])

  useEffect(() => {
    const name = pages[activePage]
    if (name && name !== 'welcome') localStorage.setItem(PAGE_KEY, name)
  }, [activePage, pages])

  // Initial scroll-to-page.
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
          {isFirstOpenToday && <Welcome onSwipeUp={() => goToPage(1)} />}
          <Morning onOpenYesterday={() => setDayOverlay('yesterday')} />
          <Triage
            onPushNext={() => goToPage(isFirstOpenToday ? 3 : 2)}
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
