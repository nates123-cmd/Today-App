#!/bin/bash
# Apple Reminders <-> Today, from the Mac, over EventKit (remkit).
#
# Each run does two things, in this order:
#   1. DRAIN the write-back queue (today_reminder_actions): ticks made in Today,
#      and reminders created from elsewhere, are applied to Apple via remkit,
#      then acked back to the edge function.
#   2. PUSH the default list's open reminders, each with Apple's identifier, so
#      reminders-ingest syncs by id (upsert + remove what is no longer open).
# Draining first means a reminder ticked in Today is already completed in Apple
# by the time the list is read, so the push does not bring it back.
#
# History: this used to read Reminders over osascript, which took minutes per
# run and could not fetch identifiers cheaply, so it ran 3x a day and replaced
# the whole list. remkit reads the store in well under a second, so the agent
# now runs every few minutes. Shortcuts remains a dead end ("Find Reminders"
# returns zero); see git history.
#
# Usage: push-reminders.sh [--dry-run]     (--dry-run: read only, no writes)
# Env:   TODAY_ENV  path to a .env holding VITE_SUPABASE_ANON_KEY
#        REMKIT     path to the remkit binary (default: next to this script,
#                   then tools/remkit/remkit in the repo)
set -euo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${TODAY_ENV:-$HERE/../.env}"
[ -f "$ENV_FILE" ] || { echo "no .env at $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${VITE_SUPABASE_ANON_KEY:?anon key missing}"

if [ -z "${REMKIT:-}" ]; then
  if [ -x "$HERE/remkit" ]; then REMKIT="$HERE/remkit"; else REMKIT="$HERE/remkit/remkit"; fi
fi
[ -x "$REMKIT" ] || { echo "remkit not found at $REMKIT (run tools/remkit/build.sh)" >&2; exit 1; }

STATE_DIR="${REMINDERS_STATE_DIR:-$HOME/Library/Application Support/today-reminders}"
mkdir -p "$STATE_DIR"

exec /usr/bin/python3 - "$REMKIT" "$VITE_SUPABASE_ANON_KEY" "$DRY" "$STATE_DIR" <<'PY'
import json
import os
import subprocess
import sys
import time
import urllib.request

remkit, key, dry, state_dir = sys.argv[1], sys.argv[2], sys.argv[3] == "1", sys.argv[4]
BASE = "https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest"
LEDGER = os.path.join(state_dir, "applied-actions.json")


def stamp(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S ") + msg, flush=True)


def call(method, query="", body=None):
    """HTTP to reminders-ingest with retries (a lone DNS blip once lost a run)."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        BASE + query,
        data=data,
        method=method,
        headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode() or "{}")
        except Exception as exc:  # noqa: BLE001 - any network error is worth a retry
            last = exc
            if attempt < 3:
                time.sleep(2 ** attempt * 3)
    raise RuntimeError("%s %s failed after 4 attempts: %s" % (method, query, last))


def rk(*args):
    p = subprocess.run([remkit, *args], capture_output=True, text=True, timeout=120)
    out = None
    if p.stdout.strip():
        try:
            out = json.loads(p.stdout)
        except ValueError:
            pass
    return p.returncode, out, p.stderr.strip()


def load_ledger():
    try:
        with open(LEDGER) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_ledger(ledger):
    # Keep the newest 500; old entries only matter until their ack lands.
    items = sorted(ledger.items(), key=lambda kv: kv[1].get("at", 0))[-500:]
    tmp = LEDGER + ".tmp"
    with open(tmp, "w") as f:
        json.dump(dict(items), f)
    os.replace(tmp, LEDGER)


def apply(a):
    """Apply one queued action in Apple. Returns an ack dict."""
    kind, sid, pl = a["action"], a.get("source_id"), a.get("payload") or {}
    if kind in ("complete", "uncomplete"):
        args = [kind, sid]
        if kind == "complete" and pl.get("note"):
            args += ["--note", str(pl["note"])]
        code, _, err = rk(*args)
        if code == 0:
            return {"id": a["id"], "ok": True}
        if code == 4:
            # Deleted on the phone since. Nothing left to do: count it done.
            return {"id": a["id"], "ok": True, "error": "not found in Apple Reminders"}
        return {"id": a["id"], "ok": False, "error": err or "remkit exit %d" % code}
    if kind == "create":
        title = str(pl.get("title") or "").strip()
        if not title:
            return {"id": a["id"], "ok": False, "error": "create needs payload.title"}
        args = ["add", title]
        for flag, field in (("--list", "list"), ("--due", "due"), ("--notes", "notes"), ("--priority", "priority")):
            if pl.get(field) not in (None, ""):
                args += [flag, str(pl[field])]
        code, out, err = rk(*args)
        if code == 0 and out:
            return {"id": a["id"], "ok": True, "result_id": out.get("id")}
        return {"id": a["id"], "ok": False, "error": err or "remkit exit %d" % code}
    return {"id": a["id"], "ok": False, "error": "unknown action %r" % kind}


# --- 1. drain the write-back queue ------------------------------------------

actions = call("GET", "?actions=pending").get("actions", [])
if actions:
    ledger = load_ledger()
    acks = []
    for a in actions:
        # Applied on an earlier run whose ack never landed: re-ack, never
        # re-apply (a second "create" would duplicate the reminder).
        if a["id"] in ledger:
            acks.append(ledger[a["id"]]["ack"])
            continue
        if dry:
            stamp("would apply %s %s %s" % (a["action"], a.get("source_id") or "", json.dumps(a.get("payload") or {})))
            continue
        ack = apply(a)
        if ack["ok"]:
            ledger[a["id"]] = {"ack": ack, "at": time.time()}
            save_ledger(ledger)
        acks.append(ack)
        stamp("%s %s -> %s" % (a["action"], a.get("source_id") or "", "ok" if ack["ok"] else ack["error"]))
    if acks and not dry:
        stamp("acks %s" % json.dumps(call("POST", body={"acks": acks})))

# --- 2. push the open list --------------------------------------------------

code, lists, err = rk("lists")
if code != 0:
    raise SystemExit("remkit lists failed (%d): %s" % (code, err))
default = next((l["title"] for l in lists if l.get("default")), None)
if default is None:
    raise SystemExit("no default Reminders list")

code, open_items, err = rk("list")
if code != 0 or open_items is None:
    # Never push on a failed read: an empty batch would wipe the list in Today.
    raise SystemExit("remkit list failed (%d): %s" % (code, err))

records = []
for r in open_items:
    title = (r.get("title") or "").strip()
    if not title:
        continue
    item = {"id": r["id"], "title": title, "list": default, "created": r.get("created")}
    if r.get("due"):
        item["due"] = r["due"]
    if r.get("priority"):
        item["priority"] = r["priority"]
    if r.get("notes"):
        item["notes"] = r["notes"]
    records.append(item)

dated = sum(1 for r in records if "due" in r)
if dry:
    stamp("%d open reminders (%d dated), %d pending actions; dry run, nothing written" % (len(records), dated, len(actions)))
    raise SystemExit(0)

res = call("POST", body={"list": default, "reminders": records})
stamp("%d open (%d dated) -> %s" % (len(records), dated, json.dumps(res)))
PY
