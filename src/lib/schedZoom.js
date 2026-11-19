// Zoom for the schedule grid: how many pixels one hour is drawn at.
// The floor is the original fixed density (the whole 8a-6p day on one screen);
// the ceiling is 4x, where a 15-minute step is as tall as an hour used to be.

export const ZOOM_MIN = 38
export const ZOOM_MAX = 152
export const ZOOM_STEP = 1.4 // one press of the +/- buttons
const KEY = 'today:schedZoom'

export function clampZoom(px) {
  if (!Number.isFinite(px)) return ZOOM_MIN
  return Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, px)))
}

// Storage can throw (private mode), so both ends fail soft to the default.
export function readZoom(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY)
    return raw == null ? ZOOM_MIN : clampZoom(parseFloat(raw))
  } catch {
    return ZOOM_MIN
  }
}

export function saveZoom(px, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, String(clampZoom(px)))
  } catch {
    /* not persisted; zoom still works for this session */
  }
}

// Keeping a point of the day under the finger while the scale changes: given
// how many hours sat above the anchor, how far the scroll position must move
// so that same moment lands back on `anchorY` at the new scale.
export function anchorDrift(calTop, hoursAbove, hourPx, anchorY) {
  return calTop + hoursAbove * hourPx - anchorY
}
