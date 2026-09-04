# Apple Reminders → Today

Today shows Reminders as an **errands strip** in the day plan — beside the
Course+ work, never mixed into it. Course+ is the source of truth for project
work and runs a pull method; folding a Reminders list into it would compete with
the Now lane, so errands stay in their own lane and never get auto-scheduled
into deep-work blocks.

**What's shown:** every open reminder **due on or before the day being planned**
— i.e. **overdue + today + tomorrow**. Overdue leads the list, oldest first.
Undated reminders are stored but never displayed; a reminder with no date isn't
part of a day plan.

## How it gets there: `tools/push-reminders.sh` (NOT a Shortcut)

Run it on the Mac:

```bash
tools/push-reminders.sh --dry-run   # counts + the next dozen dated, no writes
tools/push-reminders.sh             # reads the library and posts one batch
```

It reads Apple Reminders over AppleScript and POSTs a batch to the
`reminders-ingest` edge function. One batch **replaces** the stored list, so
anything completed or deleted on the phone disappears from Today on the next
run.

### Why not the Shortcut (this was tried properly — don't redo it)

A full Shortcut was generated, signed, imported and confirmed rendering
correctly, and it still returned nothing. **Shortcuts' "Find Reminders" returns
ZERO on both the Mac and the phone**, with and without an `Is Completed is No`
filter, against a library holding 111 open reminders. Two probe shortcuts
(Find → Count → POST the count) both posted `0`, while the POST path itself
worked fine.

The cause: **Shortcuts does not appear under Privacy & Security → Reminders at
all** — it has never requested access — and `shortcuts run` from the CLI can
never raise the prompt, so it fails silently with exit 0 and no log line.
osascript *does* have access (it's what the `/remind` skill uses), hence the
script.

The generator is still in `tools/build-reminders-shortcut.py` if that permission
is ever granted. Notes for that path: the signer rejects a `.plist` extension
and wants `.wflow`; its "Unrecognized attribute string flag" output is harmless
ObjC noise (check the exit code, not stderr); use `/usr/bin/python3` because
Homebrew's plistlib is broken by a pyexpat mismatch.

### AppleScript landmines (all hit for real)

- **The live list is the `default list`**, and it is NOT reachable by name or
  id — `every list` only ever returns `Capture`. Address it inline.
- **`every reminder whose completed is false` times out** on this library
  (~2,860 items). Bulk-fetch each property in one Apple Event and filter after.
- **Reminder IDs are not fetched, on purpose.** That was a fifth Apple Event
  across every item and bought nothing, since the batch replaces the list
  server-side rather than upserting row by row.
- **Dates are emitted as integer components.** AppleScript's date-to-string is
  locale-dependent and must never be parsed.
- Fields are separated by US (0x1f) and records by RS (0x1e), so a title with a
  comma, quote or newline can't corrupt the stream.

## Scheduling

`tools/com.nate.today-reminders.plist` runs it at 5:30am.

```bash
cp tools/com.nate.today-reminders.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nate.today-reminders.plist
launchctl kickstart -k gui/$(id -u)/com.nate.today-reminders
tail ~/Library/Logs/today-reminders.log
```

**Test it after installing.** Reading Reminders needs TCC permission, and a
launchd agent is a different process from the terminal that currently holds it —
and a background agent cannot show a permission prompt. That is the exact trap
that made Shortcuts return zero. If the log says `0 open reminders`, it is
permission, not the script.

This runs on the **Mac**, so it only fires while the Mac is awake. Same iCloud
data as the phone.

## The edge function

`reminders-ingest` writes with the service role and stamps the owner id, because
`today_reminders` is under per-user RLS (`auth.uid() = user_id`) and the caller
authenticates with the anon key, whose `auth.uid()` is null — a direct REST
write would pass silently and land nothing.

```
POST { title, due?, list?, notes?, priority?, completed?, id? }   -> upsert one
POST { list, reminders: [ … ] }                                   -> replace a list
DELETE ?list=<name>                                               -> clear one list
DELETE ?all=1                                                     -> clear everything
```

Completed reminders are dropped at ingest. Undated ones are stored — the app is
what filters by day. They were briefly dropped here too, and that was a mistake:
an edge function silently discarding input makes an empty table impossible to
diagnose ("did the source find nothing, or did the function throw it away?").

### Date handling

Any of these parse: `2026-09-03`, `9/3/2026, 2:30 PM`, `2026-09-03 14:30`,
`2026-09-03T14:30:00-04:00`.

**Times are stored as wall clock, on purpose.** "Call the plumber at 2:30" means
2:30 where you are, and the function has no idea what timezone the source was
in, so it keeps the digits. Storing it as a timestamp made a 2:30pm reminder
read as 10:30am in testing. `due_at` is set only when the input carries an
explicit offset. Apple stores all-day reminders as `00:00`, which the UI renders
as no time rather than a fake "12:00a".

### Optional hardening

Set `REMINDERS_INGEST_SECRET` in the function's env (Dashboard → Edge Functions
→ reminders-ingest → Secrets) and send it as `x-reminders-secret`. Leave it
unset and `verify_jwt` alone gates the call.

## Smoke-test from a shell

```bash
set -a && source .env && set +a
B="https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest"
A=(-H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json")

curl -X POST "$B" "${A[@]}" -d '{"id":"t1","title":"call the plumber","due":"9/3/2026, 2:30 PM","list":"__test__"}'
curl -X DELETE "$B?list=__test__" "${A[@]}"   # clean up
```
