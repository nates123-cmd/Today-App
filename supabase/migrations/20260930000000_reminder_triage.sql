-- Reminder triage: an inbox in Today for reminders WITHOUT an app prefix.
--
-- `suggestion` is written by the Course+ `reminder-triage` edge function (op
-- 'suggest'), which the Mac sync agent calls each run, so suggestions are ready
-- before Nate opens Today. Shape: { items: RoutedItem[] } straight from the
-- capture router's classifier (kind, text, title, back, project, due, media,
-- confidence). Nothing is filed until he taps.
--
-- `triage_state`:
--   null    in the inbox (if undated)
--   'moved' filed to an app; a `complete` is queued for Apple
--   'kept'  he chose to leave it as a plain reminder; stays out of the inbox
-- The ingest upsert never sends these columns, so they survive every sync and
-- disappear with the row once the reminder is completed in Apple.

alter table public.today_reminders add column if not exists suggestion jsonb;
alter table public.today_reminders add column if not exists suggested_at timestamptz;
alter table public.today_reminders add column if not exists triage_state text check (triage_state in ('moved', 'kept'));

-- "Today" in triage gives the reminder today's due date IN APPLE, so it shows
-- on the phone's Today list too. payload: { due: 'YYYY-MM-DD' }.
alter table public.today_reminder_actions drop constraint if exists today_reminder_actions_action_check;
alter table public.today_reminder_actions add constraint today_reminder_actions_action_check
  check (action in ('complete', 'uncomplete', 'create', 'set_due'));
