# Apple Reminders → Today

Today shows your Reminders as an **errands strip** in the day plan — beside the
Course+ work, never mixed into it. Course+ is the source of truth for project
work and runs a pull method; folding a Reminders list into it would compete with
the Now lane, so reminders stay in their own lane and never get auto-scheduled
into deep-work blocks.

Reminders live on your phone, so an iOS Shortcut bridges them across, exactly
like the calendar one.

## Why an Edge Function (same story as the calendar)

`today_reminders` is under per-user RLS (`auth.uid() = user_id`). The Shortcut
authenticates with the **anon key**, whose `auth.uid()` is null, so a direct
REST write to `/rest/v1/today_reminders` passes silently and lands nothing. The
**`reminders-ingest`** function does the write with the service role and stamps
your user id.

Base URL:

```
https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest
```

Both `apikey` and `Authorization: Bearer …` carry the anon key (it is a signed
JWT, which is what the gateway's `verify_jwt` checks — the publishable `sb_…`
key will NOT work). Same headers the calendar Shortcut already sends.

## Build the Shortcut (one list, one HTTP call)

Name it something like **"Push Reminders to Today"**.

1. **Find Reminders** — `Find Reminders where Is Completed is No`. Add
   `List is <your list>` if you only want one list. (Do the whole thing per
   list; the function replaces one list at a time.)

2. **Repeat with Each** over the result, building a dictionary per reminder:

   | Key | Value |
   |---|---|
   | `id` | Repeat Item → **Identifier** |
   | `title` | Repeat Item → **Name** |
   | `due` | Repeat Item → **Due Date**, through *Format Date* |
   | `notes` | Repeat Item → **Notes** (optional) |
   | `priority` | Repeat Item → **Priority** (optional) |

   Add each dictionary to a variable **Items** (*Add to Variable*).

3. **Get Contents of URL** — Method `POST`, URL the base above, headers as
   above, Request Body **JSON**:

   ```json
   { "list": "<your list name>", "reminders": "[Items]" }
   ```

That's it. One request per run.

### Date format

Any of these work — the function reads the date and the wall-clock time out of
whatever Format Date produces:

- `2026-09-03` (no time — shows as undated-on-that-day)
- `9/3/2026, 2:30 PM` ← the Shortcuts default, fine as-is
- `2026-09-03 14:30`
- `2026-09-03T14:30:00-04:00`

**Times are stored as wall clock, on purpose.** "Call the plumber at 2:30" means
2:30 where you are; the function has no idea what timezone your phone was in, so
it keeps the digits you wrote rather than guessing an absolute instant. (Storing
it as a timestamp is what made a 2:30pm reminder read as 10:30am in testing.)

## Re-running is safe

Each reminder carries Apple's stable **Identifier**, and the function upserts on
`(user_id, source, source_id)` — so re-running updates in place instead of
duplicating. The calendar ingest piled up six copies of the same standup for
weeks before that was fixed; this one is built not to.

A batch POST with a `list` **replaces that whole list**: it clears the list
first, then inserts what the phone just read. So a reminder you completed or
deleted on the phone disappears from Today on the next run. Always send `id`.

## Automation

- **Time of Day → ~5:30 AM**, alongside the calendar Shortcut ("Run
  Immediately" on).
- Optionally **When I Open Today** for a mid-day refresh.

## Other shapes the function accepts

```
POST { title, due?, list?, notes?, priority?, completed?, id? }   -> upsert one
POST { list, reminders: [ … ] }                                   -> replace a list
DELETE ?list=<name>                                               -> clear one list
DELETE ?all=1                                                     -> clear everything
```

## Optional hardening

Set `REMINDERS_INGEST_SECRET` in the function's env (Dashboard → Edge Functions
→ reminders-ingest → Secrets) and send it as `x-reminders-secret`. Leave it
unset and `verify_jwt` alone gates the call.

## Smoke-test from a shell

```bash
set -a && source .env && set +a
B="https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest"
A=(-H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json")

curl -X POST "$B" "${A[@]}" -d '{"list":"__test__","reminders":[
  {"id":"t1","title":"call the plumber","due":"9/3/2026, 2:30 PM"}
]}'
curl -X DELETE "$B?list=__test__" "${A[@]}"   # clean up
```
