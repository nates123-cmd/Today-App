// Today remote MCP server: one Supabase Edge Function that is BOTH
//   1. an MCP server over Streamable HTTP (JSON-RPC) that reads a day and
//      plans it (placed_blocks + block_items + Course+ tasks + reminders), and
//   2. a minimal OAuth 2.1 authorization server (discovery + DCR + authorize +
//      token, PKCE-enforced) so claude.ai / Claude Desktop / Claude Code can
//      connect.
//
// The OAuth half is the Ink server (ink-app/supabase/functions/ink-mcp) with
// its own today_mcp_* tables, so revoking Today never revokes Ink or Course+.
//
// Deploy with --no-verify-jwt: it implements its own auth.
//
// DATA RULES this server mirrors from the app (src/lib/*):
// - A day's schedule is placed_blocks rows for that date. Meetings are rows
//   with source='ical', owned by the phone's calendar Shortcut, which deletes
//   and re-posts them on every sync. So this server NEVER edits or deletes an
//   ical row: the change would vanish on the next sync.
// - Hiding a meeting in the app is per-device localStorage, invisible here.
// - source='today_proposed' = a suggestion the app shows with accept buttons.
//   The app's "Propose" button wipes ALL today_proposed rows for the day before
//   regenerating.
// - Pillar blocks use the pillar id as `type` AND `pillar`.
// - Marking a Course+-sourced block item done also marks the cp_task done,
//   with the same patch useBlockItems.toggleDone writes.
// - Calendar days are America/New_York. Never toISOString() for a day.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TZ, PILLARS, OTHER_TYPES, localISO, resolveDate, parseHour, fmtHour, pillarTagToId, freeWindows } from './lib.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BASE = Deno.env.get('TODAY_MCP_BASE_URL') || `${SUPABASE_URL}/functions/v1/today-mcp`
const ALLOWED_EMAIL = (Deno.env.get('TODAY_MCP_ALLOWED_EMAIL') || 'nates123@gmail.com').toLowerCase()
const READONLY = Deno.env.get('TODAY_MCP_READONLY') === '1'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── small utils ──
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
async function sha256b64url(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return b64url(new Uint8Array(buf))
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Expose-Headers': 'mcp-session-id, www-authenticate',
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } })
const isAllowedRedirect = (u: string) => {
  try {
    const h = new URL(u)
    if (h.protocol !== 'https:' && !(h.hostname === 'localhost' || h.hostname === '127.0.0.1')) return false
    return ['claude.ai', 'claude.com'].includes(h.hostname) ||
      h.hostname.endsWith('.claude.ai') || h.hostname.endsWith('.claude.com') ||
      h.hostname === 'localhost' || h.hostname === '127.0.0.1'
  } catch { return false }
}
const must = (e: any) => { if (e) throw new Error(e.message || String(e)) }

// ── block shaping ──
function shapeBlock(r: any) {
  const hour = Number(r.hour)
  return {
    id: r.id,
    start: fmtHour(hour),
    end: fmtHour(hour + r.duration_minutes / 60),
    hour,
    duration_minutes: r.duration_minutes,
    title: r.title,
    type: r.type,
    pillar: r.pillar,
    kind: r.source === 'ical' ? 'meeting (calendar, read-only)'
      : r.source === 'today_proposed' ? 'proposed (not yet accepted)'
      : r.type === 'routine' ? 'routine' : 'planned',
    source: r.source,
  }
}
// Same collapse as usePlacedBlocks.dedupeBlocks: the ical ingest has, in the
// past, re-inserted one meeting many times.
function dedupe(rows: any[]) {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = `${Number(r.hour)}|${(r.title || '').trim().toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
async function getBlock(sb: any, id: string) {
  if (!id) throw new Error('block_id is required')
  const { data, error } = await sb.from('placed_blocks').select('*').eq('id', id).maybeSingle()
  must(error)
  if (!data) throw new Error(`No block with id ${id}`)
  return data
}
function refuseIcal(row: any, verb: string) {
  if (row.source === 'ical') {
    throw new Error(`"${row.title}" is a calendar meeting. The phone's calendar sync re-creates it, so it cannot be ${verb} here. Change it in the calendar, or hide it in the Today app.`)
  }
}
async function overlaps(sb: any, date: string, hour: number, minutes: number, exceptId?: string) {
  const { data, error } = await sb.from('placed_blocks').select('*').eq('date', date)
  must(error)
  const end = hour + minutes / 60
  return dedupe(data || []).filter((r: any) => {
    if (r.id === exceptId) return false
    const s = Number(r.hour), e = s + r.duration_minutes / 60
    return s < end && e > hour
  })
}

// ── data ops (take a user-scoped supabase client) ──
const ops: Record<string, (sb: any, a: any) => Promise<any>> = {

  // ---------- read ----------

  async get_day(sb, { date, day_start = '7:00', day_end = '22:00' }) {
    const d = resolveDate(date)
    const [blocksRes, itemsRes, remRes] = await Promise.all([
      sb.from('placed_blocks').select('*').eq('date', d).order('hour', { ascending: true }),
      sb.from('block_items').select('*').eq('date', d).order('position', { ascending: true }),
      sb.from('today_reminders').select('id,title,list_name,due_date,due_at,priority,notes')
        .eq('completed', false).eq('due_date', d).order('due_at', { ascending: true, nullsFirst: false }),
    ])
    must(blocksRes.error); must(itemsRes.error)
    const rows = dedupe(blocksRes.data || [])
    const byBlock = new Map<string, any[]>()
    for (const it of itemsRes.data || []) {
      const arr = byBlock.get(it.block_id) ?? []
      arr.push({ id: it.id, label: it.label, done: it.done, source: it.source, cp_task_id: it.cp_task_id, est_minutes: it.est_minutes })
      byBlock.set(it.block_id, arr)
    }
    const blocks = rows.map((r: any) => ({ ...shapeBlock(r), items: byBlock.get(r.id) ?? [] }))
    return {
      date: d,
      weekday: new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      blocks,
      free: freeWindows(rows.map((r: any) => ({ hour: Number(r.hour), duration_minutes: r.duration_minutes })), parseHour(day_start), parseHour(day_end)),
      reminders_due: (remRes.data || []).map((r: any) => ({
        id: r.id, title: r.title, list: r.list_name,
        time: r.due_at ? new Date(r.due_at).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : null,
      })),
      notes: [
        'Meetings hidden in the Today app (per-device) still appear here.',
        'Proposed blocks are suggestions until accepted in the app; tapping Propose in the app replaces all of them.',
      ],
    }
  },

  async list_tasks(sb, { pillar, lane = 'focus', project, limit = 60 }) {
    const [areasRes, projRes] = await Promise.all([
      sb.from('cp_areas').select('id, name'),
      sb.from('cp_projects').select('id, area_id, name, status'),
    ])
    must(areasRes.error); must(projRes.error)
    const areaPillar = new Map((areasRes.data || []).map((a: any) => [a.id, pillarTagToId(a.name) ?? 'open']))
    let projects = (projRes.data || []).filter((p: any) => !['done', 'archived', 'dropped'].includes(String(p.status || '').toLowerCase()))
    if (project) projects = projects.filter((p: any) => String(p.name).toLowerCase().includes(String(project).toLowerCase()))
    const projById = new Map<string, { name: string; pillar: string }>(projects.map((p: any) => [p.id, { name: p.name, pillar: areaPillar.get(p.area_id) ?? 'open' }]))
    const ids = [...projById.keys()]
    if (!ids.length) return []
    const { data, error } = await sb.from('cp_tasks')
      .select('id, project_id, label, next, waiting, work_type, task_status, due_date, priority, sort')
      .in('project_id', ids).eq('done', false)
      .order('sort', { ascending: true, nullsFirst: false })
    must(error)
    const laneOf = (t: any) =>
      t.task_status === 'now' || t.priority === 1 ? 'now'
      : t.task_status === 'waiting' || t.waiting ? 'waiting'
      : t.next ? 'next' : 'icebox'
    const rank: Record<string, number> = { now: 0, next: 1, icebox: 2, waiting: 3 }
    const pid = pillar ? pillarTagToId(pillar) : null
    if (pillar && !pid) throw new Error(`pillar must be one of: ${PILLARS.join(', ')}`)
    return (data || [])
      .map((t: any) => ({
        id: t.id, label: t.label, lane: laneOf(t),
        project: projById.get(t.project_id)?.name, pillar: projById.get(t.project_id)?.pillar,
        due: t.due_date, work_type: t.work_type,
      }))
      .filter((t: any) => (pid ? t.pillar === pid : true))
      .filter((t: any) => lane === 'all' ? true : lane === 'focus' ? t.lane === 'now' || t.lane === 'next' : t.lane === lane)
      .sort((a: any, b: any) => rank[a.lane] - rank[b.lane])
      .slice(0, limit)
  },

  // ---------- write ----------

  async place_block(sb, { date, start, duration_minutes, title, pillar, type, proposed = false, allow_overlap = false }) {
    const d = resolveDate(date)
    const hour = parseHour(start)
    const minutes = Math.round(Number(duration_minutes))
    if (!(minutes > 0 && minutes <= 16 * 60)) throw new Error('duration_minutes must be between 1 and 960')
    const pid = pillar ? pillarTagToId(pillar) : null
    if (pillar && !pid) throw new Error(`pillar must be one of: ${PILLARS.join(', ')}`)
    let t = pid ?? (type || 'adhoc')
    if (!pid && !(OTHER_TYPES as readonly string[]).includes(t)) throw new Error(`type must be one of: ${OTHER_TYPES.join(', ')} (or pass pillar)`)
    if (t === 'meeting') t = 'adhoc' // real meetings come from the calendar; a typed one would read as ical
    const cleanTitle = String(title || '').trim() || (pid ? pid[0].toUpperCase() + pid.slice(1) : '')
    if (!cleanTitle) throw new Error('title is required')
    const clash = await overlaps(sb, d, hour, minutes)
    if (clash.length && !allow_overlap) {
      throw new Error(`Overlaps ${clash.map((c: any) => `"${c.title}" ${fmtHour(Number(c.hour))}`).join(', ')}. Pick another time or pass allow_overlap: true.`)
    }
    const row = {
      id: crypto.randomUUID(), date: d, hour, duration_minutes: minutes, type: t, title: cleanTitle,
      pillar: pid, project_id: null, source: proposed ? 'today_proposed' : 'today_user', source_id: null,
    }
    const { data, error } = await sb.from('placed_blocks').insert(row).select().single()
    must(error)
    return { placed: shapeBlock(data), overlapped: clash.map((c: any) => c.title) }
  },

  async update_block(sb, { block_id, date, start, duration_minutes, title, accept }) {
    const row = await getBlock(sb, block_id)
    refuseIcal(row, 'moved or renamed')
    const patch: any = {}
    if (date != null) patch.date = resolveDate(date)
    if (start != null) patch.hour = parseHour(start)
    if (duration_minutes != null) {
      const m = Math.round(Number(duration_minutes))
      if (!(m > 0 && m <= 960)) throw new Error('duration_minutes must be between 1 and 960')
      patch.duration_minutes = m
    }
    if (title != null) patch.title = String(title).trim()
    if (accept) patch.source = 'today_user'
    if (!Object.keys(patch).length) throw new Error('nothing to update')
    const { data, error } = await sb.from('placed_blocks').update(patch).eq('id', block_id).select().single()
    must(error)
    return { updated: shapeBlock(data) }
  },

  async remove_block(sb, { block_id }) {
    const row = await getBlock(sb, block_id)
    refuseIcal(row, 'deleted')
    const { count } = await sb.from('block_items').select('id', { count: 'exact', head: true }).eq('block_id', block_id)
    const { error } = await sb.from('placed_blocks').delete().eq('id', block_id)
    must(error)
    return { removed: { title: row.title, date: row.date, start: fmtHour(Number(row.hour)) }, items_removed: count || 0 }
  },

  async add_block_item(sb, { block_id, label, cp_task_id }) {
    const block = await getBlock(sb, block_id)
    let text = String(label || '').trim()
    if (cp_task_id) {
      const { data: t, error } = await sb.from('cp_tasks').select('id,label').eq('id', cp_task_id).maybeSingle()
      must(error)
      if (!t) throw new Error(`No Course+ task with id ${cp_task_id}`)
      if (!text) text = t.label // label is a SNAPSHOT, same as the app
    }
    if (!text) throw new Error('label (or cp_task_id) is required')
    const { data: existing } = await sb.from('block_items').select('position').eq('block_id', block_id)
      .order('position', { ascending: false }).limit(1)
    const position = existing?.length ? existing[0].position + 1 : 0
    const { data, error } = await sb.from('block_items').insert({
      block_id, date: block.date, position, label: text,
      source: cp_task_id ? 'course' : 'manual', cp_task_id: cp_task_id || null,
    }).select().single()
    must(error)
    return { added: { id: data.id, label: data.label, block: block.title, start: fmtHour(Number(block.hour)) } }
  },

  async update_block_item(sb, { item_id, label, done, block_id }) {
    if (!item_id) throw new Error('item_id is required')
    const { data: it, error: e0 } = await sb.from('block_items').select('*').eq('id', item_id).maybeSingle()
    must(e0)
    if (!it) throw new Error(`No block item with id ${item_id}`)
    const patch: any = {}
    if (label != null) patch.label = String(label).trim()
    if (block_id != null) { await getBlock(sb, block_id); patch.block_id = block_id }
    if (done != null) {
      patch.done = !!done
      patch.done_at = done ? new Date().toISOString() : null
      if (done) patch.started_at = null
    }
    if (!Object.keys(patch).length) throw new Error('nothing to update')
    const { error } = await sb.from('block_items').update(patch).eq('id', item_id)
    must(error)
    // Same Course+ write-back as useBlockItems.toggleDone.
    if (done != null && it.cp_task_id && !!done !== !!it.done) {
      const cp = done ? { done: true, task_status: 'done', next: false } : { done: false, task_status: 'backlog', next: false }
      const r = await sb.from('cp_tasks').update(cp).eq('id', it.cp_task_id)
      must(r.error)
    }
    return { updated: item_id, ...patch, course_task_synced: !!(done != null && it.cp_task_id) }
  },

  async remove_block_item(sb, { item_id }) {
    if (!item_id) throw new Error('item_id is required')
    const { data, error } = await sb.from('block_items').delete().eq('id', item_id).select('label').maybeSingle()
    must(error)
    if (!data) throw new Error(`No block item with id ${item_id}`)
    return { removed: data.label }
  },

  // Queues a create for the Mac reminders agent (tools/push-reminders.sh),
  // which writes it into Apple Reminders on its next 5-minute run.
  async add_reminder(sb, { title, date, time, notes }) {
    const t = String(title || '').trim()
    if (!t) throw new Error('title is required')
    let due: string | null = null
    if (date) {
      due = resolveDate(date)
      if (time != null) {
        const h = parseHour(time)
        const totalMin = Math.round(h * 60)
        due += ` ${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
      }
    }
    const payload: any = { title: t }
    if (due) payload.due = due
    if (notes) payload.notes = String(notes)
    const { data, error } = await sb.from('today_reminder_actions').insert({ action: 'create', payload }).select('id').single()
    must(error)
    return { queued: data.id, title: t, due, note: 'Lands in Apple Reminders (default list) on the Mac agent\'s next run, within ~5 minutes, if the Mac is awake.' }
  },
}

// ── tool manifest ──
const str = { type: 'string' }, num = { type: 'number' }, bool = { type: 'boolean' }
const S = (props: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object', properties: props, required, additionalProperties: false })
const DATE = { type: 'string', description: '"today", "tomorrow", "yesterday" or YYYY-MM-DD (New York time). Defaults to today.' }
const TIME = { type: 'string', description: 'Local time like "9:30", "9:30am", "2pm" or "14:00".' }
const PILLAR = { type: 'string', enum: [...PILLARS], description: 'Life pillar the block belongs to: arrow (day job), sidegig, life, sunny, open.' }
const ID = { type: 'string', description: 'uuid from get_day' }

const TOOLS = [
  { name: 'get_day', write: false, description: "Read one day of Nate's Today app plan: every block in time order (calendar meetings, routines, planned pillar blocks, proposals) with the checklist items inside each, the open free windows, and Apple Reminders due that day. Call this first before planning or answering what's on a day.", inputSchema: S({ date: DATE, day_start: { ...TIME, description: 'Start of the window for free-time calculation. Default 7:00.' }, day_end: { ...TIME, description: 'End of the window for free-time calculation. Default 22:00.' } }) },
  { name: 'list_tasks', write: false, description: "Open Course+ tasks Nate could put into a block, grouped by pillar. lane 'focus' (default) = Now + Next only; 'now', 'next', 'icebox', 'waiting' or 'all'. Use the returned id as cp_task_id in add_block_item.", inputSchema: S({ pillar: PILLAR, lane: { type: 'string', enum: ['focus', 'now', 'next', 'icebox', 'waiting', 'all'] }, project: { type: 'string', description: 'Substring match on project name' }, limit: num }) },

  { name: 'place_block', write: true, description: "Put a time block on a day's schedule. Use pillar for focus/work blocks (e.g. pillar 'arrow', title 'Deep work: CSA plan'); otherwise type routine|adhoc|prep. Refuses to overlap an existing block unless allow_overlap is true. proposed: true drops it as a suggestion Nate accepts in the app instead of committing it.", inputSchema: S({ date: DATE, start: TIME, duration_minutes: num, title: str, pillar: PILLAR, type: { type: 'string', enum: ['routine', 'adhoc', 'prep'] }, proposed: bool, allow_overlap: bool }, ['start', 'duration_minutes']) },
  { name: 'update_block', write: true, description: 'Move, resize, rename or re-date a block Nate (or you) placed, or accept a proposed one (accept: true). Calendar meetings are read-only and will be refused.', inputSchema: S({ block_id: ID, date: DATE, start: TIME, duration_minutes: num, title: str, accept: bool }, ['block_id']) },
  { name: 'remove_block', write: true, description: 'Delete a planned/proposed/routine block and its checklist items. Calendar meetings are refused. Confirm with Nate before removing a block that has items.', inputSchema: S({ block_id: ID }, ['block_id']) },
  { name: 'add_block_item', write: true, description: "Add a checklist item inside a block: what Nate will actually work on in it. Pass cp_task_id (from list_tasks) to link a Course+ task; checking it off in Today then completes it in Course+. label alone makes a manual item.", inputSchema: S({ block_id: ID, label: str, cp_task_id: str }, ['block_id']) },
  { name: 'update_block_item', write: true, description: 'Rename a checklist item, move it to another block (block_id), or set done. Marking a Course+-linked item done also completes the Course+ task.', inputSchema: S({ item_id: ID, label: str, done: bool, block_id: ID }, ['item_id']) },
  { name: 'remove_block_item', write: true, description: 'Delete one checklist item from a block. Does not touch the Course+ task.', inputSchema: S({ item_id: ID }, ['item_id']) },
  { name: 'add_reminder', write: true, description: "Queue an Apple Reminder (default list) with an optional date and time, e.g. a nudge at 4:15pm to go outside. Delivered by the Mac agent within ~5 minutes.", inputSchema: S({ title: str, date: DATE, time: TIME, notes: str }, ['title']) },
].filter((t) => !(READONLY && t.write))

// ── build a user-scoped supabase client from the stored session ──
async function userClient(email: string) {
  const { data: row, error } = await admin.from('today_mcp_session').select('supa_refresh').eq('email', email).single()
  if (error || !row) throw new Error('No session for ' + email)
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error: e2 } = await sb.auth.refreshSession({ refresh_token: row.supa_refresh })
  if (e2 || !data?.session) throw new Error('Session expired — reconnect the Today connector.')
  await admin.from('today_mcp_session').update({ supa_refresh: data.session.refresh_token, updated_at: new Date().toISOString() }).eq('email', email)
  await sb.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  return sb
}

async function emailForToken(token: string | null): Promise<string | null> {
  if (!token) return null
  const { data } = await admin.from('today_mcp_tokens').select('email,expires_at,kind').eq('token', token).eq('kind', 'access').maybeSingle()
  if (!data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  return data.email
}

// ── MCP JSON-RPC handler ──
async function handleRpc(msg: any, email: string) {
  const { id, method, params } = msg
  const reply = (result: any) => ({ jsonrpc: '2.0', id, result })
  if (method === 'initialize') {
    return reply({
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'today', version: '0.1.0' },
      instructions: "Nate's Today app: his day plan as time blocks. Read with get_day before changing anything. Calendar meetings are read-only. Times are New York local; speak them in 12-hour form.",
    })
  }
  if (method === 'ping') return reply({})
  if (method === 'tools/list') return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    const tool = TOOLS.find((t) => t.name === name)
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } }
    try {
      const sb = await userClient(email)
      const out = await ops[name](sb, args)
      return reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] })
    } catch (e) {
      return reply({ content: [{ type: 'text', text: 'Error: ' + ((e as Error)?.message || String(e)) }], isError: true })
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } }
}

// Supabase's functions domain downgrades text/html → text/plain, so the login
// page is hosted on GitHub Pages (public/mcp-login.html) and /authorize
// redirects to it.
const LOGIN_UI = Deno.env.get('TODAY_MCP_LOGIN_URL') || 'https://nates123-cmd.github.io/Today-App/mcp-login.html'

function loginPage(q: URLSearchParams) {
  const redirect_uri = q.get('redirect_uri') || ''
  const state = q.get('state') || ''
  const code_challenge = q.get('code_challenge') || ''
  const ok = isAllowedRedirect(redirect_uri) && q.get('code_challenge_method') === 'S256'
  if (!ok) return new Response('Invalid authorization request (need https claude.ai redirect + PKCE S256).', { status: 400 })
  const u = new URL(LOGIN_UI)
  u.searchParams.set('redirect_uri', redirect_uri)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', code_challenge)
  return new Response(null, { status: 302, headers: { ...CORS, Location: u.toString() } })
}

// ── main router ──
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)
  const m = url.pathname.match(/\/today-mcp(\/.*)?$/)
  const sub = (m?.[1] || '/').replace(/\/+$/, '') || '/'

  if (sub === '/.well-known/oauth-protected-resource') {
    return json({ resource: BASE, authorization_servers: [BASE] })
  }
  if (sub === '/.well-known/oauth-authorization-server' || sub === '/.well-known/openid-configuration') {
    return json({
      issuer: BASE,
      authorization_endpoint: `${BASE}/authorize`,
      token_endpoint: `${BASE}/token`,
      registration_endpoint: `${BASE}/register`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['today'],
    })
  }

  if (sub === '/register' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    return json({
      client_id: 'today-' + randToken(8),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: body.redirect_uris || [],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }, 201)
  }

  if (sub === '/authorize' && req.method === 'GET') return loginPage(url.searchParams)

  if (sub === '/authorize/send' && req.method === 'POST') {
    const { email } = await req.json().catch(() => ({}))
    if (!email || email.toLowerCase() !== ALLOWED_EMAIL) return json({ error: 'This email is not authorized for Today.' }, 403)
    const authc = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { error } = await authc.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (sub === '/authorize/verify' && req.method === 'POST') {
    const { email, token, redirect_uri, state, code_challenge } = await req.json().catch(() => ({}))
    if (!email || email.toLowerCase() !== ALLOWED_EMAIL) return json({ error: 'Email not authorized.' }, 403)
    if (!isAllowedRedirect(redirect_uri) || !code_challenge) return json({ error: 'Invalid request.' }, 400)
    const authc = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await authc.auth.verifyOtp({ email, token: String(token).replace(/\D/g, ''), type: 'email' })
    if (error || !data?.session) return json({ error: error?.message || 'Invalid code.' }, 400)
    const lc = email.toLowerCase()
    await admin.from('today_mcp_session').upsert({ email: lc, supa_refresh: data.session.refresh_token, updated_at: new Date().toISOString() })
    const code = randToken(24)
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    await admin.from('today_mcp_codes').insert({ code, code_challenge, redirect_uri, email: lc, supa_refresh: data.session.refresh_token, expires_at: expires })
    const sep = redirect_uri.includes('?') ? '&' : '?'
    const redirect = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
    return json({ redirect })
  }

  if (sub === '/token' && req.method === 'POST') {
    const ct = req.headers.get('content-type') || ''
    let p: Record<string, string> = {}
    if (ct.includes('application/json')) p = await req.json().catch(() => ({}))
    else { const f = new URLSearchParams(await req.text()); f.forEach((v, k) => (p[k] = v)) }

    if (p.grant_type === 'authorization_code') {
      const { data: row } = await admin.from('today_mcp_codes').select('*').eq('code', p.code || '').maybeSingle()
      if (!row) return json({ error: 'invalid_grant' }, 400)
      await admin.from('today_mcp_codes').delete().eq('code', p.code)
      if (new Date(row.expires_at) < new Date()) return json({ error: 'invalid_grant', error_description: 'code expired' }, 400)
      if (row.redirect_uri !== p.redirect_uri) return json({ error: 'invalid_grant', error_description: 'redirect mismatch' }, 400)
      const challenge = await sha256b64url(p.code_verifier || '')
      if (challenge !== row.code_challenge) return json({ error: 'invalid_grant', error_description: 'PKCE failed' }, 400)
      const access = randToken(), refresh = randToken()
      const accessExp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      await admin.from('today_mcp_tokens').insert([
        { token: access, kind: 'access', email: row.email, expires_at: accessExp },
        { token: refresh, kind: 'refresh', email: row.email, expires_at: null },
      ])
      return json({ access_token: access, token_type: 'Bearer', expires_in: 30 * 24 * 3600, refresh_token: refresh, scope: 'today' }, 200, { 'Cache-Control': 'no-store' })
    }

    if (p.grant_type === 'refresh_token') {
      const { data: row } = await admin.from('today_mcp_tokens').select('*').eq('token', p.refresh_token || '').eq('kind', 'refresh').maybeSingle()
      if (!row) return json({ error: 'invalid_grant' }, 400)
      const access = randToken()
      const accessExp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      await admin.from('today_mcp_tokens').insert({ token: access, kind: 'access', email: row.email, expires_at: accessExp })
      return json({ access_token: access, token_type: 'Bearer', expires_in: 30 * 24 * 3600, scope: 'today' }, 200, { 'Cache-Control': 'no-store' })
    }
    return json({ error: 'unsupported_grant_type' }, 400)
  }

  if (sub === '/') {
    const auth = req.headers.get('authorization') || ''
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
    const email = await emailForToken(bearer)
    if (!email) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS, 'WWW-Authenticate': `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"` },
      })
    }
    if (req.method === 'GET') return new Response(null, { status: 405, headers: CORS })
    const payload = await req.json().catch(() => null)
    if (!payload) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
    if (Array.isArray(payload)) {
      const out = []
      for (const msg of payload) {
        if (msg?.id !== undefined && msg?.id !== null) out.push(await handleRpc(msg, email))
        else await handleRpc(msg, email)
      }
      return json(out)
    }
    if (payload.id === undefined || payload.id === null) { await handleRpc(payload, email).catch(() => {}); return new Response(null, { status: 202, headers: CORS }) }
    return json(await handleRpc(payload, email))
  }

  return new Response('Not found', { status: 404, headers: CORS })
})
