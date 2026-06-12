import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useVisibilityKey } from './useVisibilityKey'

// Today's pillar buckets. The first four map to a Course+ AREA (cp_areas.name),
// matched case/spelling-insensitively via pillarTagToId. A project's pillar is
// derived from its area (cp_projects.area_id → cp_areas.name), since Course+
// has no per-project "pillar" field — areas ARE the pillars. The fifth ('open')
// is synthetic: projects in the "Unfiled" area (or any area that maps to no
// pillar) land here. Course+ has no orphan tasks (every cp_task has a
// project_id), so the old per-task "Open Tasks" path is effectively empty.
const PILLAR_DEFS = [
  { id: 'arrow',   name: 'Arrow',      color: 'arrow' },
  { id: 'sunny',   name: 'Sunny',      color: 'sunny' },
  { id: 'sidegig', name: 'Side gig',   color: 'sidegig' },
  { id: 'life',    name: 'Life',       color: 'life' },
  { id: 'open',    name: 'Open Tasks', color: 'open' },
]

// Today UI statuses that are NOT part of the triage backlog (hidden at read).
const HIDDEN_STATUSES = new Set(['done', 'dropped', 'archived', 'triage'])

// --- Course+ task status <-> Today status ----------------------------------
// Course+ stores task state across two columns: `done` (bool) and `task_status`
// (none/next/in-progress/waiting/done/null). Today uses a single status string
// ('open' | 'next' | 'in_progress' | 'waiting' | 'done' | 'dropped' | ...).
function cpTaskToStatus(t) {
  if (t.done) return 'done'
  switch (t.task_status) {
    case 'in-progress': return 'in_progress'
    case 'waiting':     return 'waiting'
    case 'next':        return 'next'
    default:            return t.next ? 'next' : 'open'
  }
}

// Translate a Today status string into a cp_tasks column patch. Course+ has no
// 'dropped'/'triage'/'archived' concept: 'dropped' is hidden by marking done;
// 'triage'/'blocked' park the task as 'waiting' (closest available state).
function statusToCpPatch(status) {
  switch (status) {
    case 'done':        return { done: true,  task_status: 'done',        next: false }
    case 'next':        return { done: false, task_status: 'next',        next: true }
    case 'in_progress': return { done: false, task_status: 'in-progress', next: false }
    case 'waiting':     return { done: false, task_status: 'waiting',     next: false }
    case 'triage':      return { done: false, task_status: 'waiting',     next: false }
    case 'blocked':     return { done: false, task_status: 'waiting',     next: false }
    case 'dropped':     return { done: true,  task_status: 'none',        next: false }
    case 'open':
    case null:
    case undefined:     return { done: false, task_status: 'none',        next: false }
    default:            return { done: false, task_status: status,        next: false }
  }
}

// Translate a generic Today patch ({ status?, do_date? }) into cp_tasks columns.
function patchToCpRow(patch) {
  const row = {}
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    Object.assign(row, statusToCpPatch(patch.status))
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'do_date')) {
    row.due_date = patch.do_date
  }
  // Allow callers to pass cp-native fields straight through.
  for (const k of ['due_date', 'work_type', 'sort', 'label']) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) row[k] = patch[k]
  }
  return row
}

function projectMeta(p) {
  return p.status || 'active'
}

function shapeTask(t) {
  return {
    id: t.id,
    label: t.label,
    // Course+ has no effort estimate field — Today supplies its own guesses.
    est: null,
    estConfirmed: false,
    depth: t.work_type === 'deep' || t.work_type === 'admin' ? t.work_type : null,
    status: cpTaskToStatus(t),
    doDate: t.due_date,
    projectId: t.project_id,
    pillar: t._pillar ?? null,
    // Course+ tasks are not Notion-backed; no writeback URL.
    notionUrl: null,
  }
}

// Map a Course+ area name to Today's pillar id. Tolerant of casing/spelling:
// 'Arrow', 'Slow Down Sunny', 'Side', 'Life'; 'Unfiled'/unknown → null → open.
function pillarTagToId(tag) {
  if (!tag) return null
  const norm = tag.trim().toLowerCase()
  if (norm === 'arrow' || norm === 'life') return norm
  if (norm.includes('sunny')) return 'sunny'
  if (norm.startsWith('side')) return 'sidegig'
  return null
}

function buildPillars(projects, tasks) {
  const byProject = new Map()
  const orphansByPillar = { arrow: [], sunny: [], life: [], sidegig: [], __unassigned__: [] }
  for (const t of tasks) {
    if (HIDDEN_STATUSES.has(cpTaskToStatus(t))) continue
    if (!t.project_id) {
      // Course+ has no orphan tasks today, but keep the path defensive.
      orphansByPillar.__unassigned__.push(t)
      continue
    }
    const arr = byProject.get(t.project_id) ?? []
    arr.push(t)
    byProject.set(t.project_id, arr)
  }

  const projectsByPillar = new Map()
  for (const p of projects) {
    // Bucket by the project's area-derived pillar. Active projects whose area
    // maps to nothing (e.g. 'Unfiled') route to the synthetic 'open' bucket so
    // every active Course+ project surfaces somewhere.
    const pid = pillarTagToId(p._pillar) ?? 'open'
    if (!projectsByPillar.has(pid)) projectsByPillar.set(pid, [])
    projectsByPillar.get(pid).push({
      id: p.id,
      name: p.name,
      meta: projectMeta(p),
      dueDate: null,
      outcome: null,
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
        projects: projectsByPillar.get('open') ?? [],
      }
    }
    return {
      id: def.id,
      name: def.name,
      color: def.color,
      openTasks: orphansByPillar[def.id].map(shapeTask),
      projects: projectsByPillar.get(def.id) ?? [],
    }
  })
}

export function usePillars() {
  const [pillars, setPillars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Bumps whenever the app/tab is re-shown so we re-pull fresh Course+ data on
  // resume (parity with the old course_projects re-pull behaviour).
  const visibilityKey = useVisibilityKey()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Areas → pillar lookup. cp_projects has no pillar; the area is the pillar.
    const [areasRes, projectsRes] = await Promise.all([
      supabase.from('cp_areas').select('id, name'),
      supabase
        .from('cp_projects')
        .select('id, area_id, name, status, priority, sort')
        .eq('status', 'active')
        .order('sort', { ascending: true, nullsFirst: false }),
    ])
    if (areasRes.error || projectsRes.error) {
      setError((areasRes.error || projectsRes.error).message)
      setLoading(false)
      return
    }
    const areaNameById = new Map((areasRes.data ?? []).map((a) => [a.id, a.name]))
    const projects = (projectsRes.data ?? []).map((p) => ({
      ...p,
      _pillar: areaNameById.get(p.area_id) ?? null,
    }))
    const pillarByProject = new Map(projects.map((p) => [p.id, p._pillar]))

    const projectIds = projects.map((p) => p.id)
    const tasksRes = projectIds.length
      ? await supabase
          .from('cp_tasks')
          .select('id, project_id, label, done, next, work_type, task_status, due_date, sort')
          .in('project_id', projectIds)
          .eq('done', false)
          .order('sort', { ascending: true, nullsFirst: false })
      : { data: [], error: null }
    if (tasksRes.error) {
      setError(tasksRes.error.message)
      setLoading(false)
      return
    }
    // Tag each task with its project's pillar (drives orphan/defensive paths).
    const tasks = (tasksRes.data ?? []).map((t) => ({
      ...t,
      _pillar: pillarByProject.get(t.project_id) ?? null,
    }))
    setPillars(buildPillars(projects, tasks))
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, visibilityKey])

  // Course+ tasks aren't Notion-backed, so there's no notion_url ref to keep.

  // Update a task's status. Maps Today's status string onto cp_tasks columns.
  const updateTaskStatus = useCallback(async (taskId, status) => {
    const res = await supabase.from('cp_tasks').update(statusToCpPatch(status)).eq('id', taskId)
    if (res.error) console.error('updateTaskStatus failed', res.error)
  }, [])

  // Generic patch — used by push/drop/weekly + their undo replays. Translates
  // Today-vocab patch keys ({ status, do_date }) into cp_tasks columns.
  const updateTask = useCallback(async (taskId, patch) => {
    const row = patchToCpRow(patch)
    if (!Object.keys(row).length) return
    const res = await supabase.from('cp_tasks').update(row).eq('id', taskId)
    if (res.error) console.error('updateTask failed', res.error)
  }, [])

  // Course+ has no per-task pillar (pillar = the project's area), and no orphan
  // tasks to re-home, so pillar reassignment is a no-op here. Kept for callers.
  const updateTaskPillar = useCallback(async () => {
    refresh()
  }, [refresh])

  // Look up a task's persistable fields by id (so push/drop/weekly handlers can
  // capture pre-state for undo). Returns null if not found.
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
