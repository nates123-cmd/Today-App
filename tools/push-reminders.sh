#!/bin/bash
# Apple Reminders <-> Today, from the Mac, over EventKit (remkit).
#
# Each run does two things, in this order:
#   1. DRAIN the write-back queue (today_reminder_actions): ticks made in Today,
#      and reminders created from elsewhere, are applied to Apple via remkit,
#      then acked back to the edge function.
#   2. ROUTE reminders that start with an app prefix ("stock: ...", "cue: ...")
#      through the Course+ capture router, then complete them in Apple.
#   3. PUSH the default list's open reminders, each with Apple's identifier, so
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
  # -f matters: in the repo, tools/remkit is the source DIRECTORY, and -x alone
  # is true for a directory.
  if [ -f "$HERE/remkit" ]; then REMKIT="$HERE/remkit"; else REMKIT="$HERE/remkit/remkit"; fi
fi
[ -f "$REMKIT" ] && [ -x "$REMKIT" ] || { echo "remkit not found at $REMKIT (run tools/remkit/build.sh)" >&2; exit 1; }

STATE_DIR="${REMINDERS_STATE_DIR:-$HOME/Library/Application Support/today-reminders}"
mkdir -p "$STATE_DIR"

exec /usr/bin/python3 - "$REMKIT" "$VITE_SUPABASE_ANON_KEY" "$DRY" "$STATE_DIR" <<'PY'
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
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
    if kind == "set_due":
        due = str(pl.get("due") or "").strip()
        if not due:
            return {"id": a["id"], "ok": False, "error": "set_due needs payload.due"}
        code, _, err = rk("update", sid, "--due", due)
        if code == 0:
            return {"id": a["id"], "ok": True}
        if code == 4:
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

def read_open():
    code, items, err = rk("list")
    if code != 0 or items is None:
        # Never push on a failed read: an empty batch would wipe the list in Today.
        raise SystemExit("remkit list failed (%d): %s" % (code, err))
    return items


open_items = read_open()

# --- 2a. prefix routing -------------------------------------------------------
#
# A reminder that starts with an app prefix ("stock: low on olive oil",
# "Cue: Gone Girl") is an explicit instruction, so it is routed with no tap:
# posted to the Course+ capture router (the same endpoint the watch and the
# Capture list use), then completed in Apple with the router's receipt as a
# note. Reminders WITHOUT a prefix are never touched here; they wait for triage.
#
# Duplicate safety: the router writes a real record on every POST, so a
# reminder must never be posted twice. ROUTE_LEDGER records each reminder
# BEFORE the POST ("sending"). A crash or timeout mid-POST leaves "sending" or
# "uncertain", and such a reminder is never re-posted; it stays open for triage.

# "cue" may carry a format word ("cue book: Gone Girl"); it stays in the text
# sent to the router, which uses it to pick the media type.
PREFIX = re.compile(
    r"^\s*(stock|cue(?:\s+(?:book|movie|film|show|tv|podcast|album|article))?|course|c|ink|break)"
    r"\s*(?::|\bcolon\b)\s*(.+)$",
    re.I | re.S,
)
ALIAS = {"c": "course"}
# Apps the router can place.
ROUTED_APPS = set(filter(None, os.environ.get("ROUTED_APPS", "stock,course,ink,break,cue").split(",")))
CAPTURE_URL = "https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/capture"
CAPTURE_KEY = os.environ.get("CAPTURE_KEY", "")
ROUTE_LEDGER = os.path.join(state_dir, "routed-reminders.json")
MAX_ROUTE_ATTEMPTS = 3


def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def post_capture(text):
    """-> ("ok", line) | ("failed", why) [nothing saved] | ("uncertain", why)."""
    req = urllib.request.Request(
        CAPTURE_URL,
        data=text.encode(),
        method="POST",
        headers={
            "x-capture-key": CAPTURE_KEY,
            "content-type": "text/plain; charset=utf-8",
            # Provenance: Stock labels these "from Reminders", not "added by voice".
            "x-capture-src": "reminders",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return "ok", r.read().decode().strip()
    except urllib.error.HTTPError as exc:
        # The endpoint answered, so we know what happened: a non-2xx line means
        # nothing was saved ("Not saved: router error", "Auth failed").
        return "failed", "%d %s" % (exc.code, exc.read().decode(errors="replace").strip()[:200])
    except Exception as exc:  # noqa: BLE001 - timeout / network: may or may not have landed
        return "uncertain", str(exc)[:200]


def route_prefixed(items):
    todo = []
    for r in items:
        m = PREFIX.match(r.get("title") or "")
        if not m:
            continue
        head = " ".join(m.group(1).lower().split())  # "cue  Book" -> "cue book"
        app = ALIAS.get(head.split()[0], head.split()[0])
        label = ALIAS.get(head, head)  # full prefix, format word included
        if app in ROUTED_APPS:
            todo.append((r, app, label, m.group(2).strip()))
    if not todo:
        return 0
    if not CAPTURE_KEY:
        stamp("%d prefixed reminder(s) waiting, but no CAPTURE_KEY in the env" % len(todo))
        return 0

    led = load_json(ROUTE_LEDGER)
    routed = 0
    for r, app, label, body in todo:
        rid = r["id"]
        entry = led.get(rid, {})
        state = entry.get("state")
        if state in ("sending", "uncertain", "gave_up"):
            continue  # never re-post; left open for triage
        if dry:
            stamp("would route [%s] %s" % (app, r["title"][:80]))
            continue
        if state != "posted":
            # The prefix is normalised ("c:" -> "course:") and kept in the text:
            # it is the strongest hint the classifier gets.
            text = "%s: %s" % (label, body)
            if r.get("notes"):
                text += "\n" + r["notes"][:1000]
            entry = {"state": "sending", "app": app, "at": time.time(), "attempts": entry.get("attempts", 0) + 1}
            led[rid] = entry
            save_json(ROUTE_LEDGER, led)
            outcome, detail = post_capture(text)
            if outcome == "ok":
                entry.update(state="posted", line=detail)
            elif outcome == "failed":
                entry.update(state="gave_up" if entry["attempts"] >= MAX_ROUTE_ATTEMPTS else "retry", error=detail)
            else:
                entry.update(state="uncertain", error=detail)
            save_json(ROUTE_LEDGER, led)
            stamp("route [%s] %s -> %s" % (app, r["title"][:60], detail))
            if outcome != "ok":
                continue
        code, _, err = rk("complete", rid, "--note", "Routed: " + entry["line"])
        if code in (0, 4):
            entry["state"] = "done"
            save_json(ROUTE_LEDGER, led)
            routed += 1
        else:
            stamp("routed but could not complete %s: %s (will retry, no re-post)" % (rid, err))
    return routed


if route_prefixed(open_items):
    open_items = read_open()  # the routed ones are completed now; read again

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

# --- 3. triage suggestions -----------------------------------------------------
#
# Undated reminders with no app prefix are the triage inbox in Today. Ask the
# Course+ reminder-triage function to classify the ones that have no suggestion
# yet (it skips the rest and caps classifier calls per request, so a backlog
# drains over a few runs). Suggest-only: nothing is filed until Nate taps.
# Runs AFTER the push because the function looks the rows up by source_id.
TRIAGE_URL = "https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminder-triage"
inbox = [
    {"id": r["id"], "title": r["title"], "notes": r.get("notes")}
    for r in records
    if "due" not in r and not PREFIX.match(r["title"])
]
if inbox and CAPTURE_KEY:
    req = urllib.request.Request(
        TRIAGE_URL,
        data=json.dumps({"op": "suggest", "reminders": inbox}).encode(),
        method="POST",
        headers={"x-capture-key": CAPTURE_KEY, "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            out = json.loads(r.read().decode() or "{}")
        if out.get("suggested") or out.get("pending"):
            stamp("triage suggest -> %s" % json.dumps(out))
    except Exception as exc:  # noqa: BLE001 - suggestions are best-effort
        stamp("triage suggest failed: %s" % str(exc)[:200])
PY
