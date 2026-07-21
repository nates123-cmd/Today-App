# Today app — Proposed Schedule Generator — design handoff

One paste-ready packet for a Claude chat/design session. Sections:
1. Goal + where it lives
2. Prior art already in the spec (read this — it answers half the questions)
3. Real data shapes (verbatim, the contracts to build against)
4. Output contract
5. Open design questions
6. Suggested code shape
7. Dependency note

---

## 1. Goal + where it lives

Auto-generate a **draft schedule for tomorrow**: deep-work blocks fitted around
the day's hard-line events, ranked by what matters. Output = draggable blocks
the user reviews tomorrow morning.

- App: "Today" — morning-processing ritual PWA (Vite + React, shared Supabase,
  per-user RLS).
- Surface: `DayOverlay.jsx`, Tomorrow view → "Schedule" mode. Hard-line events,
  triage queue, and week tile are already live; this is the one unbuilt piece
  (currently a "not built yet" placeholder).
- Sibling: `Scheduling.jsx` = the existing **manual** drag/drop/resize calendar
  for *today*. The generator's blocks should be editable here too.

---

## 2. Prior art already in the spec (Today Spec v2.md)

The generator is the **automatic** version of mechanics the spec already
defines. Include §5–§7 of the spec in the chat. Key decisions already made:

**Time bank (§6 Scheduling).** Each pillar already exposes:
- Counts `3P 2D 5A` = projects / deep tasks / admin tasks.
- Time remaining = sum of all open tasks' estimates. "Live remaining work, not
  a fixed budget" — shrinks as tasks complete.
The generator should consume this time bank, not reinvent it.

**Deep/admin classification (§6).** Explicit task depth wins (set via swipe
menu); otherwise heuristic: **tasks ≥30m = "deep", under 30m = "admin".**
→ This is your block-classification + min-size rule, already decided.

**Suggest-block overlay (§7 Live).** The per-slot manual suggester:
- "Calendar suggestion" (primary task) + "Also open right now" (pickable open
  tasks) + **focus-length pills: 15 / 25 / 45 / 60**.
- Multi-select queues items back-to-back in one focus session.
→ The generator generalizes this single-slot suggestion to a whole day. Block
  sizes should speak the same 15/25/45/60 vocabulary.

**Open tasks, pillar-prioritized (§7).** "Top-N pillar-prioritized tasks not
yet placed on the calendar." → There is an intended pillar priority order;
confirm it (see Q1).

**Initial state (§6).** Day boots with only immovable items: hard-line ical
meetings (read-only) + `autoPlaced` routines. Everything else is placed on top.
→ The generator fills *around* those immovables.

---

## 3. Real data shapes (build against these contracts)

### Tasks — `course_tasks` via `usePillars` (`shapeTask`)
```
{
  id, label (title), est (effort string, e.g. "15m"/"2h", may be null),
  estConfirmed (bool: effort set),
  depth ('deep' | 'admin' | null — from work_type),
  status ('next' | 'in_progress' | 'waiting' | 'blocked'),  // done/dropped/archived/triage already excluded
  doDate (ISO or null),
  projectId, pillar ('arrow'|'sunny'|'sidegig'|'life'| null), notionUrl
}
```
Grouped into 5 pillars: **arrow, sunny, sidegig, life, open** (open = projectId
null). NOTE: DB pillar casing/spelling is inconsistent ('Arrow'/'arrow',
'side'/'Side gig') — `usePillars` already normalizes; build on its output, not
raw rows.

### Projects — `course_projects`
`{ id, name, status, pillar, work_area, due_date, outcome }`

### Schedule store — `placed_blocks` (owned by Today)
```
DB row: { id, date, hour (numeric, decimal: 11.5 = 11:30), duration_minutes,
          type, title, pillar, project_id, source, source_id }
type:   'meeting' | 'routine' | 'pillar' | 'adhoc' | 'prep'
        (deep-work blocks carry a pillar id as `type` in current data)
source: 'ical' | 'tide_routine' | 'today_user' | 'today_proposed'(new) | ...
```
- Tomorrow's **hard-line events** already live here: `source='ical'`,
  `type='meeting'`, `pillar` null.
- **Routines** (Gym 18:00, Lunch) may be here too (`type='routine'`).
- Persist via `usePlacedBlocks(tomorrowISO).setPlaced(updater)` — it diffs and
  fires insert/update/delete automatically. UI block shape (camelCase):
  `{ id, type, hour, duration, title, pillar, projectId, source, sourceId }`.

### Readiness — `tide_oura_daily` (row per date)
`{ readiness_score, total_sleep_min, hrv_avg, resting_hr }` — optional input to
modulate daily load.

### Ranking helper — `lib/surfaceActions.js` (reuse this)
```
daysFromToday(iso) -> calendar-day delta (negative = overdue, urgent)
surfaceActions(tasks) -> picks next-action per project:
   prefers status==='next', flags urgent when a doDate is <= 3 days out
   returns { state:'empty'|'normal'|'urgent_single'|'urgent_double', primary, secondary?, count }
```

### Grid conventions — `Scheduling.jsx`
```
FIRST_HOUR = 8        // working window 08:00
LAST_HOUR  = 18       //                18:00
STEP_MIN   = 15       // snap granularity
hour is decimal; conflicts with hard-line meetings reject the drop
```

---

## 4. Output contract

A list of proposed blocks persisted to `placed_blocks` with `date = tomorrowISO`
and a **distinct `source`** (suggest `today_proposed`) so they can be:
(a) rendered as "proposed / draggable," (b) regenerated by wiping just that
source, (c) distinguished from user-placed (`today_user`) and ical blocks.

Each block: `{ hour, duration_minutes, type:<pillar id>, title, pillar,
project_id }`, snapped to 15-min steps, inside 08:00–18:00, non-overlapping with
existing `meeting`/`routine` blocks.

---

## 5. Open design questions

1. **Pillar priority** — confirm the order (spec implies a fixed one, e.g.
   Arrow > Sunny > Side gig > Life > Open?). Fixed, or weighted by backlog
   size / urgency?
2. **Task ranking within the day** — blend of pillar priority + `doDate`
   urgency (`daysFromToday`) + project `due_date` + `status==='next'`. What
   weighting?
3. **Daily load** — how many deep blocks / how many focus-hours target? Fixed,
   or modulated by `readiness_score` and the density of hard-line events?
4. **Block sizing** — from `est` when present (snap to 15/25/45/60), default
   length when absent (60? 90?). Min 15m (or 30m per the deep/admin line).
5. **Placement** — pack early vs spread? Buffers between meetings? Honor
   lunch/routine obstacles? Avoid deep work straight after a long meeting?
6. **Pillar balance** — guarantee one block per active pillar, or pure
   priority (may stack one pillar)? Coverage vs max-value.
7. **Regeneration** — re-run overwrites all `today_proposed`, or preserves
   blocks the user already dragged/edited? How are user edits protected?
8. **Commit flow** — when does a proposal become the committed day: auto on the
   morning open, or explicit accept? Does accept flip `source`
   `today_proposed` → `today_user`?
9. **Degenerate cases** — no events, fully booked, empty backlog, no Oura row.

---

## 6. Suggested code shape (keep it testable)

Pure function, no I/O — unit-testable like `surfaceActions`:
```
proposeSchedule({ tasks, events, routines, readiness, window })
  -> blocks[]   // { hour, duration_minutes, type, title, pillar, projectId }
```
A thin hook/handler reads inputs (usePillars + usePlacedBlocks(tomorrow) +
oura) and writes the result. Keep the heuristic out of React.

---

## 7. Dependency note (not part of the generator)

Tomorrow's hard-line events only populate once the **iOS Calendar Shortcut** is
extended to ingest tomorrow (today-only now; `ical-ingest` edge fn already
accepts any date). The generator must degrade gracefully when tomorrow's events
are empty.
