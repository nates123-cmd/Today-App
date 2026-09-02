-- Apple Reminders -> Today.
--
-- Reminders are deliberately NOT Course+ tasks. Course+ is the source of truth
-- for project work and runs a pull method; dumping a Reminders list into it
-- would compete with the Now lane and muddy that. So reminders live in their
-- own table and render as their own strip in the day plan.
--
-- Written by the `reminders-ingest` edge function (service role, stamping
-- user_id) because the iOS Shortcut authenticates with the anon key, whose
-- auth.uid() is null — the same reason ical-ingest exists.

create table if not exists public.today_reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  title       text not null,
  -- Which Reminders list it came from ("Groceries", "Work", ...), so Today can
  -- group or filter without a second round trip.
  list_name   text,
  -- Local calendar day it is due, if any. Reminders can be undated; those are
  -- still worth showing, just not on a specific day.
  due_date    date,
  -- Full timestamp when the reminder carries a time, not just a day.
  due_at      timestamptz,
  completed   boolean not null default false,
  notes       text,
  -- Apple's priority: 0 none, 1 high, 5 medium, 9 low.
  priority    smallint,
  source      text not null default 'ios_reminders',
  -- Apple's stable reminder identifier. Lets a re-sync update in place instead
  -- of duplicating — the failure mode that plagued the calendar ingest for
  -- weeks before it was fixed.
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per reminder per source. Partial, because a reminder with no
-- identifier can't be deduped this way and must not block inserts.
create unique index if not exists today_reminders_owner_source_uidx
  on public.today_reminders (user_id, source, source_id)
  where source_id is not null;

create index if not exists today_reminders_due_idx
  on public.today_reminders (user_id, due_date);

alter table public.today_reminders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'today_reminders'
      and policyname = 'today_reminders_owner_all'
  ) then
    create policy today_reminders_owner_all on public.today_reminders
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
