import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture every functions.invoke call so we can assert the exact payload the
// REAL writeback functions shape and send. We mock ../src/lib/supabase so no
// network/env is touched; the writeback module under test is unmodified.
// The factory is hoisted above imports, so the mock fn is created INSIDE it
// and pulled out afterwards via the (mocked) module — no top-level capture var.
vi.mock('../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) } },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  writebackTaskStatus,
  writebackTaskDoDate,
  writebackTaskPillar,
} from '../src/lib/notionWriteback.js'

const invoke = supabase.functions.invoke

// A canonical Notion URL containing a 32-hex page id.
const PAGE_ID = '2d5706a32fa580e789dbc8b306b7fd6f'
const URL = `https://www.notion.so/My-Task-${PAGE_ID}`

beforeEach(() => invoke.mockClear())

// Pull the (action, page_id, body) the writeback sent to course-notion-fetch.
function lastBody() {
  expect(invoke).toHaveBeenCalledTimes(1)
  const [fn, opts] = invoke.mock.calls[0]
  expect(fn).toBe('course-notion-fetch')
  expect(opts.body.action).toBe('update_page')
  return opts.body
}

describe('writebackTaskStatus', () => {
  it('maps a UI status to the Notion select name', async () => {
    await writebackTaskStatus(URL, 'in_progress')
    const body = lastBody()
    expect(body.page_id).toBe(PAGE_ID)
    expect(body.body.properties['Task Status']).toEqual({ select: { name: 'In Progress' } })
    expect(body.body.properties.Complete).toBeUndefined()
  })

  it('also ticks the Complete checkbox when status is done', async () => {
    await writebackTaskStatus(URL, 'done')
    const body = lastBody()
    expect(body.body.properties['Task Status']).toEqual({ select: { name: 'Done' } })
    expect(body.body.properties.Complete).toEqual({ checkbox: true })
  })

  it('no-ops (no invoke) for an unknown status', async () => {
    await writebackTaskStatus(URL, 'banana')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('no-ops when the URL has no extractable page id', async () => {
    await writebackTaskStatus('https://notion.so/no-id-here', 'next')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('no-ops for null url', async () => {
    await writebackTaskStatus(null, 'next')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('writebackTaskDoDate', () => {
  it('sets a date payload when given an ISO date', async () => {
    await writebackTaskDoDate(URL, '2026-06-15')
    const body = lastBody()
    expect(body.body.properties['Do date']).toEqual({ date: { start: '2026-06-15' } })
  })

  it('clears the date (date: null) when given null', async () => {
    await writebackTaskDoDate(URL, null)
    const body = lastBody()
    expect(body.body.properties['Do date']).toEqual({ date: null })
  })

  it('no-ops for a url without a page id', async () => {
    await writebackTaskDoDate('nope', '2026-06-15')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('writebackTaskPillar', () => {
  it('maps a configured pillar to its Area relation id', async () => {
    await writebackTaskPillar(URL, 'arrow')
    const body = lastBody()
    expect(body.body.properties.Area).toEqual({
      relation: [{ id: '2d5706a32fa580e789dbc8b306b7fd6f' }],
    })
  })

  it('clears the Area relation when pillarId is null', async () => {
    await writebackTaskPillar(URL, null)
    const body = lastBody()
    expect(body.body.properties.Area).toEqual({ relation: [] })
  })

  it('silently skips Notion mirror for a pillar with no configured Area id (e.g. sidegig)', async () => {
    await writebackTaskPillar(URL, 'sidegig')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('no-ops for a url without a page id', async () => {
    await writebackTaskPillar('nope', 'arrow')
    expect(invoke).not.toHaveBeenCalled()
  })
})
