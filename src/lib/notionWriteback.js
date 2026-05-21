import { supabase } from './supabase'

// Mirror of Course's writeback contract (course-app/index.html). Today is
// allowed to mutate the same Notion properties Course mutates — anything
// else is owned by Course and must not be touched here.

const TASK_STATUS_TO_NOTION = {
  triage: 'Triage',
  next: 'Next',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  done: 'Done',
  dropped: 'Dropped',
  pushed: 'Pushed',
}

function extractNotionPageId(notionUrl) {
  if (!notionUrl) return null
  const m = notionUrl.match(/([0-9a-f]{32})/i)
  return m ? m[1] : null
}

async function invokeUpdatePage(pageId, body) {
  const { error } = await supabase.functions.invoke('course-notion-fetch', {
    body: { action: 'update_page', page_id: pageId, body },
  })
  if (error) console.warn('Notion writeback failed:', error.message ?? error)
}

export async function writebackTaskStatus(notionUrl, status) {
  const pageId = extractNotionPageId(notionUrl)
  const notionStatus = TASK_STATUS_TO_NOTION[status]
  if (!pageId || !notionStatus) return
  const properties = { 'Task Status': { select: { name: notionStatus } } }
  // Match Course's behavior: when flipping to done, also tick the Complete
  // checkbox, since the user's Notion workflow tracks open-ness via Complete
  // rather than Task Status.
  if (status === 'done') properties.Complete = { checkbox: true }
  await invokeUpdatePage(pageId, { properties })
}

export async function writebackTaskDoDate(notionUrl, isoDate) {
  const pageId = extractNotionPageId(notionUrl)
  if (!pageId) return
  await invokeUpdatePage(pageId, {
    properties: {
      'Do date': isoDate ? { date: { start: isoDate } } : { date: null },
    },
  })
}

// Notion's Tasks DB uses an "Area" relation (not a Pillar select), pointing
// to records in an Areas database. To mirror pillar -> Area, we need each
// Area's Notion page ID. Paste them in below once known; until then this
// writeback is a no-op (and Today's Supabase pillar still updates fine).
const AREA_PAGE_ID_BY_PILLAR = {
  arrow: null, // e.g. '1234567890abcdef1234567890abcdef'
  sunny: null,
  life: null,
}

export async function writebackTaskPillar(notionUrl, pillarId) {
  const pageId = extractNotionPageId(notionUrl)
  if (!pageId) return
  if (pillarId && !AREA_PAGE_ID_BY_PILLAR[pillarId]) {
    // Area page IDs not configured yet — skip Notion mirror silently. Today's
    // Supabase column still got updated, so Course can read pillar from there.
    return
  }
  const areaId = pillarId ? AREA_PAGE_ID_BY_PILLAR[pillarId] : null
  await invokeUpdatePage(pageId, {
    properties: {
      Area: { relation: areaId ? [{ id: areaId }] : [] },
    },
  })
}
