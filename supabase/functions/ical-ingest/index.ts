import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// iOS Calendar -> placed_blocks ingest.
//
// Background: placed_blocks moved to per-user RLS (auth.uid() = user_id) in the
// 2026-05-29 migration. The iOS Shortcut authenticates with the anon key, whose
// auth.uid() is null, so its direct REST inserts/deletes silently fail under the
// new policy and the day spine stopped showing meetings. This function restores
// sync the same way health-ingest does: the gateway gates the call (verify_jwt),
// then the body runs privileged writes with the service role, stamping OWNER_ID
// so the rows are visible to the owner under RLS.
//
// It is a DROP-IN for the old direct-to-PostgREST calls so the existing Shortcut
// only needs its two URLs repointed from /rest/v1/placed_blocks to here. It
// accepts all three shapes:
//
//   DELETE ?date=eq.YYYY-MM-DD&source=eq.ical   -> clears that day's ical rows
//   DELETE ?from=YYYY-MM-DD&to=YYYY-MM-DD        -> clears an inclusive range
//   POST   { date, hour, duration_minutes, title, source_id? }   -> insert one row
//   POST   { start, end, title, source_id? }     -> insert one row; date, decimal
//          hour, and duration are derived from the raw Start/End datetimes, so
//          the Shortcut sends no computed numbers (one Format Date per field)
//   POST   { date, events: [ { ... }, ... ] }    -> replace the whole day at once
//
// type is always forced to 'meeting', source to 'ical', user_id to OWNER_ID.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-ical-secret",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

const SB = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
// Single-user ingest (owner's iOS Calendar). Stamp rows with the owner so
// per-user RLS keeps them visible. Same id as health-ingest. If this ever
// becomes multi-user, derive the id from the caller's JWT instead.
const OWNER_ID = "24c79501-4011-46c9-a3d3-a716d732d69c";
// Optional shared-secret hardening: if ICAL_INGEST_SECRET is set in the function
// env, the caller must echo it in the x-ical-secret header. If unset, the call
// is gated by verify_jwt alone (same as health-ingest).
const SECRET = Deno.env.get("ICAL_INGEST_SECRET");

// Normalize a date string to YYYY-MM-DD. Accepts ISO (yyyy-MM-dd, anywhere in
// the string) and the US short format the Shortcut's Format Date emits by
// default (M/d/yy or M/d/yyyy), so the Shortcut doesn't need its date format
// fixed. Returns null if no recognizable date is present.
function isoDate(s) {
  if (typeof s !== "string") return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    let [, mo, d, y] = us;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SB}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  if (r.status === 204) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Parse a local wall-clock datetime "YYYY-MM-DDTHH:MM" (or with a space). Any
// trailing timezone offset is IGNORED on purpose: the literal HH:MM in the
// string is the local time the user sees in Calendar, which is exactly what we
// want to store. This lets the Shortcut pass a raw Start/End date (one Format
// Date action, format yyyy-MM-dd'T'HH:mm) and skip all decimal-hour / duration
// arithmetic — the function derives date, hour, and duration itself.
function parseLocal(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  return { date: `${y}-${mo}-${d}`, hour: +hh + +mm / 60, mins: +hh * 60 + +mm };
}

// Build one placed_blocks row from a calendar event, or null if invalid.
// `fallbackDate` is the day to use when the event doesn't self-date via `start`.
function normalizeEvent(e, fallbackDate) {
  if (!e || typeof e !== "object") return null;
  let date = fallbackDate;
  let hour = Number(e.hour);
  let duration = Number(e.duration_minutes ?? e.duration);
  // Preferred path: derive everything from the raw Start/End datetimes so the
  // Shortcut sends no computed numbers. Falls back to explicit hour/duration.
  const st = parseLocal(e.start);
  if (st) {
    date = st.date;
    hour = st.hour;
    const en = parseLocal(e.end);
    if (en) {
      const diff = en.mins - st.mins; // same-day events; ignore rare midnight wrap
      if (diff > 0) duration = diff;
    }
  }
  date = isoDate(date) ?? date;
  const title = typeof e.title === "string" ? e.title.trim() : "";
  if (!isoDate(date)) return null;
  if (!Number.isFinite(hour) || hour < 0 || hour >= 100) return null; // numeric(4,2) caps < 100
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!title) return null;
  // Noise filters: skip canceled meetings and multi-day blocks (>= 1 day, e.g.
  // travel/trip events) — they swallow the day grid and aren't schedulable.
  if (/^cancell?ed:/i.test(title)) return null;
  if (duration >= 1440) return null;
  const row = {
    user_id: OWNER_ID,
    date,
    hour,
    duration_minutes: Math.round(duration),
    type: "meeting",
    title,
    source: "ical",
  };
  if (e.source_id != null && String(e.source_id).length) row.source_id = String(e.source_id);
  return row;
}

// Delete any existing ical row that collides with `row` on (date, hour, title),
// so a re-ingest of the same event overwrites in place instead of duplicating.
// The iOS shortcut loops events through the single-insert path (which, unlike
// the batch path, can't clear-the-day up front), so without this every run
// appended a fresh copy and the day accumulated ~N duplicates after N runs.
// Title is wrapped in PostgREST double-quotes (embedded quotes doubled) to stay
// safe against commas / parens / spaces in meeting names.
async function clearMatch(row) {
  const t = encodeURIComponent(`"${String(row.title).replace(/"/g, '""')}"`);
  await sbFetch(
    `/placed_blocks?date=eq.${row.date}&hour=eq.${row.hour}&title=eq.${t}&source=eq.ical&user_id=eq.${OWNER_ID}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
}

async function clearDay(date) {
  await sbFetch(
    `/placed_blocks?date=eq.${date}&source=eq.ical&user_id=eq.${OWNER_ID}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
}

// Add N calendar days to a YYYY-MM-DD string (UTC math avoids tz drift).
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Clear an inclusive [from, to] date range in one call so a single Shortcut run
// can refresh today AND tomorrow before re-inserting both.
async function clearRange(from, to) {
  await sbFetch(
    `/placed_blocks?date=gte.${from}&date=lte.${to}&source=eq.ical&user_id=eq.${OWNER_ID}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
}

// Pull a YYYY-MM-DD out of a PostgREST-style query value like `eq.2026-06-01`,
// tolerant of a malformed URL where the `&` got dropped.
function dateFromQuery(url) {
  // The Shortcut sends ?date=eq.<date> (PostgREST style); strip the eq. prefix.
  const raw = (new URL(url).searchParams.get("date") ?? "").replace(/^eq\./, "");
  return isoDate(raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (SECRET && req.headers.get("x-ical-secret") !== SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  // DELETE clears existing ical rows before re-insert. Shapes:
  //   ?date=eq.YYYY-MM-DD                  -> single day (original Shortcut)
  //   ?from=YYYY-MM-DD&to=YYYY-MM-DD       -> inclusive range
  //   ?from=YYYY-MM-DD&days=N              -> from..from+N (one date var; the
  //                                           Shortcut only needs today's date)
  if (req.method === "DELETE") {
    const u = new URL(req.url);
    const from = isoDate((u.searchParams.get("from") ?? "").replace(/^eq\./, ""));
    let to = isoDate((u.searchParams.get("to") ?? "").replace(/^eq\./, ""));
    const days = parseInt(u.searchParams.get("days") ?? "", 10);
    if (from && !to && Number.isFinite(days)) to = addDays(from, days);
    if (from && to) {
      try {
        await clearRange(from, to);
      } catch (e) {
        return json({ error: "delete failed: " + e.message }, 502);
      }
      return json({ from, to, cleared: true });
    }
    const date = dateFromQuery(req.url);
    if (!date) return json({ error: "expected ?date=eq.YYYY-MM-DD or ?from=&to=" }, 400);
    try {
      await clearDay(date);
    } catch (e) {
      return json({ error: "delete failed: " + e.message }, 502);
    }
    return json({ date, cleared: true });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // Date: explicit top-level `date`, else derived from a raw `start` datetime
  // (flat self-dating events). Batch mode still requires an explicit `date`.
  const date = isoDate(body?.date) ?? parseLocal(body?.start)?.date ?? null;
  if (!date) return json({ error: "expected a date (YYYY-MM-DD, M/D/YY, or a `start` datetime)" }, 400);

  // Batch mode: { date, events: [...] } -> replace the whole day.
  if (Array.isArray(body?.events)) {
    const rows = body.events.map((e) => normalizeEvent(e, date)).filter(Boolean);
    const skipped = body.events.length - rows.length;
    try {
      await clearDay(date);
      if (rows.length) {
        await sbFetch("/placed_blocks", {
          method: "POST",
          body: JSON.stringify(rows),
          headers: { Prefer: "return=minimal" },
        });
      }
    } catch (e) {
      return json({ error: "write failed: " + e.message }, 502);
    }
    return json({ date, inserted: rows.length, skipped, mode: "batch" });
  }

  // Flat mode: a single event per POST (the existing Shortcut's loop body).
  // We do NOT trust an up-front day-clear here: the Shortcut loops events one at
  // a time and (in practice) re-runs without a preceding DELETE, so a blind
  // insert duplicates the whole day on every run. clearMatch makes each insert
  // idempotent on (date, hour, title).
  const row = normalizeEvent(body, date);
  if (!row) return json({ error: "invalid event (need hour, positive duration_minutes, title)" }, 400);
  try {
    await clearMatch(row);
    await sbFetch("/placed_blocks", {
      method: "POST",
      body: JSON.stringify(row),
      headers: { Prefer: "return=minimal" },
    });
  } catch (e) {
    return json({ error: "insert failed: " + e.message }, 502);
  }
  return json({ date, inserted: 1, mode: "single" });
});
