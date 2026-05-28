import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import {
  writebackTaskStatus,
  writebackTaskDoDate,
  writebackTaskPillar,
} from './notionWriteback'

// Today's pillar buckets. The first four map to a Course pillar tag, matched
// case/spelling-insensitively via pillarTagToId (the DB stores inconsistent
// variants — 'arrow' vs 'Arrow', 'side' vs 'Side gig'). The fifth ('open') is
// synthetic — Course tasks whose project_id is null (the prototype called this
// "Open Tasks").
const PILLAR_DEFS = [
  { id: 'arrow',   name: 'Arrow',      color: 'arrow' },
  { id: 'sunny',   name: 'Sunny',      color: 'sunny' },
  { id: 'sidegig', name: 'Side gig',   color: 'sidegig' },
  { id: 'life',    name: 'Life',       color: 'life' },
  { id: 'open',    name: 'Open Tasks', color: 'open' },
]

// Course task statuses that are NOT in Today's triage backlog. 'triage' is
// Course's parked/"Someday" bucket — not part of the morning ritual.
const HIDDEN_STATUSES = new Set(['done', 'dropped', 'archived', 'triage'])

function projectMeta(p) {
  if (p.work_area) return p.work_area
  if (p.status === 'active') return 'active'
  return p.status
}

function shapeTask(t) {
  return {
    id: t.id,
    label: t.title,
    est: t.effort || null,
    estConfirmed: !!t.effort,
    depth: t.work_type === 'deep' || t.work_type === 'admin' ? t.work_type : null,
    status: t.status,
    doDate: t.do_date,
    projectId: t.project_id,
    pillar: t.pillar ?? null,
    notionUrl: t.notion_url,
  }
}

// Map a Course pillar string to Today's pillar id. Tolerant of the casing and
// spelling variants the DB actually contains ('Arrow'/'arrow', and the side-gig
// pillar as 'side'/'Side gig'/'sidegig'/'side-gig').
function pillarTagToId(tag) {
  if (!tag) return null
  const norm = tag.trim().toLowerCase()
  if (norm === 'arrow' || norm === 'sunny' || norm === 'life') return norm
  // Collapse every side-gig spelling to a single id safe for CSS classes/keys.
  if (norm.startsWith('side')) return 'sidegig'
  return null
}

function buildPillars(projects, tasks) {
  const byProject = new Map()
  // Orphan tasks split by their task-level pillar tag.
  // Key: pillar id ('arrow'|'sunny'|'life'|'sidegig') or '__unassigned__'.
  const orphansByPillar = { arrow: [], sunny: [], life: [], sidegig: [], __unassigned__: [] }
  for (const t of tasks) {
    if (HIDDEN_STATUSES.has(t.status)) continue
    if (!t.project_id) {
      const pillarId = pillarTagToId(t.pillar)
      orphansByPillar[pillarId ?? '__unassigned__'].push(t)
      continue
    }
    const arr = byProject.get(t.project_id) ?? []
    arr.push(t)
    byProject.set(t.project_id, arr)
  }

  const projectsByPillar = new Map()
  for (const p of projects) {
    // Bucket by normalized pillar id (same path as orphan tasks). The DB's
    // inconsistent casing/spelling means a raw exact-string match silently
    // drops projects — e.g. 'arrow' projects never landed under the Arrow
    // pillar, and the side-gig projects (stored as 'side') vanished entirely.
    const pid = pillarTagToId(p.pillar)
    if (!pid) continue
    if (!projectsByPillar.has(pid)) projectsByPillar.set(pid, [])
    projectsByPillar.get(pid).push({
      id: p.id,
      name: p.name,
      meta: projectMeta(p),
      dueDate: p.due_date ?? null,
      outcome: p.outcome ?? null,
      tasks: (byProject.get(p.id) ?? []).map(shapeTask),
    })
  }

  return PILLAR_DEFS.map((def) => {
    if (def.id === 'open') {
      return {
        id: def.id,
        name: def.name,
        color: def.color,
        openTasks: orphansByPillar.__unassigned__.map(shapeTask),
        projects: [],
      }
    }
    return {
      id: def.id,
      name: def.name,
      color: def.color,
      // Orphan tasks tagged with this pillar surface as the pillar's openTasks
      // alongside its projects.
      openTasks: orphansByPillar[def.id].map(shapeTask),
      projects: projectsByPillar.get(def.id) ?? [],
    }
  })
}

export function usePillars() {
  const [pillars, setPillars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const projectsRes = await supabase
      .from('course_projects')
      .select('id, name, status, pillar, work_area, sort_order, last_activity_at, due_date, outcome')
      .eq('status', 'active')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('last_activity_at', { ascending: false })
    if (projectsRes.error) {
      setError(projectsRes.error.message)
      setLoading(false)
      return
    }
    const projectIds = projectsRes.data.map((p) => p.id)
    // Pull tasks under those projects + orphan tasks (project_id null).
    // Two queries vs one OR — supabase-js's .or() with .in() is ugly, this is clearer.
    const [scopedRes, orphanRes] = await Promise.all([
      projectIds.length
        ? supabase
            .from('course_tasks')
            .select('id, project_id, title, status, effort, work_type, day_order, do_date, pillar, notion_url')
            .in('project_id', projectIds)
            .not('status', 'in', '(done,dropped,archived)')
            // Stable "project order" for next-action surfacing (matches Course).
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('course_tasks')
        .select('id, project_id, title, status, effort, work_type, day_order, do_date, pillar, notion_url')
        .is('project_id', null)
        .not('status', 'in', '(done,dropped,archived)'),
    ])
    if (scopedRes.error || orphanRes.error) {
      setError((scopedRes.error || orphanRes.error).message)
      setLoading(false)
      return
    }
    const tasks = [...(scopedRes.data ?? []), ...(orphanRes.data ?? [])]
    setPillars(buildPillars(projectsRes.data, tasks))
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // We need notion_url at writeback time but pillars state is async; keep a
  // ref of taskId → notion_url so writeback works even if pillars haven't
  // re-rendered yet (e.g., when a status change fires its own writeback
  // before refresh).
  const notionUrlByTask = useRef(new Map())
  useEffect(() => {
    const map = new Map()
    for (const p of pillars) {
      for (const t of p.openTasks ?? []) map.set(t.id, t.notionUrl ?? null)
      for (const proj of p.projects ?? [])
        for (const t of proj.tasks ?? []) map.set(t.id, t.notionUrl ?? null)
    }
    notionUrlByTask.current = map
  }, [pillars])

  // Map Today's UI status names → Course's enum, then write back to both
  // Supabase and (best-effort) Notion. Notion writeback is fire-and-forget;
  // its failure must not block the UI.
  const updateTaskStatus = useCallback(async (taskId, status) => {
    const patch = { status }
    if (status === 'done') patch.completed_date = new Date().toISOString().slice(0, 10)
    const res = await supabase.from('course_tasks').update(patch).eq('id', taskId)
    if (res.error) {
      console.error('updateTaskStatus failed', res.error)
      return
    }
    const notionUrl = notionUrlByTask.current.get(taskId)
    if (notionUrl) writebackTaskStatus(notionUrl, status)
  }, [])

  // Generic patch — used by push/drop/weekly + their undo replays. Mirrors
  // status and do_date to Notion when present in the patch.
  const updateTask = useCallback(async (taskId, patch) => {
    const res = await supabase.from('course_tasks').update(patch).eq('id', taskId)
    if (res.error) {
      console.error('updateTask failed', res.error)
      return
    }
    const notionUrl = notionUrlByTask.current.get(taskId)
    if (!notionUrl) return
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      writebackTaskStatus(notionUrl, patch.status)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'do_date')) {
      writebackTaskDoDate(notionUrl, patch.do_date)
    }
  }, [])

  // Assign an orphan task to a pillar (Arrow/Sunny/Life) or clear it back to
  // unassigned. Writes pillar to course_tasks and mirrors to Notion's Area
  // relation (best-effort — fails silently if Notion isn't configured for it).
  const updateTaskPillar = useCallback(async (taskId, pillarId) => {
    const tagByPillarId = { arrow: 'Arrow', sunny: 'Sunny', life: 'Life', sidegig: 'Side gig' }
    const tag = pillarId ? tagByPillarId[pillarId] ?? null : null
    const res = await supabase.from('course_tasks').update({ pillar: tag }).eq('id', taskId)
    if (res.error) {
      console.error('updateTaskPillar failed', res.error)
      return
    }
    // Refresh so the task moves between pillar buckets immediately.
    refresh()
    const notionUrl = notionUrlByTask.current.get(taskId)
    if (notionUrl) writebackTaskPillar(notionUrl, pillarId)
  }, [refresh])

  // Look up a task's current persistable fields by id (so push/drop/weekly
  // handlers can capture pre-state for undo). Returns null if not found.
  const getTaskSnapshot = useCallback(
    (taskId) => {
      for (const p of pillars) {
        for (const t of p.openTasks ?? []) {
          if (t.id === taskId) return { status: t.status, do_date: t.doDate ?? null }
        }
        for (const proj of p.projects ?? []) {
          for (const t of proj.tasks ?? []) {
            if (t.id === taskId) return { status: t.status, do_date: t.doDate ?? null }
          }
        }
      }
      return null
    },
    [pillars]
  )

  return {
    pillars,
    loading,
    error,
    refresh,
    updateTaskStatus,
    updateTask,
    updateTaskPillar,
    getTaskSnapshot,
  }
}
