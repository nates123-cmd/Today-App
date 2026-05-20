# Today — App Spec

The cockpit app for Nate's personal PWA suite. Sits at the top of the suite's
three-layer architecture (per `personal-os-spec.md`) and serves as the daily
home base. Reads from Course, Tide, Ink, and Tick's data backbone via shared
Supabase. Reads gcal and iOS Reminders via Shortcut pipeline.

Pair this spec with `personal-os-spec.md` (suite-level context) and
`course-spec.md` (Course-narrow, which owns the Pillars/projects schema Today
reads from).

---

## 1. Product hypothesis

**Today is an active morning processing ritual, not a passive cockpit.**

The default failure mode of every productivity tool is the endless to-do list:
items pile up faster than they get processed, and the tool degenerates into a
backlog museum. Today resists this by forcing a triage step before any
execution — every Pillar's open items get processed each morning, decisions
get made (in, out, push, drop), and the day's commitments are explicit before
work begins.

The opinionatedness is the feature. Bad days where the ritual feels heavy are
expected. The cost of the ritual is paid in attention up front so the rest of
the day can run on commitments rather than reactivity.

---

## 2. Surface architecture

Today has a vertical-scroll spine of distinct surfaces. Horizontal swipe at
any level navigates between the three-day spine (Yesterday / Today /
Tomorrow). Drill-in surfaces (Pillar Block view, full-screen calendar, Task
Bank) open from page four.

### Vertical spine

1. **Welcome screen** — first open of the day only
2. **Page one — Morning surface** — passive grounding
3. **Page two — Triage surface** — active processing of Pillars
4. **Page three — Scheduling surface** — placing committed work on the clock
5. **Page four — Live surface** — workday home base, the place you live from
   ~9am to ~6pm

### Horizontal spine

- **Today** ↔ **Yesterday** (left/right swipe) — reflection surface, design TBD
- **Today** ↔ **Tomorrow** (right/left swipe) — preview surface, design TBD,
  contains week view as further affordance
- Hard stops at Yesterday and Tomorrow. No swipe past.

### Drill-ins from page four

- **Pillar Block view** (Image 6) — tap a placed block on the calendar
- **Full-screen calendar** — tap the calendar itself
- **Task Bank** — tap the Open Tasks affordance

### Navigation rules

- **Vertical = deeper into the day.** Welcome → grounding → triage →
  scheduling → execution.
- **Horizontal = different day.** Hard-stop three-day spine.
- **Tap = drill into detail.** Always returns to caller.
- **First open of the day** → welcome screen.
- **Subsequent opens during the day** → resume where you last were, defaulting
  to page four once morning ritual is complete.

---

## 3. Welcome screen

The threshold before the app proper. Calm, ritual, intentional.

### Content

- **Date** — large, centered. Primary visual anchor.
- **Mantra** — pulled from the `mantras` entity type in shared Supabase. Ink
  is the system of record; Today reads.
- **First-up** — next calendar event. Format: title + absolute time +
  relative countdown ("10:00 AM · in 1.5 hours").
- **Regen button** — subtle, near first-up. Triggers the calendar Shortcut
  manually. The morning automation handles the common case; this is the
  fallback for stale data mid-day.

### Behavior

- Shown only on the first open of the day.
- Swipe up to enter page one.
- Time display: TBD. May not be needed (phone status bar covers it). Decision
  deferred.

### Visual register

Quiet. Lots of whitespace. The job of this screen is to mark the threshold
between not-using-the-app and using-it. Nothing should feel like execution
yet.

---

## 4. Page one — Morning surface

Passive grounding. Stats, insight, daily habits, grounding rituals. No
triage, no scheduling. The job is to come online for the day.

### Content blocks (top to bottom)

#### Oura block

Pulls Oura ring stats from Tide's existing data (Tide owns the Oura
integration; Today reads). Left/right split: primary metric on one side,
secondary numbers on the other. Specific metrics TBD during design pass.

#### Health insight

One-line generated insight. Pillar-and-context-aware. Tone register per
CLAUDE.md: short, declarative, no narration. Has a regen affordance.

#### Tide checklist

Daily habits and challenges, with inline backfill for yesterday's gaps.

- **Habits** — drink water, take supplements, whatever else lives in Tide's
  daily-habit schema.
- **Challenges** — personal stretch habits defined in Ink (cold shower
  example). Ink owns the entity; Today displays.
- **Yesterday backfill** — if yesterday's Tide stats are incomplete, a small
  inline section appears with the missing fields. Filling them writes
  directly to Tide. Visual treatment distinguishes "today's items"
  (forward-looking) from "yesterday's gaps" (backfill).

#### Morning grounding

2x2 launcher. Meditations on top row, reflections on bottom row.

- Top: Waking Up (shortcut to external app), stoic meditation (Ink deeplink)
- Bottom: stoic morning (Ink deeplink), memento mori (Ink deeplink)

Tiles are launchers, not content. Tapping opens the destination app, which
returns to Today on dismissal. **No completion state** — tiles look the same
all day, regardless of use. Tide checklist above handles the completion
rhythm for daily rituals; the grounding launcher stays neutral.

### What's not on page one

Calendar preview lives on the welcome screen only. The Course Bar's home is
TBD (see §10). Morning Pulse from Course's old surface relocates here but
exact placement is TBD (see §10).

---

## 5. Page two — Triage surface

The core ritual. Active processing of every Pillar's open items. The goal
is to enter page three knowing exactly what's committed for the day and
exactly what's been deferred.

### Content (top to bottom)

#### Calendar summary

The day's hard-line events as a compact list. Each event color-coded by
Pillar. Three meetings on a typical day; more or fewer on others. Read-only
on this surface — events come from gcal via Shortcut and aren't
movable here.

#### Pillar boxes

Ordered: **Arrow always first**, then Sunny, Life, Open Tasks (Pillar-less).

Each box is independently expandable. When expanded, shows the Pillar's
active projects, with each project's tasks nested underneath.

### Triage interactions

#### Per-task and per-project gestures

- **Right swipe** → push to tomorrow
- **Left swipe** → change due date. Options: drop, send to weekly review (a
  Course-narrow surface)
- **Tap** → no edit affordance here. Page two is for triage decisions, not
  task editing. Edits happen in Pillar Block view (Image 6).

#### Status changes

Deferred to Pillar Block view. Triage answers "is this today's work or
not"; it doesn't change the task's status.

#### Collapse = commit

The only signal that a Pillar has been triaged is that its box is
collapsed. Collapse is reversible — tap to reopen if needed. There is no
"triaged but not collapsed" state.

#### Reminders

iOS Reminders pulled in via Shortcut, appearing as a scrollable section
below the Pillars. Triaged the same way as Pillar tasks (swipe gestures
apply). Where they land if kept in the day is TBD — probably treated as
ambient Life items, but specific routing deferred.

#### Push to next screen

When all Pillars are collapsed, a "push to next screen" affordance appears.
Deliberate handoff to page three. Not auto-transition — the click is the
punctuation between triage and scheduling.

### Triage philosophy

The discipline is the point. If 15 Arrow tasks open and 12 don't survive
triage, that's a successful morning. The tool's job is to make the
push-to-tomorrow and drop gestures cheap so the decision feels light.
Resist the urge to add a "do later in the week" middle ground — it
recreates the backlog problem in a new form.

---

## 6. Page three — Scheduling surface

The bridge between commitment and execution. Hard-line events are already
placed; Pillar work blocks (output of page two's triage) get dragged into
time slots.

### Content

#### Hour-column calendar

Vertical hour column (default 8am–6pm, expandable). Hard-line events from
the Shortcut pull are already placed. Read-only for hard-line events on
this surface (move them in gcal directly if needed).

#### Pillar blocks (below the calendar)

Each Pillar from triage appears as a horizontal block. Block size scales
with how much was committed to that Pillar during triage — Arrow with six
committed tasks is a larger block than Sunny with one. Empty Pillars
(everything triaged out) don't appear.

#### Routines

Pre-configured time blocks that auto-place on the calendar at their usual
times. Examples: Gym, lunch. Not Pillar-derived. Configuration surface for
routines is TBD.

### Scheduling interactions

- **Drag a Pillar block onto a calendar slot** to time-box it. Block lands
  with default 30-minute duration, expandable on tap.
- **Ad-hoc block drawing** — tap-and-drag directly on the calendar to
  create a non-Pillar generic time block. For life stuff that doesn't fit
  the Pillar system (doctor's appointment, errand). v1 inclusion TBD.
- **Tap a placed block** to expand its duration or see what's inside (the
  full task breakdown lives in Pillar Block view).

### Block types

1. **Hard-line events** — meetings from gcal Shortcut pull, non-negotiable
2. **Routines** — recurring self-imposed time blocks (Gym), auto-placed
3. **Pillar work blocks** — derived from triage, manually dragged
4. **Ad-hoc blocks** — generic time blocks, drawn directly (v1 TBD)

### What's not on page three

Two-way gcal sync (placed blocks pushing back to gcal) is **deferred to
v2**. v1 reality: gcal is read-only, Pillar blocks live in Today only. If a
block needs to be visible to others, it goes in gcal directly.

---

## 7. Page four — Live surface

Workday home base. The place you live from morning-scheduling-complete
until evening reflection. Lowest-friction surface in the app.

### Content

#### Calendar (live)

Full-day vertical calendar with all placed blocks visible. Scrollable.
Pillar work blocks show Pillar name + short task description.

#### In-slot suggestions

Empty time slots show suggestions for other Pillar tasks and projects.
Pillar-aware: if you just finished an Arrow block and have 30 minutes free,
suggestions surface Arrow tasks first. Tone register per CLAUDE.md.

The deeper question of what *kind* of suggestion works best —
priority-ranked, friction-reducing, novelty-biased, something else — is
deferred. v1 surfaces other Pillar tasks and projects; the suggestion
mechanic gets workshopped after the surface exists and can be used.

Interaction TBD: tap to accept (places the block), tap to dismiss, swipe
through alternatives. Decision deferred.

#### Open Tasks affordance

A second surface on the same task-suggestion data, rendered as a list
rather than inline. Default-expanded — pending work should be visible
without requiring action. Compact row treatment, capped at top 3–5
Pillar-prioritized items with "see N more" to expand to the full Task
Bank view.

**Collapse is structurally protected** — either unavailable or requires
deliberate action. The cockpit principle is that pending work stays
visible.

### Drill-ins from page four

- **Tap a placed Pillar block** → Pillar Block view (§8)
- **Tap the calendar itself** → full-screen scrollable calendar (surface
  TBD)
- **Tap the Open Tasks "see more" or full-view affordance** → Task Bank
  view (surface TBD)

### What's not on page four

- Focus timer — moved to Pillar Block view. The timer is a lock-in
  affordance, not an ambient one.
- Task editing — happens in Pillar Block view. Page four is read-and-tap.

---

## 8. Pillar Block view (drill-in from page four)

The lock-in surface. Where focused work actually happens. Reached by tapping
a placed Pillar block on the live calendar.

### Content

- **Pillar header** — the Pillar you're locked into
- **Project list** — projects committed to this block, with their tasks
  nested
- **Task detail** — every task is fully editable here. Edit, change, add,
  status change, notes. Long-press (hold) on a task → status change menu
  (waiting, etc).
- **Next-event nudge** — small pinned indicator: "next event in 15 mins."
  Peripheral awareness so you don't miss a meeting mid-focus.
- **Focus timer** — Pomodoro-style, 25 min default

### Focus timer modes

Two start buttons:

- **Local** — in-app countdown only. No system integration. Lightweight
  start for "I want to time a chunk of work."
- **Shortcut** — triggers an iOS Shortcut that handles the full focus
  ritual: DND on, Focus mode on, any other ambient setup (Murmur ready,
  specific music app starts, etc). The "I'm actually going deep now" mode.

### Lock-in concept

"Lock in" is an attention concept, not a lockdown. The page exists to hold
focus on this block. No UI restrictions, no swipe-disables. The
shortcut-mode timer handles real system-level focus enforcement; the page
itself just makes the block's content the most prominent thing on screen.

### Granularity principle

**Task editing has one canonical home, and it is the Pillar Block view.**
Other surfaces are read-and-gesture (triage swipes, calendar drags). Deep
edits happen where deep work happens. This keeps page two and page four
lightweight and gives any task one clear "drill in to actually change
things" affordance.

### Data writes

- Focus timer completion writes to `focus_sessions` (Tick's existing table,
  per personal-os-spec.md §4)
- Task edits write to Course-narrow's project/task schema
- Status changes write to Course-narrow's task schema

---

## 9. Surfaces not yet designed

These are known parts of the app that don't have sketches yet. Listed so
they don't disappear from the design backlog.

### Yesterday surface

Horizontal-swipe sibling to Today. Reflection-leaning. Possible content:
what got done vs what was triaged in but not completed, evening review
prompts, ability to retroactively close out tasks, Tide stats summary,
mood/reflection entry routed to Ink.

### Tomorrow surface

Horizontal-swipe sibling to Today. Preview-leaning. Possible content:
upcoming hard-line events, a "Proposed Day" view (the V2 concept from
Course's old surface migrating here), Pillar workload preview, week view as
an additional affordance.

### Full-screen calendar (drill-in from page four)

Tap the page four calendar to enter. Probably a deeper scrollable view with
more time visible at once, multi-day preview, ability to manipulate blocks
without the rest of page four's chrome.

### Task Bank (drill-in from page four)

Tap the page four Open Tasks affordance for full view. All Pillars, full
task list, filterable, scannable. Same data as the inline suggestions and
the Open Tasks summary, just full-surfaced.

---

## 10. Open questions

Deferred decisions, flagged for the build process.

1. **Course Bar placement.** Per personal-os-spec.md §3, the Course Bar
   lives in Today, not Course-narrow. Page one (morning surface) and page
   four (live) are the candidates. Could also be floating across surfaces.
   Decision deferred.
2. **Morning Pulse placement.** Morning Pulse moves from Course to Today
   (per personal-os-spec.md §3). Likely candidates: part of page one, or a
   precursor surface that runs before page two's triage to provide
   Claude-generated context on which Pillars need attention. Decision
   deferred.
3. **Time on welcome screen.** Whether to display time alongside the date.
   May be unnecessary given phone status bar. Decision deferred.
4. **Footer Yesterday/Today/Tomorrow shortcuts.** Sketches show a
   tap-shortcut footer on some surfaces. Now redundant with horizontal
   swipe. Keep, drop, or keep as alternative. Decision deferred.
5. **Resume behavior.** Working assumption: subsequent opens during the day
   land where you last were, defaulting to page four after morning
   ritual is complete. Specific resume rules TBD.
6. **Ad-hoc block drawing on page three.** v1 inclusion vs v2 deferral.
   Working lean: v1, as the escape valve for non-Pillar fixed things.
7. **In-slot suggestion interactions on page four.** Tap-to-accept,
   tap-to-dismiss, swipe-through-alternatives. Decision deferred.
8. **In-slot suggestion *style*.** Priority-ranked, friction-reducing,
   novelty-biased, or some other framing. v1 surfaces other Pillar tasks
   and projects; the deeper mechanic gets workshopped after the surface
   exists and can be used.
9. **Two-way gcal sync.** Confirmed deferred to v2. v1 is read-only.
10. **iOS Reminders routing.** How triaged-in Reminders appear on page three
    and page four. Working assumption: treated as Life items. Specific
    routing deferred.
11. **Routine configuration.** Where Gym (and other routines) get
    configured — in Today, or in Course-narrow. Decision deferred.

---

## 11. Cross-app dependencies

Today is the most-connected app in the suite. Every dependency runs through
the shared Supabase, not via cross-app API calls.

### Today reads

- **Ink** — mantras, challenges (for Tide checklist), grounding deeplink
  targets
- **Tide** — Oura data, daily habit schema, yesterday's stats for backfill
- **Course-narrow** — Pillars, projects, tasks (the entire triage and
  scheduling spine reads from Course's schema)
- **Tick's data backbone** — `focus_sessions` table (the focus timer in
  Pillar Block view writes here)
- **gcal** — via Shortcut pipeline (per personal-os-spec.md §5), one-way
  v1
- **iOS Reminders** — via Shortcut

### Today writes

- **Tide** — Tide checklist completions, yesterday backfill values
- **Course-narrow** — task triage decisions (push, drop, weekly review),
  task edits from Pillar Block view, status changes, notes
- **Tick** — focus session records on timer completion

### Today does not write to

- Ink (Ink is read-only from Today's perspective — content lives in Ink and
  is surfaced in Today, but Today doesn't author Ink content)
- gcal (v1; v2 may change)

---

## 12. Tech notes

Match the suite pattern (per personal-os-spec.md and Course's CLAUDE.md):

- Single-file PWA (`index.html`)
- Shared Supabase project (the one project hosting everything, per
  personal-os-spec.md §4)
- Direct Claude API browser calls for in-app generated content (health
  insight, in-slot suggestions, Morning Pulse if it lands here)
- Shortcuts deeplinks for gcal pull, iOS Reminders pull, focus timer
  shortcut mode, Waking Up launch
- Web Push notifications for any scheduled rituals (TBD which)
- Mobile-first, ~440px max-width column, centered on desktop
- Match suite design grammar (warm-dark palette, tight tone register)

### Tone register for Claude-generated content

Per Course's CLAUDE.md:

- Short declarative sentences
- Parentheticals for metadata, not narrative explanation
- Imperative when proposing actions
- Never narrate or explain unless asked

Applies to: health insight, in-slot suggestions, Morning Pulse content,
any stall questions or review prompts.

### Suggestion-generation specifically

In-slot suggestions on page four are deferred for workshopping. v1
implementation surfaces other Pillar tasks and projects, Pillar-scoped to
the current focus block. The deeper question of suggestion style
(priority-ranked, friction-reducing, novelty-biased, etc) gets resolved
after the surface exists and can be used.

---

## 13. Build order

Per personal-os-spec.md §6, Today is built last in the suite. Prerequisites:

1. Course-narrow refactored (Course's old Today tab killed; Pillar/project
   schema stable)
2. Stock shipped (suite's strongest product candidate, removes attention
   from suite-level work)
3. Tick migrated to main Supabase project (mechanical; prerequisite for
   `focus_sessions` writes from Pillar Block view)
4. Ink promotion-readiness pass (confirms `mantras` entity and challenge
   entity schemas support Today's reads)

Then Today, in this rough order:

1. **Welcome screen + page one** — lowest-stakes surfaces. Read-mostly.
   Validates the shared-Supabase reads from Ink and Tide.
2. **Page two (triage)** — core ritual. Builds against Course-narrow's
   stable schema. Validates the swipe gestures and collapse-as-commit
   pattern.
3. **Page three (scheduling)** — drag interactions. Most complex front-end
   work in v1.
4. **Page four (live)** — the home-base surface. Brings together calendar
   reads, suggestion generation, and Open Tasks affordance.
5. **Pillar Block view** — full task-editing affordances. Replaces Tick's
   standalone focus timer surface; Tick shell retires after this ships.
6. **Yesterday / Tomorrow surfaces** — design and build in parallel once
   Today's central spine is stable.
7. **Full-screen calendar and Task Bank drill-ins** — v1.1 polish.

---

## 14. Decisions log

Strategic shifts and design commitments captured so future-Nate remembers
the reasoning when a different path looks easier.

- **Today is an active ritual, not a passive cockpit.** Triage is
  non-optional. Resisting the endless-backlog failure mode is worth the
  morning friction.
- **Collapse = commit.** Single gesture, dual job (clear the visual
  surface, signal triage complete). Cleaner than a separate "mark as
  triaged" affordance.
- **Triage and scheduling are separate surfaces.** Despite the temptation
  to collapse them into one continuous morph, the punctuation of a
  deliberate handoff respects that they're different mental acts.
- **Pillar-level drag on page three.** Tasks are visible in Pillar Block
  view; the scheduling surface stays clean by working at Pillar
  granularity.
- **Task editing has one home: Pillar Block view.** Other surfaces are
  read-and-gesture. Keeps page two and page four lightweight and gives
  any task one clear "drill in to actually change things" affordance.
- **Open Tasks default expanded.** Pending work stays visible. Collapse is
  structurally protected against.
- **Morning grounding tiles stay neutral all day.** No completion state.
  Tide checklist above carries the daily-ritual completion rhythm.
- **First-up calendar preview lives on welcome screen only.** Removed from
  page one to avoid redundancy.
- **No date display on page one.** Welcome screen establishes the date.
  Re-stating it on page one is visual noise.
- **Three-day hard-stop spine.** Yesterday, Today, Tomorrow. Anything
  further out is week view on Tomorrow's surface, not endless horizontal
  scroll.
- **Two-way gcal sync deferred to v2.** v1 is one-way Shortcut pull.
  Pushing back to gcal adds OAuth, conflict resolution, and decisions
  about which blocks sync — all of which can wait.
- **Tick's standalone shell retires when Pillar Block view ships.** Focus
  timer absorbed into Today; `focus_sessions` table stays as the data
  backbone.
- **The opinionatedness is the feature.** No "skip triage" escape valve.
  Bad days where the ritual feels heavy are expected and accepted.
