# gcal → placed_blocks Shortcut

The Today app reads `placed_blocks` for the day spine. Real meetings live in
Google Calendar, so an iOS Shortcut bridges the two: it reads today's
calendar events and writes them as `placed_blocks` rows with
`source='gcal'`.

This doc is the data contract. Build the Shortcut once; it stays correct as
long as the table schema doesn't change.

## Strategy

**Replace, don't merge.** Each run:

1. DELETE every row where `date = today AND source = 'gcal'`
2. INSERT one row per non-all-day calendar event

This is idempotent — running the Shortcut twice gives the same result.
Cancelling a meeting in gcal and re-running the Shortcut removes it from
Today. Manually-placed blocks (`source = 'today_user'`) are untouched.

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
table yet — open item #7).

## Step 1: delete today's gcal rows

```
DELETE https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks?date=eq.YYYY-MM-DD&source=eq.gcal
```

Returns `[]` on success or the deleted rows if you add the
`Prefer: return=representation` header.

## Step 2: insert one row per event

```
POST https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks
Content-Type: application/json
```

Body (one event at a time, or an array of events for batch insert):

```json
{
  "date": "2026-05-20",
  "hour": 14.5,
  "duration_minutes": 30,
  "type": "meeting",
  "title": "Standup",
  "source": "gcal",
  "source_id": "<calendar event id>"
}
```

Field rules:

| Field | Source / formula |
|---|---|
| `date` | event start date in `YYYY-MM-DD` (local time, not UTC) |
| `hour` | decimal hour of event start. `9:00 → 9.0`, `14:30 → 14.5`, `15:15 → 15.25` |
| `duration_minutes` | `(end - start)` in minutes; ints only |
| `type` | always `"meeting"` for gcal events |
| `title` | event title |
| `source` | always `"gcal"` |
| `source_id` | the calendar event's unique id (so re-runs can match) |
| `pillar` | omit (null) |
| `project_id` | omit (null) |

## Skip these events

- All-day events (no usable hour/duration)
- Events you declined (`status: declined`)
- Events on calendars you don't want surfaced (filter by calendar name)

## Building the iOS Shortcut

Apple Shortcuts can't be checked in as text. Build it manually with these
actions in this order:

1. **Get Current Date** → `Now`
2. **Format Date** (`Now`, format: `yyyy-MM-dd`) → `Today`
3. **Get Contents of URL**
   - Method: `DELETE`
   - URL: `https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks?date=eq.[Today]&source=eq.gcal`
   - Headers: `apikey`, `Authorization: Bearer …`
4. **Find Calendar Events Where**
   - Start Date is today
   - Is all-day is false
   - Calendar is `<your work calendar>` (optional filter)
5. **Repeat with Each** (over Found Events):
   - **Calculate** start hour as decimal: `Hour(Start Date) + Minute(Start Date) / 60`
   - **Calculate** duration in minutes: `(End Date - Start Date) / 60` (Shortcuts'
     time-diff returns seconds; divide by 60)
   - **Dictionary** with fields above
   - **Get Contents of URL**
     - Method: `POST`
     - URL: `https://xsmnfcmtbpeaccnyinkr.supabase.co/rest/v1/placed_blocks`
     - Headers: same auth + `Content-Type: application/json`
     - Request body: JSON, the Dictionary

Run it once manually, then add it to your Home Screen so the morning
ritual is one tap.

## Smoke-test the contract before building the Shortcut

A single round-trip with curl confirms the endpoint works from your
network with your key. Run from a shell with `.env` loaded:

```bash
source .env
TODAY=$(date +%Y-%m-%d)

curl -X POST "$VITE_SUPABASE_URL/rest/v1/placed_blocks" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"date\":\"$TODAY\",\"hour\":11.5,\"duration_minutes\":30,
        \"type\":\"meeting\",\"title\":\"smoke\",\"source\":\"gcal\",
        \"source_id\":\"smoke-test\"}"

curl -X DELETE "$VITE_SUPABASE_URL/rest/v1/placed_blocks?date=eq.$TODAY&source=eq.gcal" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```
