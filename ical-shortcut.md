# iOS Calendar → placed_blocks Shortcut

The Today app reads `placed_blocks` for the day spine. Real meetings live in
iOS Calendar (which mirrors your Outlook/Google/iCloud accounts), so an iOS
Shortcut bridges the two: it reads today's calendar events and writes them
as `placed_blocks` rows with `source='ical'`.

This doc is the data contract. Build the Shortcut once; it stays correct as
long as the table schema doesn't change.

## Strategy

**Replace, don't merge.** Each run:

1. DELETE every row where `date = today AND source = 'ical'`
2. INSERT one row per non-all-day calendar event

This is idempotent — running the Shortcut twice gives the same result.
Cancelling a meeting and re-running the Shortcut removes it from Today.
Manually-placed blocks (`source = 'today_user'`) are untouched.

## Endpoint + auth

Project ref: `xsmnfcmtbpeaccnyinkr`

```
Base URL: https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json
```

Both `apikey` and `Authorization` headers are required; both carry the same
anon key. Anonymous reads/writes are currently allowed (no RLS on this
table yet).

## Step 1: delete today's ical rows

```
DELETE https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks?date=eq.YYYY-MM-DD&source=eq.ical
```

## Step 2: insert one row per event

```
POST https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks
Content-Type: application/json
```

Body (one event at a time):

```json
{
  "date": "2026-05-20",
  "hour": 14.5,
  "duration_minutes": 30,
  "type": "meeting",
  "title": "Standup",
  "source": "ical"
}
```

Field rules:

| Field | Source / formula |
|---|---|
| `date` | event start date in `YYYY-MM-DD` (local time, not UTC) |
| `hour` | decimal hour of event start. `9:00 → 9.0`, `14:30 → 14.5`, `15:15 → 15.25` |
| `duration_minutes` | `(end - start)` in minutes; ints only |
| `type` | always `"meeting"` |
| `title` | event title |
| `source` | always `"ical"` (system tag; do NOT use the calendar's friendly name) |
| `source_id` | optional; omit unless you have a stable event ID |
| `pillar`, `project_id` | omit |

## Building the iOS Shortcut

Apple Shortcuts can't be checked in as text. Build it manually with the
actions below. Action order matters — magic variables can only reference
upstream actions.

### Setup (before the loop)

1. **Date** action (just "Date" in the picker) — represents the current moment.
2. **Format Date**
   - Date: the Date variable from step 1
   - Format: Custom → `yyyy-MM-dd`
3. **Get Contents of URL** — the DELETE call
   - Method: `DELETE`
   - URL: `https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks?date=eq.[FormattedDate]&source=eq.ical`
     (insert the magic variable from step 2 where `[FormattedDate]` is shown)
   - Headers: `apikey` + `Authorization: Bearer …`
   - Request Body: None

### The query

4. **Find Calendar Events Where**
   - Filters: `Start Date is today`, `Is Not All Day`, `Calendar is <your work calendar>`
   - Sort by: Start Date, Ascending
   - No limit

### The loop

5. **Repeat with Each** over the Found Events. Everything below goes *inside* the loop.

   a. **Get Details of Calendar Events** × 3 — Repeat Item, properties: Start Date, End Date, Title
   b. **Format Date** (Start Date, format `H`) → hour-of-day, 0–23
   c. **Format Date** (Start Date, format `m`) → minute-of-hour, 0–59
   d. **Calculate** — first operand: the `m` Format Date output; operator: `÷`; second operand: literal `60`
   e. **Calculate** — first operand: the `H` Format Date output; operator: `+`; second operand: the Calculate from (d). Output is the decimal hour.
   f. **Time Between Dates** — first date: Start Date; second date: End Date; unit: `Minutes`
   g. **Format Date** (Start Date, format `yyyy-MM-dd`) → event date string
   h. **Get Contents of URL** — the POST
      - URL: `https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks`
      - Method: `POST`
      - Headers: `apikey`, `Authorization: Bearer …`, `Content-Type: application/json`
      - Request Body: `JSON` with six fields:
        - `date` (Text) → Format Date from (g)
        - `hour` (Number) → Calculate from (e)
        - `duration_minutes` (Number) → Time Between Dates from (f)
        - `type` (Text) → literal `meeting`
        - `title` (Text) → Title from (a)
        - `source` (Text) → literal `ical`

   **Critical:** the type chip on `hour` and `duration_minutes` must be **Number**, not Text. They default to Text. Supabase silently stores strings if you forget, and the day spine won't render them.

### Run order

The setup actions (1–3) must execute *before* the loop, otherwise the DELETE wipes the rows you just inserted. If they end up below the loop after editing, long-press the action handle and drag them above **Find Calendar Events**.

## Landmines we hit building this

These are the gotchas worth remembering — they cost real time.

- **Auto-capitalization on `m`.** iOS's keyboard auto-capitalizes the first character of text fields. Typing `m` into a Format Date format string gets silently corrected to `M`, which is **month**, not minute. For May, that returns `5` instead of `0` and the entire decimal-hour math goes sideways. Fix: type any other letter first, delete it, then type `m`, OR turn off Caps Lock.
- **Wrong magic variable in Calculate.** The variable picker shows three "Formatted Date" and two "Calculation Result" entries by the time you wire up Calc 1. Long-press each candidate to see its source action before picking. Calc 1's first operand should be the `m` Format Date — not Time Between Dates.
- **`Authorization` header needs the literal `Bearer ` prefix** (capital B, single space). Missing space or missing prefix → "Invalid API key" error from Supabase even though the key itself is correct.
- **Dictionary action is redundant.** Build the 6 JSON body fields directly inside the POST's Request Body → JSON editor. iOS Shortcuts can't feed a standalone Dictionary action into a JSON body root in any clean way.
- **`Calendar Item Identifier` may not be exposed** in Get Details on some iOS versions. Skip it — `source_id` is nullable, and the DELETE-then-INSERT strategy doesn't need a stable ID.
- **Hour column is `numeric(4,2)`** — caps at 99.99. Any formula bug producing ≥100 throws `numeric field overflow` (code 22003). That error usually means Calc 1 or Calc 2 has the wrong operands.

## Smoke-test the contract before building the Shortcut

A single round-trip with curl confirms the endpoint works from your network
with your key. Run from a shell with `.env` loaded:

```bash
source .env
TODAY=$(date +%Y-%m-%d)

curl -X POST "$VITE_SUPABASE_URL/rest/v1/placed_blocks" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"date\":\"$TODAY\",\"hour\":11.5,\"duration_minutes\":30,\"type\":\"meeting\",\"title\":\"smoke\",\"source\":\"ical\"}"

curl -X DELETE "$VITE_SUPABASE_URL/rest/v1/placed_blocks?date=eq.$TODAY&source=eq.ical" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

## Automation

Two Personal Automations cover the typical day:

- **Time of Day → 5:30 AM (or whenever you start)** — pulls a fresh snapshot before you open the app. Set "Run Immediately" so iOS doesn't show a Run/Don't Run prompt.
- **When I Open Today (the PWA)** — refreshes mid-day after meetings get added or moved. Optional but cheap.

The early-morning run handles the "no surprises" feeling at the start of the day. The on-open run handles meetings added after you've already started.

### Caveats for time-of-day automation

- iOS needs to be **unlocked once** after midnight for the automation to fire reliably on some iOS versions. If the phone hasn't been touched since 2am, the 5:30 trigger may queue until next unlock.
- iOS Calendar sync delay: if you set Outlook to Fetch (vs Push), recently-added meetings might not be in iOS Calendar yet at 5:30. Either set Push, or schedule the morning run a bit later (6:30+).
- The Shortcut takes ~5 seconds to complete; it runs in the background and you won't see a UI unless an action errors. If it silently fails, the previous day's `placed_blocks` for that date stick around (the DELETE didn't run).

## Polish ideas (not blocking)

- **Skip canceled events.** Either add a `Status is not Canceled` filter to Find Calendar Events (if your iOS exposes it) or wrap the loop body in an `If Title does not contain "Canceled:"`.
- **Strip prefixes from titles.** A `Replace Text` action on Title (`FW: `, `[External] `, `Canceled: `) before passing it to the POST body.
