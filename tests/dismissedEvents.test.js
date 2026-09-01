import { describe, it, expect } from 'vitest'
// REAL shipped dismissal logic — no re-implementation.
import {
  eventKey,
  isReingested,
  filterDismissed,
  countDismissed,
} from '../src/lib/dismissedEvents.js'

// Shaped like the real tomorrow rows (verified against the live table: ical
// meetings carry NO source_id, which is why identity is hour + title).
function block(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    type: over.type ?? 'meeting',
    hour: over.hour ?? 9,
    duration: over.duration ?? 30,
    title: over.title ?? 'Standup',
    source: 'source' in over ? over.source : 'ical',
    sourceId: over.sourceId ?? null,
  }
}

describe('isReingested', () => {
  it('is true only for rows another system re-creates', () => {
    // ical rows are rewritten by the Shortcut every run — deleting is futile.
    expect(isReingested(block({ source: 'ical' }))).toBe(true)
    // These are Today's own; a real delete sticks.
    expect(isReingested(block({ source: 'tide_routine' }))).toBe(false)
    expect(isReingested(block({ source: 'today_user' }))).toBe(false)
    expect(isReingested(block({ source: 'today_proposed' }))).toBe(false)
    expect(isReingested(undefined)).toBe(false)
  })
})

describe('eventKey', () => {
  it('matches the same meeting across a re-ingest (new row id, same slot)', () => {
    const before = block({ id: 'row-1', hour: 9, title: 'Rev Ops Team Meeting' })
    const after = block({ id: 'row-2', hour: 9, title: 'Rev Ops Team Meeting' })
    expect(eventKey(after)).toBe(eventKey(before))
  })

  it('ignores case and surrounding whitespace in the title', () => {
    expect(eventKey(block({ title: '  JS/NS 1:1 ' }))).toBe(eventKey(block({ title: 'js/ns 1:1' })))
  })

  it('treats a moved meeting as a different event', () => {
    // Deliberate: a rescheduled meeting is a new fact about the day, so it
    // should come back rather than stay hidden at its old time.
    expect(eventKey(block({ hour: 9 }))).not.toBe(eventKey(block({ hour: 10 })))
  })

  it('separates different meetings that start at the same time', () => {
    const a = block({ hour: 11.5, title: 'SGS User Story Daily Sync' })
    const b = block({ hour: 11.5, title: '[External] Arrow - Accenture Weekly' })
    expect(eventKey(a)).not.toBe(eventKey(b))
  })

  it('handles string hours and missing input without throwing', () => {
    // Supabase returns numeric columns as strings in some paths.
    expect(eventKey({ hour: '9', title: 'Standup' })).toBe(eventKey(block({ hour: 9 })))
    expect(eventKey(null)).toBeNull()
    expect(eventKey({ hour: 'abc', title: 'x' })).toBeNull()
  })
})

describe('filterDismissed', () => {
  it('removes only the dismissed event', () => {
    const keep = block({ hour: 10, title: 'SGS CRM Daily Standup Call' })
    const drop = block({ hour: 9, title: 'Rev Ops Team Meeting' })
    const out = filterDismissed([keep, drop], new Set([eventKey(drop)]))
    expect(out.map((b) => b.title)).toEqual(['SGS CRM Daily Standup Call'])
  })

  it('still hides the meeting after the Shortcut re-ingests it under a new id', () => {
    const original = block({ id: 'old', hour: 9, title: 'Rev Ops Team Meeting' })
    const dismissed = new Set([eventKey(original)])
    // Next morning: same meeting, brand new row id.
    const reingested = [block({ id: 'brand-new', hour: 9, title: 'Rev Ops Team Meeting' })]
    expect(filterDismissed(reingested, dismissed)).toEqual([])
  })

  it('returns the list untouched when nothing is dismissed', () => {
    const blocks = [block(), block({ hour: 12 })]
    expect(filterDismissed(blocks, new Set())).toBe(blocks)
    expect(filterDismissed(blocks, null)).toBe(blocks)
  })

  it('is safe on a missing list', () => {
    expect(filterDismissed(undefined, new Set(['x']))).toEqual([])
  })
})

describe('countDismissed', () => {
  it('counts duplicate ingests of one meeting as a single hidden event', () => {
    const dup = () => block({ hour: 9, title: 'Rev Ops Team Meeting' })
    const dismissed = new Set([eventKey(dup())])
    expect(countDismissed([dup(), dup(), dup()], dismissed)).toBe(1)
  })

  it('counts distinct hidden meetings', () => {
    const a = block({ hour: 9, title: 'A' })
    const b = block({ hour: 10, title: 'B' })
    expect(countDismissed([a, b], new Set([eventKey(a), eventKey(b)]))).toBe(2)
  })

  it('ignores dismissals for events not on this day', () => {
    expect(countDismissed([block({ hour: 9 })], new Set(['22|gone']))).toBe(0)
    expect(countDismissed([block()], new Set())).toBe(0)
  })
})
