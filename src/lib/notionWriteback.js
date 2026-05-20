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
