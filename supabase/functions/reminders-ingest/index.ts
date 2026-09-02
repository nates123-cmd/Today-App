import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Apple Reminders -> today_reminders ingest.
//
// Same shape and same reason as ical-ingest: `today_reminders` is under
// per-user RLS (auth.uid() = user_id), and the iOS Shortcut authenticates with
// the anon key, whose auth.uid() is null — so its direct REST writes would
// silently pass the RLS check and land nothing. The gateway gates the call
// (verify_jwt), then this body writes with the service role and stamps
// OWNER_ID so the rows are visible to the owner.
//
// Accepted shapes:
//   POST { title, due?, list?, notes?, priority?, completed?, id? }
//        -> upsert ONE reminder. `due` may be a date or a full datetime; the
//           function derives due_date (local day) and due_at itself, so the
//           Shortcut sends one Format Date and no computed fields.
//   POST { list?, reminders: [ {...}, ... ] }
//        -> replace a whole list in one call (the recommended shape: one HTTP
//           request per run instead of one per reminder).
//   DELETE ?list=<name>        -> clear one list's reminders
//   DELETE ?all=1              -> clear every reminder for the owner
//
// Upsert keys on (user_id, source, source_id), so re-running the Shortcut
// UPDATES rather than duplicating. That duplicate-on-every-run failure is
// exactly what went wrong with the calendar ingest for weeks, so reminders are
// built to avoid it from the start: always send Apple's reminder identifier as
// `id` when the Shortcut can provide it.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-reminders-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

const SB = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
// Single-user ingest (owner's iPhone). Same owner id as ical-ingest. If this
// ever becomes multi-user, derive it from the caller's JWT instead.
const OWNER_ID = "24c79501-4011-46c9-a3d3-a716d732d69c";
// Optional shared-secret hardening, mirroring ICAL_INGEST_SECRET. Unset = gated
// by verify_jwt alone.
const SECRET = Deno.env.get("REMINDERS_INGEST_SECRET");

// Normalize to YYYY-MM-DD. Accepts ISO anywhere in the string and the US short
// format Shortcuts' Format Date emits by default (M/d/yy), so the Shortcut does
// not need its date format corrected. Returns null when there's no date.
function isoDate(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    let [, mo, d, y] = us;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// The WALL-CLOCK time as written, e.g. "14:30". Deliberately text, not a
// timestamp.
//
// LANDMINE: `Date.parse("2026-09-03 14:30")` has no timezone in it, and the
// runtime resolved it as UTC — so a 2:30pm reminder came back as 14:30+00 and
// would render as 10:30am in New York. A reminder is a wall-clock thing ("call
// the plumber at 2:30"), and the function has no idea what timezone the phone
// was in, so storing an absolute instant is guessing. Keep the digits the user
// typed and let the UI print them.
function dueTime(s: unknown): string | null {
  if (typeof s !== "string") return null;
  // No \b before the hour: in an ISO string ("...-03T14:30:00") the "T" and the
  // preceding digits are both word characters, so a boundary never matches and
  // the time was silently dropped.
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  // Respect an am/pm marker if the Shortcut formatted a 12-hour clock.
  const ampm = s.match(/\b(a|p)\.?m\.?\b/i);
  if (ampm) {
    const pm = ampm[1].toLowerCase() === "p";
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  if (hh > 23 || Number(mm) > 59) return null;
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

// An absolute instant ONLY when the input carries an explicit offset or Z.
// Without one there is nothing to anchor it to (see dueTime above).
function dueAt(s: unknown): string | null {
  if (typeof s !== "string") return null;
  if (!/(Z|[+-]\d{2}:?\d{2})\s*$/.test(s.trim())) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return /^(1|true|yes|y)$/i.test(v.trim());
  return false;
}

function toRow(r: Record<string, unknown>, fallbackList?: unknown) {
  const title = String(r.title ?? r.name ?? "").trim();
  if (!title) return null; // a reminder with no text is not worth a row
  const rawDue = r.due ?? r.dueDate ?? r.due_date ?? null;
  const list = r.list ?? r.listName ?? r.list_name ?? fallbackList ?? null;
  const priority = Number(r.priority);
  return {
    user_id: OWNER_ID,
    title,
    list_name: list == null ? null : String(list),
    due_date: isoDate(rawDue),
    due_time: dueTime(rawDue),
    due_at: dueAt(rawDue),
    completed: truthy(r.completed ?? r.isCompleted),
    notes: r.notes == null ? null : String(r.notes),
    priority: Number.isFinite(priority) ? priority : null,
    source: "ios_reminders",
    source_id: r.id == null ? null : String(r.id),
    updated_at: new Date().toISOString(),
  };
}

async function sbFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (SECRET && req.headers.get("x-reminders-secret") !== SECRET) {
    return json({ error: "bad secret" }, 401);
  }

  const url = new URL(req.url);

  if (req.method === "DELETE") {
    const list = url.searchParams.get("list");
    const all = url.searchParams.get("all");
    let q = `/today_reminders?user_id=eq.${OWNER_ID}&source=eq.ios_reminders`;
    if (list) {
      q += `&list_name=eq.${encodeURIComponent(list)}`;
    } else if (!truthy(all)) {
      return json({ error: "DELETE needs ?list=<name> or ?all=1" }, 400);
    }
    const res = await sbFetch(q, { method: "DELETE" });
    return res.ok ? json({ deleted: true }) : json({ error: res.text }, res.status);
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const batch = Array.isArray(body.reminders) ? body.reminders : null;

  if (batch) {
    // Whole-list replace: clear the list, then insert what the phone just read.
    // Clearing first means a reminder completed or deleted on the phone
    // disappears here too, instead of lingering forever.
    const list = body.list ?? body.listName ?? null;
    if (list != null) {
      await sbFetch(
        `/today_reminders?user_id=eq.${OWNER_ID}&source=eq.ios_reminders&list_name=eq.${encodeURIComponent(String(list))}`,
        { method: "DELETE" }
      );
    }
    const rows = batch
      .map((r: Record<string, unknown>) => toRow(r, list))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (!rows.length) return json({ inserted: 0 });
    const res = await sbFetch("/today_reminders", {
      method: "POST",
      body: JSON.stringify(rows),
      headers: { Prefer: "resolution=merge-duplicates" },
    });
    return res.ok ? json({ inserted: rows.length }) : json({ error: res.text }, res.status);
  }

  const row = toRow(body);
  if (!row) return json({ error: "reminder needs a title" }, 400);
  const res = await sbFetch("/today_reminders", {
    method: "POST",
    body: JSON.stringify([row]),
    headers: { Prefer: "resolution=merge-duplicates" },
  });
  return res.ok ? json({ inserted: 1 }) : json({ error: res.text }, res.status);
});
