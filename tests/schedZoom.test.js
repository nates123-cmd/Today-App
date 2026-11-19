import { describe, it, expect } from 'vitest'
import { ZOOM_MIN, ZOOM_MAX, clampZoom, readZoom, saveZoom, anchorDrift } from '../src/lib/schedZoom.js'

const fakeStorage = (initial = {}) => {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

describe('schedZoom', () => {
  it('clamps to the allowed range and survives junk', () => {
    expect(clampZoom(10)).toBe(ZOOM_MIN)
    expect(clampZoom(9999)).toBe(ZOOM_MAX)
    expect(clampZoom(NaN)).toBe(ZOOM_MIN)
    expect(clampZoom(80.4)).toBe(80)
  })

  it('defaults to the unzoomed grid and round-trips a saved zoom', () => {
    const s = fakeStorage()
    expect(readZoom(s)).toBe(ZOOM_MIN)
    saveZoom(96, s)
    expect(readZoom(s)).toBe(96)
    expect(readZoom(fakeStorage({ 'today:schedZoom': 'garbage' }))).toBe(ZOOM_MIN)
  })

  it('falls back when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readZoom(broken)).toBe(ZOOM_MIN)
    expect(() => saveZoom(80, broken)).not.toThrow()
  })

  it('anchorDrift keeps the moment under the finger in place', () => {
    // 2 hours sat above a finger at y=300 with the grid top at 224 (38px/h).
    // Doubling the scale puts that moment at 224 + 152 = 376, so scroll 76 down.
    expect(anchorDrift(224, 2, 76, 300)).toBe(76)
    // Same scale, same finger: nothing to correct.
    expect(anchorDrift(224, 2, 38, 300)).toBe(0)
  })
})
