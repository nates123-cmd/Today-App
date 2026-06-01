# Today app — QA test harness plan

Stack: Vite + React 19 + supabase-js (PWA). Framework: **Vitest 3** (node env),
unit tests that import the REAL shipped modules from `src/` — zero
re-implementation. Additive only: no `src/**` or build-config edits. A separate
`vitest.config.js` is used so the app's `vite.config.js` / build are untouched.

Run: `npm test` (`vitest run`). 28 tests, all green, ~0.2s.

---

## NOT covered (and why) — read this first

The genuinely risky Today logic lives in **transform helpers that are defined
module-private inside React hooks / surface components and are NOT exported**.
They cannot be imported without either re-implementing them (forbidden) or
editing source to export them (forbidden — additive only). These are the
highest-value targets and are currently **untestable as shipped**:

1. **`buildPillars` / `pillarTagToId` / `shapeTask` / `projectMeta`**
   — `src/lib/usePillars.js` (not exported). This is the core surface
   aggregation: merging `course_projects` + `course_tasks` (scoped + orphan)
   into Today's five pillar buckets, with tolerant pillar-tag normalization
   ('Arrow'/'arrow', 'side'/'Side gig'→'sidegig'), HIDDEN_STATUSES filtering
   (done/dropped/archived/triage), and orphan-vs-project routing. **Highest
   risk, zero coverage.** The file's own comments flag prior silent-drop bugs
   here (projects vanishing on exact-string match).
   → Recommend exporting `buildPillars` + `pillarTagToId` (pure, no React) to
   make this testable. Documented, not patched.

2. **Oura transform** — `formatSleep` / `signed` / `syncTimeLabel` /
   `formatTempDelta` and the inline delta math (`dReadiness`, `dHrv`, `dRhr`,
   `dSleep`, the RHR dir-flip) in `src/lib/useOura.js` (not exported).
   Local-time `syncTimeLabel` (12h am/pm) and the "RHR down is good" dir flip
   are easy to get wrong. → Recommend extracting/exporting these pure helpers.

3. **placed_blocks row mapping** — `fromRow` / `toRow` / `blockEquals` in
   `src/lib/usePlacedBlocks.js` (not exported). `blockEquals` drives the
   insert/update/delete diff against Supabase; a wrong field comparison
   silently drops writes. → Recommend exporting.

4. **Welcome / Live time-window logic** — `pickFirstUp`, `formatRelative`
   (Welcome.jsx); `fmtTime`, active-block selection by `nowDecimal` (Live.jsx).
   "Next meeting after now vs first-of-day" and decimal-hour formatting are
   the local-TZ "today boundary" risks called out in the brief. Not exported.

5. **Triage helpers** — `placedToCalEvent`, `fmtHourLabel`, `formatProjectDue`,
   `guessEstimateFromTitle`, `rangesOverlap` (Scheduling.jsx). Decimal-hour →
   `HH:MM` rounding and overlap math. Not exported.

6. **`ical-ingest` edge function** — NOT in this repo (deployed Supabase edge
   fn; only the iOS Shortcut doc `ical-shortcut.md` lives here). Its payload
   shaping / OWNER_ID stamping cannot be unit-tested from this codebase.

7. **`useDailyHighlight` day-window** — `startOfDayISO` / `startOfNextDayISO`
   (UTC day boundary for querying `entries`) are module-private. The hook's
   query/save round-trip needs a Supabase mock + a hook renderer
   (jsdom + testing-library) — deferred as integration scope.

8. **React render / interaction / E2E** — no component render or Playwright
   smoke. The hooks are tightly coupled to live Supabase reads on mount; a
   meaningful smoke needs network mocking. Deferred.

---

## Covered (risk-ranked, highest first)

### R1 — Next-action surfacing (`src/lib/surfaceActions.js`) — 16 tests
The one piece of high-risk Today logic that ships **exported and pure**. Drives
which task(s) each project collapses to in Triage + Today PillarBlockView.
- `daysFromToday`: null/blank/non-ISO handling; today=0; future/overdue signs;
  **calendar-day delta ignores time-of-day** (the local-TZ "today boundary"
  risk); month/year boundary crossing.
- `surfaceActions`: empty; normal (status=next vs first-task fallback);
  urgent_single (next IS soonest, incl. overdue); urgent_double (urgent ≠ next,
  shows both); **3-day urgency boundary (3 urgent, 4 not)**; soonest-wins among
  multiple urgent; `count` arithmetic (len-1 / len-2).

### R2 — Notion writeback payload shaping (`src/lib/notionWriteback.js`) — 12 tests
Exported; the only Today→external-system write whose payload is pure-shapeable
(the brief's "payload shaping" risk, ical-ingest being unavailable). Supabase
client mocked via `vi.mock`.
- `extractNotionPageId` (via the public fns): valid 32-hex extraction; no-id
  URL and null URL → no invoke.
- `writebackTaskStatus`: UI→Notion status map; **done also ticks Complete**;
  unknown status → no-op.
- `writebackTaskDoDate`: ISO date payload vs `date: null` clear.
- `writebackTaskPillar`: pillar→Area relation id; null clears relation;
  **unconfigured pillar (sidegig) silently skips the Notion mirror.**

---

## Real app bugs found
None. All 28 assertions describe and confirm intended behavior of the shipped
code. The main finding is structural (see "NOT covered"): the highest-risk
transforms are not exported and therefore not unit-testable without a source
change, which this harness deliberately did not make.
