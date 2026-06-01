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
//   POST   { date, hour, duration_minutes, title, source_id? }   -> insert one row
//   POST   { date, events: [ { hour, duration_minutes, title, source_id? }, ... ] }
//                                                -> replace the whole day at once
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

// Build one placed_blocks row from a calendar event, or null if invalid.
function normalizeEvent(e, date) {
  if (!e || typeof e !== "object") return null;
  const hour = Number(e.hour);
  const duration = Number(e.duration_minutes ?? e.duration);
  const title = typeof e.title === "string" ? e.title.trim() : "";
  if (!Number.isFinite(hour) || hour < 0 || hour >= 100) return null; // numeric(4,2) caps < 100
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!title) return null;
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

async function clearDay(date) {
  await sbFetch(
    `/placed_blocks?date=eq.${date}&source=eq.ical&user_id=eq.${OWNER_ID}`,
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

  // DELETE ?date=eq.YYYY-MM-DD&source=eq.ical  (the Shortcut's "clear the day" call)
  if (req.method === "DELETE") {
    const date = dateFromQuery(req.url);
    if (!date) return json({ error: "expected ?date=eq.YYYY-MM-DD" }, 400);
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

  // Date comes from the body for POSTs (top-level for batch, per-event for flat).
  const date = isoDate(body?.date);
  if (!date) return json({ error: "expected a date (YYYY-MM-DD or M/D/YY)" }, 400);

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
  // The Shortcut's separate DELETE call already cleared the day, so just insert.
  const row = normalizeEvent(body, date);
  if (!row) return json({ error: "invalid event (need hour, positive duration_minutes, title)" }, 400);
  try {
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
