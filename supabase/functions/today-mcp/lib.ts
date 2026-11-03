// Pure helpers for today-mcp (no Supabase, no env) so they can be unit tested.

export const TZ = 'America/New_York'

// ── time ──
// Local (New York) calendar day, offset by N days. Edge functions run in UTC,
// so from 7-8pm ET a UTC date is already tomorrow: the exact bug day.js exists
// to kill in the app.
export function localISO(offsetDays = 0, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const d = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day')))
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10) // safe: d is a pure UTC calendar date
}
// "today" | "tomorrow" | "yesterday" | YYYY-MM-DD → YYYY-MM-DD
export function resolveDate(s?: string | null) {
  const v = (s || 'today').trim().toLowerCase()
  if (v === 'today') return localISO(0)
  if (v === 'tomorrow') return localISO(1)
  if (v === 'yesterday') return localISO(-1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  throw new Error(`date must be today, tomorrow, yesterday or YYYY-MM-DD (got "${s}")`)
}
// "9:30" | "09:30" | "9:30am" | "2pm" | "14:00" | 9.5 → decimal hour (9.5)
export function parseHour(v: unknown): number {
  if (typeof v === 'number' && isFinite(v)) return v
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
  if (!m) throw new Error(`start must look like "9:30", "2pm" or "14:00" (got "${v}")`)
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) throw new Error(`invalid time "${v}"`)
  return Math.round((h + min / 60) * 100) / 100
}
// 9.5 → "9:30 AM"
export function fmtHour(h: number) {
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60) % 24, mm = totalMin % 60
  const ap = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`
}

// ── pillars (mirror src/lib/usePillars.js) ──
export const PILLARS = ['arrow', 'sidegig', 'life', 'sunny', 'open'] as const
export const OTHER_TYPES = ['meeting', 'routine', 'adhoc', 'prep'] as const
export function pillarTagToId(tag?: string | null) {
  if (!tag) return null
  const norm = tag.trim().toLowerCase()
  if (norm === 'arrow' || norm === 'life') return norm
  if (norm.includes('sunny')) return 'sunny'
  if (norm.startsWith('side')) return 'sidegig'
  if (norm === 'open' || norm.startsWith('open')) return 'open'
  return null
}

// Open windows inside [dayStart, dayEnd) not covered by any block.
export function freeWindows(blocks: { hour: number; duration_minutes: number }[], dayStart: number, dayEnd: number) {
  const spans = blocks
    .map((b) => [Number(b.hour), Number(b.hour) + b.duration_minutes / 60] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const out: { start: string; end: string; minutes: number }[] = []
  let cur = dayStart
  for (const [s, e] of spans) {
    if (e <= cur) continue
    if (s > cur && s > dayStart) {
      const to = Math.min(s, dayEnd)
      if (to - cur >= 0.25) out.push({ start: fmtHour(cur), end: fmtHour(to), minutes: Math.round((to - cur) * 60) })
    }
    cur = Math.max(cur, e)
    if (cur >= dayEnd) break
  }
  if (dayEnd - cur >= 0.25) out.push({ start: fmtHour(cur), end: fmtHour(dayEnd), minutes: Math.round((dayEnd - cur) * 60) })
  return out
}

