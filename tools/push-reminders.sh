#!/bin/bash
# Apple Reminders -> Today, straight from the Mac over AppleScript.
#
# Why this exists instead of the Shortcut: Shortcuts' "Find Reminders" returns
# ZERO on both the Mac and the phone, filtered or not, against a library with
# 111 open reminders. Shortcuts is not listed under Privacy & Security →
# Reminders at all — it never even requested access — and `shortcuts run` from
# the CLI can never raise the prompt. osascript DOES have access (same path the
# /remind skill uses), so read the library directly and skip Shortcuts.
#
# Reads the default list, which is the live one. Per the /remind skill's
# findings the default list is NOT reachable by name or id (`every list` only
# returns `Capture`), so it has to be addressed as `default list`, inline.
#
# Usage: push-reminders.sh [--dry-run]
# Env:   TODAY_ENV (path to a .env holding VITE_SUPABASE_ANON_KEY)
#        REMINDERS_TIMEOUT (AppleScript timeout, default 500s)
set -euo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

ENV_FILE="${TODAY_ENV:-$(cd "$(dirname "$0")/.." && pwd)/.env}"
[ -f "$ENV_FILE" ] || { echo "no .env at $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${VITE_SUPABASE_ANON_KEY:?anon key missing}"

BASE="https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest"
AS_TIMEOUT="${REMINDERS_TIMEOUT:-500}"

# Bulk-fetch each property in ONE Apple Event; `every reminder whose completed
# is false` times out on this library.
#
# Reminder IDs are deliberately NOT fetched. That was a fifth Apple Event across
# ~2,860 items — a large share of a ~4-minute run — and it bought nothing: the
# batch POST replaces the whole list server-side rather than upserting row by
# row, so there is no key to match on.
#
# Fields are separated by US (0x1f) and records by RS (0x1e), so a title
# containing a comma, quote or newline cannot corrupt the stream. Dates are
# emitted as integer components — AppleScript's date-to-string is
# locale-dependent and must never be parsed.
raw=$(osascript - "$AS_TIMEOUT" <<'AS'
on run argv
  set tmo to (item 1 of argv) as integer
  with timeout of tmo seconds
    tell application "Reminders"
      set ns to name of every reminder of default list
      set cs to completed of every reminder of default list
      set ds to due date of every reminder of default list
      set ps to priority of every reminder of default list
    end tell
  end timeout
  set US to (ASCII character 31)
  set RS to (ASCII character 30)
  set out to ""
  repeat with i from 1 to count of ns
    if (item i of cs) is false then
      set dv to item i of ds
      if dv is missing value then
        set dtxt to ""
      else
        set dtxt to ((year of dv) as string) & "-" & my pad((month of dv) as integer) & ¬
          "-" & my pad(day of dv) & " " & my pad(hours of dv) & ":" & my pad(minutes of dv)
      end if
      set out to out & (item i of ns) & US & dtxt & US & ((item i of ps) as string) & RS
    end if
  end repeat
  return out
end run

on pad(n)
  if n < 10 then return "0" & (n as string)
  return n as string
end pad
AS
)

_RAW="$raw" /usr/bin/python3 - "$BASE" "$VITE_SUPABASE_ANON_KEY" "$DRY" <<'PY'
import json
import os
import sys
import time
import urllib.request

base, key, dry = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
raw = os.environ.get("_RAW", "")

records = []
for rec in raw.split("\x1e"):
    if not rec.strip():
        continue
    parts = rec.split("\x1f")
    if len(parts) < 3:
        continue
    title, due, prio = parts[0], parts[1], parts[2]
    title = title.strip()
    if not title:
        continue
    item = {"title": title, "list": "Reminders"}
    if due:
        item["due"] = due
    try:
        p = int(prio)
        if p:
            item["priority"] = p
    except ValueError:
        pass
    records.append(item)

dated = [r for r in records if "due" in r]
print("%d open reminders (%d dated)" % (len(records), len(dated)))

if dry:
    for r in sorted(dated, key=lambda x: x["due"])[:12]:
        print("   %s  %s" % (r["due"], r["title"][:60]))
    raise SystemExit(0)

# One batch replaces the whole "Reminders" list server-side, so anything
# completed or deleted on the phone disappears here on the next run.
body = json.dumps({"list": "Reminders", "reminders": records}).encode()
req = urllib.request.Request(
    base,
    data=body,
    headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    },
    method="POST",
)

# Retry the POST. Reading the library takes minutes, so losing the whole run to
# one transient DNS failure (which happened) is expensive; the read is the slow
# part and it's already done by here.
last = None
for attempt in range(4):
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(r.read().decode())
            break
    except Exception as exc:  # noqa: BLE001 - any network error is worth a retry
        last = exc
        if attempt < 3:
            time.sleep(2 ** attempt * 3)
else:
    print("push failed after 4 attempts: %s" % last, file=sys.stderr)
    raise SystemExit(1)
PY
