import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Today's four pillar buckets. The first three map to Course's pillar tag
// strings (capitalized in the DB); the fourth ('open') is synthetic — it's
// Course tasks whose project_id is null (the prototype called this "Open
// Tasks"). Order is fixed per spec §5: Arrow → Sunny → Life → Open.
const PILLAR_DEFS = [
  { id: 'arrow', name: 'Arrow', color: 'arrow', courseTag: 'Arrow' },
  { id: 'sunny', name: 'Sunny', color: 'sunny', courseTag: 'Sunny' },
  { id: 'life', name: 'Life', color: 'life', courseTag: 'Life' },
  { id: 'open', name: 'Open Tasks', color: 'open', courseTag: null },
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
  }
}

function buildPillars(projects, tasks) {
  const byProject = new Map()
  const orphans = []
  for (const t of tasks) {
    if (HIDDEN_STATUSES.has(t.status)) continue
    if (!t.project_id) {
      orphans.push(t)
      continue
    }
    const arr = byProject.get(t.project_id) ?? []
    arr.push(t)
    byProject.set(t.project_id, arr)
  }

  const projectsByPillar = new Map()
  for (const p of projects) {
    const tag = (p.pillar || '').trim() || null
    if (!projectsByPillar.has(tag)) projectsByPillar.set(tag, [])
    projectsByPillar.get(tag).push({
      id: p.id,
      name: p.name,
      meta: projectMeta(p),
      tasks: (byProject.get(p.id) ?? []).map(shapeTask),
    })
  }

  return PILLAR_DEFS.map((def) => {
    if (def.id === 'open') {
      return {
        id: def.id,
        name: def.name,
        color: def.color,
        openTasks: orphans.map(shapeTask),
        projects: [],
      }
    }
    return {
      id: def.id,
      name: def.name,
      color: def.color,
      openTasks: [],
      projects: projectsByPillar.get(def.courseTag) ?? [],
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
      .select('id, name, status, pillar, work_area')
      .eq('status', 'active')
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
            .select('id, project_id, title, status, effort, work_type, day_order, do_date')
            .in('project_id', projectIds)
            .not('status', 'in', '(done,dropped,archived)')
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('course_tasks')
        .select('id, project_id, title, status, effort, work_type, day_order, do_date')
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

  // Map Today's UI status names → Course's enum, then write back.
  const updateTaskStatus = useCallback(async (taskId, status) => {
    const patch = { status }
    if (status === 'done') patch.completed_date = new Date().toISOString().slice(0, 10)
    const res = await supabase.from('course_tasks').update(patch).eq('id', taskId)
    if (res.error) {
      console.error('updateTaskStatus failed', res.error)
    }
  }, [])

  // Generic patch — used by push/drop/weekly + their undo replays.
  const updateTask = useCallback(async (taskId, patch) => {
    const res = await supabase.from('course_tasks').update(patch).eq('id', taskId)
    if (res.error) console.error('updateTask failed', res.error)
  }, [])

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

  return { pillars, loading, error, refresh, updateTaskStatus, updateTask, getTaskSnapshot }
}
