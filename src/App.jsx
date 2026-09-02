import { useEffect, useRef, useState } from 'react'
import { Welcome } from './surfaces/Welcome.jsx'
import { Morning } from './surfaces/Morning.jsx'
import { Triage } from './surfaces/Triage.jsx'
import { Scheduling } from './surfaces/Scheduling.jsx'
import { Live } from './surfaces/Live.jsx'
import { PillarBlockView } from './surfaces/PillarBlockView.jsx'
import { DayOverlay } from './surfaces/DayOverlay.jsx'
import { usePlacedBlocks } from './lib/usePlacedBlocks.js'
import { todayISO, isPlanningTomorrow } from './lib/day.js'

const TODAY_KEY = 'today.lastOpened'
const PAGE_KEY = 'today.lastPage'

export default function App() {
  // Capture session-stable values once. Recomputing these on every render
  // (especially after the first localStorage write) was making the pages
  // array shrink mid-session and the pager bounce between welcome and morning.
  const [isFirstOpenToday] = useState(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(TODAY_KEY) !== todayISO()
  })

  // Welcome is always in the pager so it stays reachable via swipe-up. On
  // first open of the day we land on it; on subsequent opens we resume
  // where we left off.
  const [pages] = useState(() => ['welcome', 'morning', 'triage', 'scheduling', 'live'])

  const [initialIdx] = useState(() => {
    if (isFirstOpenToday) return pages.indexOf('welcome')
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(PAGE_KEY) : null
    const candidate = pages.indexOf(last ?? 'morning')
    return candidate < 0 ? pages.indexOf('morning') : candidate
  })

  // After the 7pm handover today's plan is spent, so the app opens straight on
  // tomorrow rather than on whichever of today's surfaces you last used. The
  // overlay is dismissable — this changes where you LAND, it doesn't lock today
  // away.
  const [activePage, setActivePage] = useState(initialIdx)
  const { placed, setPlaced, dismiss } = usePlacedBlocks()
  const [remainingMinsByPillar, setRemainingMinsByPillar] = useState({})
  const [dayOverlay, setDayOverlay] = useState(() => (isPlanningTomorrow() ? 'tomorrow' : null))
  const [openBlock, setOpenBlock] = useState(null)

  const pagerRef = useRef(null)
  const activePageRef = useRef(initialIdx)
  activePageRef.current = activePage

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
    // 'instant' matters: the pager sets scroll-behavior: smooth, and an
    // animated jump here gets interrupted by scroll-snap and lands back on
    // page 0.
    pagerRef.current.scrollTo({ top: initialIdx * pagerRef.current.clientHeight, behavior: 'instant' })
  }, [initialIdx])

  // Page offsets are computed from the pager's pixel height, so a window
  // resize or an iPad rotation leaves the scroll position mid-page. Re-pin to
  // the active page whenever the pager changes size.
  useEffect(() => {
    const el = pagerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      el.scrollTo({ top: activePageRef.current * el.clientHeight, behavior: 'instant' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  // Horizontal swipe to yesterday/tomorrow was firing too often on Triage's
  // task list (swipe-right/left there sets task status / time). Disabled —
  // use the yesterday/tomorrow buttons in the day spine instead.

  const currentPage = pages[activePage]
  const showDaySpine = currentPage !== 'welcome'
  // Recomputed per render (not captured once) so the spine flips at 7pm even
  // if the app has been sitting open since the afternoon.
  const planningTomorrow = isPlanningTomorrow()

  return (
    <div className="stage">
      <div className="phone">
        <div className="pager" ref={pagerRef} onScroll={onPagerScroll}>
          <Welcome
            placed={placed}
            onSwipeUp={() => goToPage(pages.indexOf('morning'))}
          />
          <Morning onOpenYesterday={() => setDayOverlay('yesterday')} />
          <Triage
            placed={placed}
            onPushNext={() => goToPage(pages.indexOf('scheduling'))}
            onRemainingMinsChange={setRemainingMinsByPillar}
            onRemoveEvent={dismiss}
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
            <button
              type="button"
              className={`day-spine-btn ${planningTomorrow ? '' : 'current'}`}
              onClick={() => setDayOverlay(null)}
            >
              <span>today</span>
            </button>
            <button
              type="button"
              className={`day-spine-btn ${planningTomorrow ? 'current' : ''}`}
              onClick={() => setDayOverlay('tomorrow')}
            >
              <span>tomorrow</span>
            </button>
          </div>
        )}

        <DayOverlay kind={dayOverlay} onClose={() => setDayOverlay(null)} />

        {openBlock && <PillarBlockView block={openBlock} placed={placed} onClose={() => setOpenBlock(null)} />}
      </div>
    </div>
  )
}
