import { describe, it, expect } from 'vitest'
import { dedupeBlocks } from '../src/lib/usePlacedBlocks.js'

const block = (hour, title, extra = {}) => ({
  id: `${hour}-${title}-${extra.tag ?? ''}`,
  hour,
  title,
  type: 'meeting',
  duration: 30,
  ...extra,
})

describe('dedupeBlocks', () => {
  it('collapses rows sharing a start hour and title', () => {
    const out = dedupeBlocks([
      block(10, 'SGS CRM Daily Standup Call', { tag: 'a' }),
      block(10, 'SGS CRM Daily Standup Call', { tag: 'b' }),
      block(10, 'SGS CRM Daily Standup Call', { tag: 'c' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('10-SGS CRM Daily Standup Call-a')
  })

  it('keeps the first occurrence, not the last', () => {
    const out = dedupeBlocks([block(9, 'Standup', { tag: 'first' }), block(9, 'Standup', { tag: 'second' })])
    expect(out[0].id).toBe('9-Standup-first')
  })

  it('ignores case and surrounding whitespace in the title', () => {
    const out = dedupeBlocks([block(8, 'Planning Session'), block(8, '  planning session ')])
    expect(out).toHaveLength(1)
  })

  it('keeps the same title at a different hour', () => {
    const out = dedupeBlocks([block(10, 'Standup'), block(14, 'Standup')])
    expect(out).toHaveLength(2)
  })

  it('keeps different meetings at the same hour', () => {
    const out = dedupeBlocks([block(10, 'Standup'), block(10, 'Global Tracking Weekly')])
    expect(out).toHaveLength(2)
  })

  it('handles a missing title without throwing', () => {
    const out = dedupeBlocks([block(10, undefined), block(10, null)])
    expect(out).toHaveLength(1)
  })

  it('returns an empty array unchanged', () => {
    expect(dedupeBlocks([])).toEqual([])
  })
})
