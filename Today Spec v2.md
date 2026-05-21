# Today — App Spec (v2)

Refreshed against the working prototype (`Today App.html`). Supersedes
`uploads/today-spec.md` where the two disagree. Pair this with
`personal-os-spec.md` (suite-level context) and `course-spec.md` (Course-narrow,
which owns the Pillars/projects schema Today reads from).

---

## 1. Product hypothesis

**Today is an active morning processing ritual, not a passive cockpit.**

The default failure mode of every productivity tool is the endless to-do
list: items pile up faster than they get processed, and the tool degenerates
into a backlog museum. Today resists this by forcing a triage step before
any execution — every Pillar's open items get processed each morning,
decisions get made (in, out, push, drop), and the day's commitments are
explicit before work begins.

The opinionatedness is the feature. Bad days where the ritual feels heavy
are expected. The cost of the ritual is paid in attention up front so the
rest of the day can run on commitments rather than reactivity.

---

## 2. Surface architecture

Vertical-scroll spine of distinct surfaces. Horizontal swipe (or the
yesterday/today/tomorrow spine at the bottom of any non-welcome page)
navigates the three-day spine.

### Vertical spine

1. **Welcome screen** — first open of the day only
2. **Page one — Morning** — passive grounding
3. **Page two — Triage** — active processing of Pillars
4. **Page three — Scheduling** — placing committed work on the clock
5. **Page four — Live** — workday home base (~9a–6p)

Each page is its own scroll container. Scrolling **within** a page does not
advance the pager; you have to swipe the whole page edge to move between
pages. Scroll position within a page is preserved across navigations.

### Horizontal spine

- **Today** ↔ **Yesterday** — reflection surface (v1 designed; see §9)
- **Today** ↔ **Tomorrow** — preview surface (v1 designed; see §9)
- Hard stops at Yesterday and Tomorrow.

### Drill-ins from page four

- **Pillar Block view** — tap a placed block on the calendar
- **Full-screen calendar** — tap the calendar itself (surface TBD)
- **Task Bank** — tap the Open Tasks "see more" affordance (surface TBD)

### Navigation rules

- **Vertical = deeper into the day.**
- **Horizontal = different day.**
- **Tap = drill into detail.**
- **First open of the day** → welcome screen.
- **Subsequent opens** → resume where you last were (default page four once
  morning ritual complete).

---

## 3. Welcome screen

Threshold. Calm, ritual, intentional. Always present in the pager so it
stays reachable via swipe-up; on the first open of the day the app
lands on Welcome, on subsequent opens it resumes at the last page
visited but Welcome is one swipe away.

### Content

- **Date** — large, centered. Primary visual anchor.
- **Mantra** — pulled from Ink's `mantras` entity type.
- **First-up** — next calendar event. Title + absolute time + relative
  countdown.
- **Regen button** — small circular icon-button. Triggers the calendar
  Shortcut manually. Spins for ~900ms during sync.

### Behavior

- Swipe up (or tap "swipe to begin") → page one.
- Day-spine bar (yesterday/today/tomorrow) is **hidden** on the welcome
  screen.

---

## 4. Page one — Morning surface

Passive grounding. No triage, no scheduling. The job is to come online
for the day.

### Header

`Good morning, Nate` + `page 1 of 4` meta. No date — established on welcome.

### Content blocks (top to bottom)

#### Oura block (tappable card)

Pulls from Tide. Tappable — opens Tide for full stats. Card chrome:

- Label row: `Oura · tide` (left) / sync-time + delta + sync button (right).
- Sync button is a small circular icon-button. Clicking it spins the icon
  for ~900ms and refreshes the "synced 6:42a" timestamp to "synced Hh:MMa/p".
- Click is `stopPropagation`-ed so the sync button doesn't also open Tide.
- Body: two-column split.
  - Left: large readiness score in display type + `readiness` mono caption.
  - Right column: stacked rows for HRV, RHR, temp, etc. Each row is
    `label / value · delta`. Delta colored by direction (green up / orange
    down).

#### Health insight (tappable card)

One-line generated insight. Pillar- and context-aware. Has a regen
button (same circular icon pattern). Tapping regen cycles to the next
insight with a fade-in transition.

Card body itself is also tappable → opens Tide for the full insight.

#### Tide checklist

Daily habits + challenges. Each row: round check, label, mono tag
("habit" / "ink challenge" / etc).

Backfill: if yesterday's Tide stats are incomplete, a small inline
button appears at the bottom of the card — **clickable**, opens the
Yesterday overlay. Hover slides the arrow left to hint at the
navigation.

#### Morning grounding

2x2 launcher. Each tile shows an icon + name + source. Tapping opens
the destination app, which returns to Today on dismissal. **No
completion state.**

---

## 5. Page two — Triage surface

The core ritual. Active processing of every Pillar's open items.

### Header

- Title `Triage`
- Progress: `N / 4 committed` (collapsed-pillar count)
- Subtitle hint: `tasks: swipe → status · swipe ← time · hold to move`

### Calendar summary

Compact list of the day's hard-line events, color-coded by Pillar. Each
row is **long-pressable** → opens a small modal to add a Prep Block for
that event (15/30/60 min before).

### Pillar boxes

Ordered: Arrow, Sunny, Life, Open Tasks. Each box renders as a `.pillar`
with:

- **Sticky header.** As you scroll through the triage list, the current
  pillar's header (pillar dot, name, open-count, chevron) stays pinned
  at the top of the scroll area until the next pillar header arrives.
- Header tap → collapse / expand. Drag handle on the right for reordering
  pillars.
- Body: project list (each project is its own collapsible row), then a
  dedicated `Open tasks` section (pillar-scoped tasks not belonging to any
  project). A task is considered pillar-scoped if either its project's
  pillar tag matches OR it has a task-level `course_tasks.pillar` override
  (set via the "move to Arrow/Sunny/Life" chips on the synthetic Open
  Tasks pillar).
- **Synthetic Open Tasks pillar (bottom).** Holds orphan tasks with no
  project AND no task-level pillar tag. Each row shows three inline
  chips (Arrow / Sunny / Life) — tap one to set `course_tasks.pillar`,
  mirror to Notion's Area relation, and refresh. The task immediately
  moves into the picked pillar's openTasks.

**Collapse uses `display:none`, not unmount.** State inside the pillar
(task statuses, custom estimates, added tasks, ordering) survives
collapse → commit → reopen.

### Open-count label

Header shows `N open` where N = tasks not removed (pushed/dropped) AND
not status=done/dropped. Completing a task decrements N immediately;
this same count drives the Scheduling time bank (§6).

### Per-task gestures

| Gesture       | Action                                               |
|---------------|------------------------------------------------------|
| Right swipe   | Open **status menu** (next / done / waiting / blocked / dropped) |
| Left swipe    | Open **time + depth menu** (15/30/45/60m + deep/admin) |
| Long-press    | Enter reorder mode (drag to reposition or drop on another pillar/project) |
| Tap check     | Toggle done                                          |

Estimates display as `~15m` when the value is a **guess** (heuristic from
task title) and as `15m` once the user has explicitly confirmed via the
left-swipe menu. The `~` prefix vanishes on confirmation.

### Per-project gestures (project header)

| Gesture       | Action                                                |
|---------------|-------------------------------------------------------|
| Right swipe   | Push **entire project** (all its tasks) to tomorrow    |
| Left swipe    | Open menu — Drop entire project / Send to weekly review |
| Long-press    | Open project status modal                              |
| Tap           | Collapse / expand project                              |

Tap-to-collapse is **suppressed when a long-press fires** during the same
gesture, so holding the header to set status doesn't also collapse the
project.

### Project add-task affordance

A faint `+` button below each project's task list. Click → inline input
appears with a placeholder. Enter commits; the new task's estimate is
seeded from the title heuristic.

### Long-press menu on pillar header

Opens a menu with `create project in <pillar>`. Inline input slides in
below.

### Action toast (post-commit notification)

After any swipe-commit (push to tomorrow / drop / weekly review), a small
dark pill appears at the bottom-center of the screen:

- ~2 seconds lifespan, then fades out
- Message: `Pushed "Drane partnership" to tomorrow`, `Dropped 3 tasks`,
  `Sent task to weekly review`, etc.
- Undo chip on the right. Tap to restore the removed items.
- Toast is **portalled to the phone container**, not the page scroller,
  so it stays pinned to the visible bottom regardless of scroll.
- Dedupe: identical actions within 250ms collapse to one toast.

### Cross-pillar reassignment (drag-and-drop)

Long-press a task to pick it up. Drag onto another pillar's body — or
directly onto a project header — to reassign. A "→ Music" badge appears
on the task while a valid drop target is under the cursor; on commit, a
small reassignment toast confirms the move ("`Renew gym membership`
moved to Apartment").

### Collapse = commit

The only signal that a pillar has been triaged is that its box is
collapsed. Collapse is reversible. There is no "triaged but not
collapsed" state.

### Push-to-next-screen

When all pillars are collapsed: `schedule the day → page 3` CTA appears.
Otherwise: `N more pillars to commit` placeholder. Not auto-transition —
the click is the punctuation between triage and scheduling.

### iOS Reminders (deferred)

Reminders pulled in via Shortcut → appear as a scrollable section below
the pillars. Triaged with the same gestures. Routing on commit is TBD;
working assumption is they're treated as Life items.

---

## 6. Page three — Scheduling surface

Bridge between commitment and execution.

### Initial state

The page boots with **only the immovable items** placed on the calendar:

- **Hard-line meetings** from ical (Shortcut pull) — read-only on this
  surface.
- **Auto-placed routines** — routines marked `autoPlaced: true` (e.g.
  some breakfast routines).

Everything else (Pillar work blocks, manually-scheduled routines like Gym,
ad-hoc blocks) the user drags onto the calendar themselves.

### Hour-column calendar

Vertical 8a–6p column, scrollable. Hours rendered with mono labels in a
36px gutter. Placed blocks are absolutely positioned.

### Pillar dock (below the calendar)

Each Pillar appears as a horizontal "time bank" block:

- Label: `Arrow`
- Counts: `3P 2D 5A` (projects / deep tasks / admin tasks)
- Time remaining: `2.3h` (sum of all open tasks' estimates)

**The bank shrinks as you triage.** Completing a task in §5 removes its
minutes from this bank; status changes (done/dropped) immediately update
both the D/A counts and the total. The bank is **live remaining work**,
not a fixed budget.

Deep/admin classification: explicit task depth wins (set via the
left-swipe menu), otherwise heuristic — tasks ≥30m are "deep", under are
"admin".

### Routines dock

Pre-configured routines (Gym, etc) sit as draggable dock items below the
pillar bank. Placed routines fade to indicate they're on the calendar.

### Scheduling interactions

| Gesture                                | Action |
|----------------------------------------|--------|
| Drag a pillar block onto a slot        | Creates a new pillar block at that hour (30m default) |
| Drag a placed block                    | Move (snaps to 15-min steps) |
| Bottom-edge drag of a placed block     | Resize (15-min steps, min 15m) |
| Tap an empty slot                      | Open ad-hoc create input |
| Long-press a calendar event in §5      | Add a prep block (rendered as a dashed-border block here) |

While dragging, a drop preview shows where the block will land. Conflicts
with hard-line meetings show `✕ overlaps meeting` and reject the drop.

### What's deferred to v2

- Two-way ical sync. v1 reality: ical is read-only.

---

## 7. Page four — Live surface

Workday home base. Lowest-friction surface in the app.

### Header

`Today` (display title) + clock (mono, pulsing dot) + day-of-week subtitle.

### Past strip

Compact rows of blocks that already finished today, sorted **ascending**
(earliest first). Dimmed treatment.

### Now divider

`NOW · 11:14a` separator with a horizontal accent line.

### Active block — hero card

The block whose time range includes "now". Renders as a tall pillar-tinted
card:

- Pillar eyebrow (e.g. `Arrow · Morocco onboarding`)
- Active-now indicator (pulsing dot + `now` cap)
- Title + 1–3 tasks with checkboxes
- Footer: `2 / 3 done` + `focus ↗` CTA (drills into Pillar Block view)

When no block is active: shows an empty-state hint to drop something in.

### Suggested next (calendar-driven)

If a SUGGESTIONS row exists for an upcoming hour, render it as a button
below the active card. Tapping opens the **suggest-block overlay**.

### Suggest-block overlay

Full-bleed mini-surface. Anchored full-width, slides up.

- Eyebrow / title / sub: `suggest a block` / `What's next?` / `Pick one — or
  stack a few — and start a focus session.`
- **Calendar suggestion** section: the primary suggested task as a card.
  Checkmark indicator on the right.
- **Also open right now** section: list of OPEN_TASKS the user could pick
  up immediately, each with a checkmark.
- **Focus length** pills: 15 / 25 / 45 / 60.
- Footer actions: `not today` (dismisses the suggestion until tomorrow) /
  `snooze 1h` / primary CTA (`start focus · 25m` for one, `start focus · N
  blocks` for multi-select).
- Status hint below CTA: `starting: <task>` or `queued: N blocks`.

Multi-select queues the chosen items back-to-back inside a single focus
session.

### Upcoming strip

Compact rows for blocks coming up later today. Time gutter on the left.

### Open tasks

Top-N pillar-prioritized tasks not yet placed on the calendar. Each row:
checkbox + pillar dot + label + estimate. Header has a `See N more →`
toggle that expands the list to include open tasks aggregated from all
pillars/projects.

**Collapse is structurally protected.** Pending work should be visible
without action; the "see more" is for the *additional* list, not for
hiding the section entirely.

### Drill-ins from page four

- Tap a placed Pillar block (or `focus ↗`) → Pillar Block view (§8)
- Tap the calendar → full-screen calendar (TBD)
- Tap "see more" on Open Tasks → Task Bank (TBD)

---

## 8. Pillar Block view (drill-in from page four)

The lock-in surface. Reached by tapping a placed block on page four.

### Content

- Pillar header — the Pillar you're locked into
- Project list — projects committed to this block, tasks nested
- Task detail — every task fully editable here. Long-press → status menu.
- Next-event nudge — small pinned indicator: `next event in 15 mins.`
- **Focus timer** — Pomodoro-style, 25 min default

### Focus timer modes

Two start buttons:

- **Local** — in-app countdown only.
- **Shortcut** — triggers an iOS Shortcut that handles full focus ritual
  (DND on, Focus mode on, ambient setup).

### Lock-in concept

"Lock in" is an attention concept, not a lockdown. No UI restrictions. The
Shortcut-mode timer handles real system-level focus enforcement; the page
itself just makes the block's content the most prominent thing on screen.

### Granularity principle

**Task editing has one canonical home, and it is the Pillar Block view.**
Other surfaces are read-and-gesture. Deep edits happen where deep work
happens.

### Data writes

- Focus timer completion → `focus_sessions` (Tick's table)
- Task edits → Course-narrow's project/task schema
- Status changes → Course-narrow's task schema

---

## 9. Yesterday / Tomorrow surfaces

### Yesterday surface

Reflection-leaning. Slides in from the left.

- **Habit log** — checkable for retroactive backfill (writes to Tide).
- **Daily highlight** — large display card. Empty state shows a left-aligned
  big serif date stamp (`18M`) + day name (`monday`) + italic prompt
  (`What happened yesterday?`). Filled state shows the highlight as a
  pull-quote. Source of truth: Ink.
- **Stats grid** — 2x2 cards: completed (of N committed), pushed (forward
  to today), readiness (Oura), focus (h:m + pomodoro count).

### Tomorrow surface

Preview-leaning. Slides in from the right.

- **Week tile** — collapsible 7-cell row showing each day's blocks/focus.
  Today is outlined; tomorrow has a dashed outline. Tap to expand into
  per-day detail.
- **Mode toggle** — `Triage` / `Schedule` (pill-shaped segmented control).
- **Triage mode** — `queued for triage` list. Each entry uses the same
  `.pillar` chrome as the Today triage page (sticky header, pillar dot,
  count, collapsible body). Body shows a sample task from the queue.
  Closing copy: `triage opens tomorrow morning. these are tonight's
  drafts.`
- **Schedule mode** — `hard-line events` from ical + `proposed schedule`
  (draggable tomorrow). Read-only on this surface — drafts only.

---

## 10. Cross-cutting interactions

### Action toast

See §5 for the full spec. Used for **commits with undo affordance**: push,
drop, weekly review. Not used for navigation, not used for confirmations
that can't be undone.

### Tweaks panel

The toolbar toggle exposes a designer's tweaks panel with controls for
theme (dark/light), accent (4 swatches), font pairing, density, start
page, triage progress (untouched/mid/done), and whether the welcome
screen is shown. State persists across reload.

### Day-spine bar

Sticky bottom on every non-welcome page. `yesterday · today · tomorrow`.
Tapping yesterday/tomorrow opens the corresponding overlay. Horizontal
swipe on the phone surface does the same thing.

---

## 11. Schema sketch (Today's reads & writes)

### Tasks

```
tasks
  id
  pillar_id
  project_id        nullable (null = pillar-level "open task")
  title
  estimate_minutes  nullable; null means "infer from title"
  estimate_confirmed boolean
  depth             nullable enum: deep | admin
  status            enum: next | done | waiting | blocked | dropped
  pushed_to         nullable date
  completed_at      nullable timestamp
  dropped_at        nullable timestamp
  reassigned_from_pillar_id nullable
  position          int (ordering within parent)
  created_at
  updated_at
```

### Projects

```
projects
  id
  pillar_id
  name
  meta              short string (e.g. "this week", "in flight")
  status            enum: idea | active | waiting | blocked | done | dropped
  position
```

### Pillars

```
pillars
  id
  name
  color             enum: arrow | sunny | life | open
  position
```

### Scheduled blocks

```
placed_blocks
  id
  date              YYYY-MM-DD
  hour              decimal (e.g. 11.5 = 11:30)
  duration_minutes
  type              enum: meeting | routine | pillar | adhoc | prep
  title
  pillar_id         nullable
  project_id        nullable
  source            enum: ical | tide_routine | today_user
  source_id         nullable (for meetings: ical event id — currently omitted because the iOS Shortcut's Get Details action doesn't expose Calendar Item Identifier reliably across iOS versions)
```

### Daily journal

```
daily_logs
  id
  date              YYYY-MM-DD
  highlight         nullable text (Ink-owned; Today displays + writes)
  yesterday_backfilled_at nullable timestamp
```

### Cross-app sources of truth

Today reads from but does **not** own:

- `mantras` (Ink)
- `tide_habits` + `tide_oura` (Tide)
- `focus_sessions` (Tick's table — Today writes here on focus completion)
- ical events (Shortcut pull, read-only)
- iOS Reminders (Shortcut pull, routing TBD)

---

## 12. Tech notes

Match the suite pattern:

- Single-file PWA (`index.html`)
- Shared Supabase project (the one project hosting everything)
- Direct Claude API browser calls for in-app generated content (health
  insight, suggestion text, Morning Pulse if it lands here)
- Shortcuts deeplinks for ical pull, iOS Reminders pull, focus-timer
  shortcut mode, Waking Up launch
- Mobile-first, ~440px max-width column, centered on desktop
- Warm-dark palette; tight tone register (see CLAUDE.md)

### State management on Today

The prototype demonstrated two patterns worth preserving in the v1 build:

1. **Schedule state is lifted.** Scheduling (where blocks get placed) and
   Live (where they're viewed) read from the same source. Editing on §6
   reflects on §7 immediately. Implementation: schedule state owned by the
   shell, passed to both surfaces as `placed` + `setPlaced`.

2. **Time-bank rollup is published upward.** Triage owns task status; it
   exposes a rollup `{pillar_id: {mins, deep, admin}}` to Scheduling for
   the dock's live counts. Whenever a status / estimate / depth changes,
   the rollup recomputes and Scheduling re-renders.

### Tone register

Per Course's CLAUDE.md:

- Short declarative sentences
- Parentheticals for metadata, not narrative
- Imperative when proposing actions
- Never narrate or explain unless asked

Applies to: health insight, in-slot suggestions, Morning Pulse, stall
prompts, review prompts.

---

## 13. Build order

Prerequisites:

1. Course-narrow refactored (Course's old Today tab killed; Pillar/project
   schema stable)
2. Tick migrated to main Supabase project (mechanical; prerequisite for
   `focus_sessions` writes)
3. Ink promotion-readiness pass (confirms `mantras` entity and challenge
   schemas)

Then, in order:

1. **Page two — Triage** (the hard one — swipe gestures + status state +
   sticky headers + reorder). Everything else feeds off this surface.
2. **Page three — Scheduling** (drag-place, time-bank). Depends on Triage
   for live rollups.
3. **Page four — Live** (read-mostly initially; focus timer + suggest
   overlay come last).
4. **Page one — Morning** (mostly display; needs Oura sync + Ink backfill
   button).
5. **Welcome** + **Yesterday/Tomorrow overlays** (chrome — last).
6. **Pillar Block view** (full task editor + focus timer; retires Tick's
   shell).
7. **Full-screen calendar + Task Bank drill-ins** (v1.1 polish).

---

## 14. Open questions

Things still deferred.

1. **Course Bar placement** — Page one or page four. Floating across
   surfaces also viable.
2. **Morning Pulse placement** — Part of page one, or a precursor surface
   before triage.
3. **Time on welcome screen** — Phone status bar may cover this.
4. **iOS Reminders routing** — Working assumption: treated as Life items.
5. **Routine configuration** — In Today or in Course-narrow.
6. **In-slot suggestion style** — Priority-ranked, friction-reducing,
   novelty-biased. v1 surfaces other pillar tasks; mechanic gets
   workshopped after the surface is live.
7. **Multi-block focus queue behavior** — When a user picks 3 blocks in
   the suggest overlay, do they auto-advance? Show a queue counter?
   Decision deferred.

---

## 15. Decisions log

Strategic shifts and design commitments. Append-only.

- **Today is an active ritual, not a passive cockpit.** Triage is
  non-optional.
- **Collapse = commit.** Single gesture, dual job (clear the visual
  surface, signal triage complete).
- **Triage and scheduling are separate surfaces.** Punctuation matters.
- **Pillar-level drag on page three.** Tasks visible in Pillar Block view;
  scheduling stays clean.
- **Task editing has one home: Pillar Block view.** Other surfaces are
  read-and-gesture.
- **Open Tasks default expanded.** Pending work stays visible.
- **Morning grounding tiles stay neutral.** Tide checklist carries the
  daily-ritual completion rhythm.
- **First-up calendar preview lives on welcome screen only.**
- **No date display on page one.** Welcome establishes the date.
- **Three-day hard-stop spine.**
- **Two-way ical sync deferred to v2.**
- **Tick's standalone shell retires when Pillar Block view ships.**

**Added in v2 (from the prototype):**

- **Estimates start as guesses.** Every new task gets a heuristic estimate
  rendered as `~15m`. The `~` prefix vanishes only when the user
  explicitly confirms via the left-swipe time menu. This is honest about
  what the value is.
- **Each page is its own scroll container.** Within-page scroll position
  survives navigation. The pager and the page scroller don't fight.
- **Pillar headers are sticky during scroll.** Context never disappears
  while you're working through a long pillar.
- **Collapse uses `display:none`, not unmount.** Local state (statuses,
  estimates, added tasks) persists across commit → reopen.
- **Schedule state is lifted to the shell.** Scheduling and Live share
  one source of truth. Edits on one surface reflect on the other
  immediately.
- **Time bank in Scheduling is live remaining work.** Not a static budget —
  it shrinks as tasks complete on Triage.
- **Multi-select on the suggest-block overlay.** Picking more than one
  task queues them back-to-back inside a single focus session.
- **Action toast is ephemeral (2s) with an undo chip.** Not a persistent
  log. The toast does its job and gets out of the way.
- **Toast is portalled to the phone container**, not the page scroller,
  so it stays in the visible viewport regardless of scroll.
- **Scheduling starts with only the immovable items placed.** Pillar
  blocks, Gym, lunch are all user-placed. Hard-line meetings and
  auto-placed routines are the only seeds.
- **Live derives block meta from `hour + duration`, not a saved `detail`
  string.** Resizing a block on Scheduling reflects on Live without a
  round-trip through saved text.
- **Tomorrow's triage queue uses the same `.pillar` chrome as Today's
  triage.** Visual continuity over re-invented summary rows.
- **"Focus ↗", not "Lock in ↗".** Lock-in is internal language; the
  surface verb is "focus".
- **The opinionatedness is the feature.** No "skip triage" escape valve.
