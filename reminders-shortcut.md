# Apple Reminders → Today

Today shows your Reminders as an **errands strip** in the day plan — beside the
Course+ work, never mixed into it. Course+ is the source of truth for project
work and runs a pull method; folding a Reminders list into it would compete with
the Now lane, so errands stay in their own lane and never get auto-scheduled
into deep-work blocks.

The Shortcut is **already built** — see below. Regenerate it with
`tools/build-reminders-shortcut.py` if it ever needs changing.

## Why an Edge Function (same story as the calendar)

`today_reminders` is under per-user RLS (`auth.uid() = user_id`). The Shortcut
authenticates with the **anon key**, whose `auth.uid()` is null, so a direct
REST write to `/rest/v1/today_reminders` passes silently and lands nothing. The
**`reminders-ingest`** function does the write with the service role and stamps
the owner id.

Base URL:

```
https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest
```

Both `apikey` and `Authorization: Bearer …` carry the anon key (a signed JWT,
which is what the gateway's `verify_jwt` checks — the publishable `sb_…` key
will NOT work).

## The Shortcut

Named **"Push Reminders to Today"**. Five actions:

1. **Get Contents of URL** — `DELETE …/reminders-ingest?all=1`
2. **Find Reminders**
3. **Repeat with Each**
4. **Get Contents of URL** — `POST …/reminders-ingest`, JSON body:
   `id` / `title` / `due` / `notes` / `list` / `completed`, each a **Repeat
   Item** property
5. **End Repeat**

It clears the server copy first, then re-posts what the phone currently holds —
so a reminder completed or deleted on the phone disappears from Today on the
next run.

### Regenerating

```bash
/usr/bin/python3 tools/build-reminders-shortcut.py out.plist .env
cp out.plist out.wflow                 # the signer keys off the extension
shortcuts sign -m anyone -i out.wflow -o "Push Reminders to Today.shortcut"
open "Push Reminders to Today.shortcut"
```

Use `/usr/bin/python3`, **not** the Homebrew one — Homebrew's `plistlib` is
broken by the pyexpat mismatch (see `project_macos_python_env`). The signer
rejects a `.plist` extension and accepts `.wflow`; the "Unrecognized attribute
string flag" lines it prints are harmless ObjC noise, check the exit code.

## Run it on the PHONE, not the Mac

**This Mac's Reminders is empty as far as Shortcuts is concerned.** A probe
shortcut (Find Reminders → Count → POST the count) posted **0**, which proves
the shortcut mechanics work end to end and that Find Reminders simply has
nothing to return here. The reminders live on the iPhone.

Shortcuts sync over iCloud, so "Push Reminders to Today" is already on the
phone — run it there. That was always the intended home for it (the 5:30am
automation runs on the phone), the Mac was only ever a test bench.

Also note: running from the command line (`shortcuts run …`) can't show the
Reminders permission prompt, so it hangs or silently yields nothing. Use the ▶
button in the app.

## Only today and tomorrow

The strip shows reminders **dated for the day being displayed** — today on the
Today surface, tomorrow on the Tomorrow surface. Nothing else.

- **Undated reminders never reach the table.** The ingest drops them. A
  "someday, renew the passport" item is a list entry, not part of a day plan.
- **Completed reminders are dropped too**, so a long Reminders history can't
  pollute the table even though Find Reminders returns everything.

Reminders dated further out are stored but simply not shown; the app queries one
exact day. If that ever needs tightening to a true two-day pull, the Shortcut
would have to compute the local dates and send them as a range — deliberately
avoided for now, since the visible result is identical and date maths in
Shortcuts is where the bugs live.

**"Find Reminders" has no filter, on purpose.** A filter template is the most
fragile part of the plist format, so the generated Shortcut omits it and the
edge function drops completed reminders instead — the table stays clean either
way. If your Reminders history is long enough that the run feels slow, open the
Shortcut and use **+ Add Filter → Is Completed → is → No**. One dropdown in the
editor, far safer than generating it.

## Re-running is safe

Each reminder carries Apple's stable **Identifier**, and the function upserts on
`(user_id, source, source_id)` — re-running updates in place instead of
duplicating. The calendar ingest piled up six copies of the same standup for
weeks before that was fixed; this one is built not to.

## Date format

Whatever Format Date produces is fine — the function reads the date and the
wall-clock time out of any of these:

- `2026-09-03` (no time)
- `9/3/2026, 2:30 PM` ← Shortcuts' default
- `2026-09-03 14:30`
- `2026-09-03T14:30:00-04:00`

**Times are stored as wall clock, on purpose.** "Call the plumber at 2:30" means
2:30 where you are; the function has no idea what timezone your phone was in, so
it keeps the digits you wrote rather than guessing an instant. Storing it as a
timestamp is what made a 2:30pm reminder read as 10:30am in testing. `due_at` is
set only when the input carries an explicit offset.

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

curl -X POST "$B" "${A[@]}" -d '{"id":"t1","title":"call the plumber","due":"9/3/2026, 2:30 PM","list":"__test__"}'
curl -X DELETE "$B?list=__test__" "${A[@]}"   # clean up
```
