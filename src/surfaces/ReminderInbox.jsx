// Reminders inbox card for Triage. See src/lib/useReminderInbox.js for the
// data flow; this file is presentation plus the destination picker.

import React from 'react'
import { useReminderInbox } from '../lib/useReminderInbox.js'

const SHOW_FIRST = 5

// Destinations offered by Change. `kind` is the capture router's kind.
const DESTS = [
  { kind: 'course_task', label: 'Course+ task', project: true },
  { kind: 'course_note', label: 'Course+ note', project: true },
  { kind: 'stock_out', label: 'Stock shopping list' },
  { kind: 'stock_staple', label: 'Stock staple' },
  { kind: 'stock_idea', label: 'Stock idea' },
  { kind: 'ink_thought', label: 'Ink thought' },
  { kind: 'break_lookup', label: 'Break look-up' },
  { kind: 'cue_add:movie', label: 'Cue movie' },
  { kind: 'cue_add:tv', label: 'Cue show' },
  { kind: 'cue_add:book', label: 'Cue book' },
  { kind: 'cue_add:podcast', label: 'Cue podcast' },
]

const KIND_LABEL = {
  course_task: 'Course+ task',
  course_note: 'Course+ note',
  stock_out: 'Stock list',
  stock_staple: 'Stock staple',
  stock_idea: 'Stock idea',
  ink_thought: 'Ink thought',
  break_lookup: 'Break look-up',
  break_flashcard: 'Break card',
  cue_add: 'Cue',
}

function describe(item) {
  const base = KIND_LABEL[item.kind] || item.kind
  if (item.kind === 'cue_add') return `${base} ${item.media || 'movie'} · ${item.text}`
  if (item.kind === 'course_task' || item.kind === 'course_note') {
    return item.project ? `${base} · ${item.project}` : base
  }
  return `${base} · ${item.text}`
}

function ago(iso) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function Picker({ row, projects, onCancel, onFile }) {
  const first = row.suggestion?.[0]
  const initialDest = first
    ? (first.kind === 'cue_add' ? `cue_add:${first.media || 'movie'}` : first.kind)
    : 'course_task'
  const [dest, setDest] = React.useState(DESTS.some((d) => d.kind === initialDest) ? initialDest : 'course_task')
  const [text, setText] = React.useState(first?.text || row.title)
  const [project, setProject] = React.useState(first?.project || '')
  const meta = DESTS.find((d) => d.kind === dest)

  const file = () => {
    const [kind, media] = dest.split(':')
    const t = text.trim()
    if (!t) return
    onFile([{
      kind,
      text: t,
      // A note needs a headline; reuse the text.
      title: kind === 'course_note' || kind === 'stock_idea' ? t.slice(0, 80) : null,
      back: null,
      project: meta?.project && project ? project : null,
      due: null,
      media: kind === 'cue_add' ? media : null,
    }])
  }

  return (
    <div className="rinbox-picker">
      <select className="rinbox-select" value={dest} onChange={(e) => setDest(e.target.value)}>
        {DESTS.map((d) => <option key={d.kind} value={d.kind}>{d.label}</option>)}
      </select>
      {meta?.project && (
        <select className="rinbox-select" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">no project</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      <input className="rinbox-input" value={text} onChange={(e) => setText(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') file(); if (e.key === 'Escape') onCancel() }} />
      <div className="rinbox-actions">
        <button className="rinbox-btn rinbox-btn-primary" onClick={file}>file it</button>
        <button className="rinbox-btn" onClick={onCancel}>cancel</button>
      </div>
    </div>
  )
}

export function ReminderInbox() {
  const { inbox, projects, move, keep, today, done } = useReminderInbox()
  const [showAll, setShowAll] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [busy, setBusy] = React.useState(null)
  const [flash, setFlash] = React.useState(null)

  if (inbox.length === 0) return null

  const file = async (row, items) => {
    setBusy(row.id)
    setEditing(null)
    try {
      const line = await move(row, items)
      setFlash({ ok: true, text: line })
    } catch (e) {
      setFlash({ ok: false, text: `${row.title}: ${e.message}` })
    } finally {
      setBusy(null)
    }
  }

  const visible = showAll ? inbox : inbox.slice(0, SHOW_FIRST)

  return (
    <div className="cal-summary rinbox">
      <div className="cal-summary-label rinbox-label">
        <span>reminders inbox</span>
        <span className="rinbox-count">{inbox.length}</span>
      </div>

      {flash && (
        <div className={`rinbox-flash${flash.ok ? '' : ' rinbox-flash-err'}`} onClick={() => setFlash(null)}>
          {flash.text}
        </div>
      )}

      {visible.map((r) => (
        <div key={r.id} className="rinbox-row">
          <div className="tmrw-rem-title">{r.title}</div>
          <div className="tmrw-rem-meta">
            {[ago(r.capturedAt), r.suggestion
              ? `suggest: ${r.suggestion.map(describe).join(' + ')}`
              : (r.suggested ? 'no confident suggestion' : 'suggestion pending')]
              .filter(Boolean).join(' · ')}
          </div>

          {editing === r.id ? (
            <Picker row={r} projects={projects} onCancel={() => setEditing(null)} onFile={(items) => file(r, items)} />
          ) : (
            <div className="rinbox-actions">
              {r.suggestion && (
                <button className="rinbox-btn rinbox-btn-primary" disabled={busy === r.id}
                        onClick={() => file(r, r.suggestion)}>move</button>
              )}
              <button className="rinbox-btn" onClick={() => setEditing(r.id)}>
                {r.suggestion ? 'change' : 'file to...'}
              </button>
              <button className="rinbox-btn" onClick={() => today(r)}>today</button>
              <button className="rinbox-btn" onClick={() => keep(r)}>keep</button>
              <button className="rinbox-btn" onClick={() => done(r)}>done</button>
            </div>
          )}
        </div>
      ))}

      {inbox.length > SHOW_FIRST && (
        <button className="rinbox-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'show fewer' : `show all ${inbox.length}`}
        </button>
      )}
    </div>
  )
}
