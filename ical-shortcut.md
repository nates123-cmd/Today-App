# iOS Calendar → placed_blocks Shortcut

The Today app reads `placed_blocks` for the day spine. Real meetings live in
iOS Calendar (which mirrors your Outlook/Google/iCloud accounts), so an iOS
Shortcut bridges the two: it reads today's calendar events and writes them
as `placed_blocks` rows with `source='ical'`.

## Why this goes through an Edge Function (read this first)

`placed_blocks` is under per-user RLS (`auth.uid() = user_id`) as of the
2026-05-29 auth migration. The Shortcut authenticates with the **anon key**,
whose `auth.uid()` is null — so direct REST `INSERT`/`DELETE` calls to
`/rest/v1/placed_blocks` silently fail the RLS check and nothing lands. That
is what broke calendar sync (last good ical rows: 2026-05-29).

The fix is the **`ical-ingest` Edge Function**, which runs the writes with the
service role and stamps the owner's `user_id` so the rows are visible under
RLS. It is a **drop-in** for the old direct-to-PostgREST calls: it accepts the
exact DELETE and per-event POST shapes the existing Shortcut already sends.

## Adapting your existing Shortcut — change two URLs, nothing else

The current Shortcut has two **Get Contents of URL** actions. Repoint both from
the table endpoint to the function; leave the method, headers (anon key),
calendar-parsing actions, and JSON bodies exactly as they are.

| Action | Old URL | New URL |
|---|---|---|
| DELETE (clear the day) | `…supabase.co/rest/v1/placed_blocks?date=eq.[Date]&source=eq.ical` | `…supabase.co/functions/v1/ical-ingest?date=eq.[Date]&source=eq.ical` |
| POST (one per event) | `…supabase.co/rest/v1/placed_blocks` | `…supabase.co/functions/v1/ical-ingest` |

Full base: `https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/ical-ingest`

That's the whole change. The function:
- **DELETE** `?date=eq.YYYY-MM-DD&source=eq.ical` → clears that day's ical rows
  for the owner (tolerant even if the `&` is missing).
- **POST** a single flat event → inserts one row, owner-stamped.
- forces `type='meeting'`, `source='ical'`, `user_id=<owner>`, so those body
  fields are ignored (harmless to keep sending them).
- now coerces `hour`/`duration_minutes` from strings too, so the old "the
  Number type-chip must be set or rows won't render" landmine no longer bites.

It also accepts a batch shape `POST { date, events:[{hour,duration_minutes,
title,source_id?}] }` (replaces the whole day in one call) if you ever rebuild.

## Tomorrow too — one shortcut, server does the math (recommended)

The Tomorrow tab's Schedule view reads `placed_blocks` for tomorrow's date, so it
needs tomorrow's meetings ingested. Instead of a second shortcut, widen the one
you have to a rolling **today + tomorrow** window. The function now derives
`date`, decimal `hour`, and `duration` from a raw Start/End datetime, so the
Shortcut sends **no computed numbers** — that kills the worst Shortcuts pain
(decimal-hour math, per-event date juggling).

Three edits to your existing shortcut:

**1. Widen the calendar grab.** In *Find Calendar Events*, set the filter to
`Start Date` — `is in the next` — `2` — `Days`. (Optional: add `Status` `is not`
`Canceled`.) This captures the rest of today plus tomorrow.

**2. One range DELETE up front** (replaces the single-day DELETE). You need two
date strings:
- *Date* action → `Current Date`; *Format Date* → `yyyy-MM-dd` → call it **Today**.
- *Adjust Date* → `Current Date` + `2` `Days`; *Format Date* → `yyyy-MM-dd` → call
  it **Through**.
- *Get Contents of URL*, Method `DELETE`, URL:
  `https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/ical-ingest?from=[Today]&to=[Through]`
  (keep the apikey + Authorization headers). `from`/`to` is inclusive; using
  `+2 days` guarantees everything the 2-day grab can return gets cleared, so no
  stale rows pile up.

**3. Simplify the loop body.** Inside *Repeat with Each*:
- *Format Date* → `Repeat Item`'s **Start Date** → format `yyyy-MM-dd'T'HH:mm` →
  var **Start**.
- *Format Date* → `Repeat Item`'s **End Date** → same format → var **End**.
- *Get Contents of URL*, Method `POST`, URL the function base (no query), body
  type JSON:
  ```json
  { "start": "[Start]", "end": "[End]", "title": "[Repeat Item]" }
  ```

That's it — no `hour`, no `duration_minutes`, no per-event date. Each event
self-dates from its own Start, so today's events land on today and tomorrow's on
tomorrow automatically. Set the automation to run ~5:30 AM (and on opening the
PWA) as before.

> Prefer not to touch the working shortcut? Duplicate it and shift every date
> reference `+1 Day` (Adjust Date), pointing the DELETE/POST at tomorrow only.
> Two shortcuts to maintain, but zero risk to today's sync.

## Auth

Both `apikey` and `Authorization: Bearer …` headers carry the same anon key
(it is a signed JWT, which is what the function's `verify_jwt` gate checks —
the publishable `sb_…` key will NOT work). The existing Shortcut already sends
these; keep them.

**Optional hardening.** Set an `ICAL_INGEST_SECRET` env var on the function
(Dashboard → Edge Functions → ical-ingest → Secrets) and add a header
`x-ical-secret: <that value>` to both actions; otherwise the call returns 401.
Leave it unset and the JWT gate alone applies.

## Smoke-test the function from a shell

```bash
set -a && source .env && set +a
TODAY=$(date +%Y-%m-%d)
B="https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/ical-ingest"
A=(-H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json")

# clear, then insert one (mirrors the Shortcut's DELETE + per-event POST)
curl -X DELETE "$B?date=eq.$TODAY&source=eq.ical" "${A[@]}"
curl -X POST "$B" "${A[@]}" -d "{\"date\":\"$TODAY\",\"hour\":11.5,\"duration_minutes\":30,\"type\":\"meeting\",\"title\":\"smoke\",\"source\":\"ical\"}"
# clear again to clean up
curl -X DELETE "$B?date=eq.$TODAY&source=eq.ical" "${A[@]}"
```

## Per-event POST body (for reference — unchanged from before)

```json
{ "date": "2026-06-01", "hour": 14.5, "duration_minutes": 30, "type": "meeting", "title": "Standup", "source": "ical" }
```

| Field | Source / formula |
|---|---|
| `date` | event start date `YYYY-MM-DD` (local, not UTC) |
| `hour` | decimal hour of start. `9:00→9.0`, `14:30→14.5`, `15:15→15.25` |
| `duration_minutes` | `(end - start)` in minutes |
| `title` | event title |
| `type`, `source` | ignored by the function (forced to `meeting`/`ical`); fine to keep sending |
| `source_id` | optional stable event id |

## Run order (unchanged)

The DELETE runs once up front, then the **Repeat with Each** loop POSTs one
event at a time. Keep the DELETE above **Find Calendar Events** so it doesn't
wipe rows you just inserted.

## Automation (unchanged)

- **Time of Day → ~5:30 AM** — fresh snapshot before you open the app (set "Run
  Immediately"). iOS may need one unlock after midnight to fire reliably.
- **When I Open Today (the PWA)** — mid-day refresh after meetings move.
- If Outlook is on Fetch (vs Push), a 5:30 run may miss recently-added
  meetings; use Push or run later.

## Polish ideas (not blocking)

- **Skip canceled events.** Add `Status is not Canceled` to Find Calendar
  Events, or wrap the loop body in `If Title does not contain "Canceled:"`.
- **Strip prefixes** (`FW: `, `[External] `, `Canceled: `) with a Replace Text
  on Title before the POST.
