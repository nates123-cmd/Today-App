-- One-off cleanup of duplicate ical rows accumulated before the sweep in
-- `ical-ingest` existed. Run with:
--     supabase db query --linked -f tools/cleanup-ical-ghosts.sql
--
-- Two classes of leftover, and NOTHING else is touched:
--
--   1. A MOVED event. clearMatch keys on (date, hour, title), so an event whose
--      time changed re-inserts at the new hour and the old row survives. On
--      2026-08-17 a flight to New York shifted the timezone and left every
--      meeting duplicated exactly one hour apart.
--   2. BYTE-IDENTICAL rows (same date, title AND hour) from the older
--      double-quote bug, which inserted several copies within a single run.
--
-- Safety, which is why the predicate is fussier than "same title twice":
--   * a row is only deleted if its (date, title) group has another, NEWER copy,
--     so a group can never be emptied;
--   * a unique event is never touched however stale its timestamp is;
--   * a GENUINE pair of same-titled meetings on one day is written by the same
--     run, so the copies share a timestamp, neither is older than the other,
--     and both survive.
--
-- Measured 2026-09-09: 62 rows across 20 dates, all in the past (2026-06-07 to
-- 2026-08-17), zero on today or any future date.
with grouped as (
  select id,
         count(*)        over (partition by date, title) as copies,
         max(updated_at) over (partition by date, title) as newest,
         updated_at,
         row_number()    over (partition by date, title, hour order by updated_at, id) as rn
  from placed_blocks
  where source = 'ical'
)
delete from placed_blocks p
using grouped g
where p.id = g.id
  and ((g.copies > 1 and g.updated_at < g.newest) or g.rn > 1)
returning p.id;
