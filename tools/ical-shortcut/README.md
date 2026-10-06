# All Week Today App — generated iOS Shortcut

`gen.py` builds the calendar-feed Shortcut from scratch as a plist, so it can be
installed on ANY iPhone (work phone included) without rebuilding it by hand in
the Shortcuts editor. `All Week Today App.shortcut` is the signed, ready-to-
install output.

What it does (12 actions):

1. Current Date -> Adjust +1 day -> Format `yyyy-MM-dd` (Tomorrow)
2. `DELETE ical-ingest?from=<Tomorrow>&days=6` (clears tomorrow..+6)
3. Find Calendar Events: Start Date is in the next 7 days, Is All Day = false,
   sorted oldest first
4. Repeat each event: read Start Date / End Date / Title, format both dates as
   `yyyy-MM-dd'T'HH:mm`, `POST ical-ingest {start, end, title}`

The function derives date, decimal hour and duration itself (`parseLocal`), so
the Shortcut does no arithmetic.

**Why the DELETE starts tomorrow, not today.** The grab is "next 7 days from
run time", so a midday run cannot re-send this morning's meetings. Clearing
today would erase them from the grid until the next 5 AM run. Today is instead
handled by the function on every POST: `clearMatch` dedupes (date, hour,
title) and `sweepStale` removes today's not-re-sent rows at `hour >= now`, so a
canceled or moved afternoon meeting still disappears. That makes several runs a
day safe: 5 AM, noon, 6 PM is a good set (the 6 PM run lands before the 7 PM
planning pass).

## Rebuild

```bash
/usr/bin/python3 -I tools/ical-shortcut/gen.py
shortcuts sign --mode anyone --input prod-unsigned.shortcut --output "All Week Today App.shortcut"
```

Use the SYSTEM python: the Homebrew 3.14 build has a broken `pyexpat`, and
`plistlib` imports it. `shortcuts sign` prints "Unrecognized attribute string
flag" lines; they are noise, the file is fine. `--mode anyone` lets any device
import it without an iCloud relationship to this Mac.

## Install on a phone

1. Get the `.shortcut` file onto the phone (AirDrop, email to yourself, Files).
2. Tap it; Shortcuts opens with "Add Shortcut".
3. Run it once by hand: allow Calendar access, then allow the request to
   `xsmnfcmtbpeaccnyinkr.supabase.co` when asked.
4. Automations (cannot be exported): Shortcuts > Automation > + > Time of Day,
   Daily, Run Immediately, Don't Notify > run "All Week Today App". One each
   at 5:00 AM, 12:00 PM, 6:00 PM.

## Test without touching live data

`gen.py` also writes `test-unsigned.shortcut`, aimed at `http://127.0.0.1:8799`.
Run a logging stub there, import that variant into Shortcuts on the Mac, and
`shortcuts run "<name>"`. Never run a variant pointed at the live function on
the Mac: the DELETE clears the week and the Mac's calendar is not the phone's.
Pick a port that nothing else owns; `8787` is agentpad's.

The live shortcut's actions can be read straight out of the Mac's Shortcuts
database when you need ground truth for a parameter shape:
`sqlite3 ~/Library/Shortcuts/Shortcuts.sqlite "select writefile('x.bin', ZDATA) from ZSHORTCUTACTIONS where ZSHORTCUT=<Z_PK>"`
then `plutil -convert xml1`.
