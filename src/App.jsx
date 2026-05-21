import { useEffect, useRef, useState } from 'react'
import { Welcome } from './surfaces/Welcome.jsx'
import { Morning } from './surfaces/Morning.jsx'
import { Triage } from './surfaces/Triage.jsx'
import { Scheduling } from './surfaces/Scheduling.jsx'
import { Live } from './surfaces/Live.jsx'
import { PillarBlockView } from './surfaces/PillarBlockView.jsx'
import { DayOverlay } from './surfaces/DayOverlay.jsx'
import { usePlacedBlocks } from './lib/usePlacedBlocks.js'

const TODAY_KEY = 'today.lastOpened'
const PAGE_KEY = 'today.lastPage'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

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

  const [activePage, setActivePage] = useState(initialIdx)
  const { placed, setPlaced } = usePlacedBlocks()
  const [remainingMinsByPillar, setRemainingMinsByPillar] = useState({})
  const [dayOverlay, setDayOverlay] = useState(null)
  const [openBlock, setOpenBlock] = useState(null)

  const pagerRef = useRef(null)

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

  // Horizontal swipe to yesterday/tomorrow was firing too often on Triage's
  // task list (swipe-right/left there sets task status / time). Disabled —
  // use the yesterday/tomorrow buttons in the day spine instead.

  const currentPage = pages[activePage]
  const showDaySpine = currentPage !== 'welcome'

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

        <DayOverlay kind={dayOverlay} onClose={() => setDayOverlay(null)} />

        {openBlock && <PillarBlockView block={openBlock} onClose={() => setOpenBlock(null)} />}
      </div>
    </div>
  )
}
