-- Write-back queue: Today (and later any Claude) -> Apple Reminders.
--
-- Supabase cannot reach Apple Reminders; only the Mac can. So a change made
-- anywhere else is recorded here as a pending action, and the Mac's reminders
-- agent (tools/push-reminders.sh, via remkit/EventKit) drains the queue on its
-- next run and acks each row. Before this existed, ticking a reminder in Today
-- only flipped `today_reminders.completed`, and the next push brought it back.
--
-- Actions:
--   complete    source_id required. payload.note (optional) is appended to the
--               reminder's notes, e.g. "moved to Course+ / Q3 Planning".
--   uncomplete  source_id required.
--   create      payload { title, due?, notes?, priority?, list? }. `due` is
--               wall-clock text, "YYYY-MM-DD" or "YYYY-MM-DD HH:MM".

create table if not exists public.today_reminder_actions (
  id          uuid primary key default gen_random_uuid(),
  -- Defaults to the caller so the app can insert without passing it.
  user_id     uuid not null default auth.uid(),
  action     text not null check (action in ('complete', 'uncomplete', 'create')),
  -- Apple's calendarItemIdentifier (= today_reminders.source_id). Null for create.
  source_id   text,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts    smallint not null default 0,
  error       text,
  -- For create: the identifier Apple assigned, so the caller can find it.
  result_id   text,
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,
  check (action = 'create' or source_id is not null)
);

create index if not exists today_reminder_actions_pending_idx
  on public.today_reminder_actions (user_id, created_at)
  where status = 'pending';

alter table public.today_reminder_actions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'today_reminder_actions'
      and policyname = 'today_reminder_actions_owner_all'
  ) then
    create policy today_reminder_actions_owner_all on public.today_reminder_actions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Sync-by-id for today_reminders. The agent now sends Apple's identifier with
-- every reminder, so the ingest UPSERTS on it instead of delete-then-insert.
-- That keeps each row's uuid stable across runs and lets a pending "complete"
-- survive a push. PostgREST's on_conflict cannot target a PARTIAL index, so the
-- partial one is replaced by a plain unique index; NULL source_ids stay distinct
-- under default NULLS DISTINCT, so legacy id-less rows still insert.
drop index if exists public.today_reminders_owner_source_uidx;
create unique index if not exists today_reminders_owner_source_key
  on public.today_reminders (user_id, source, source_id);

-- When the reminder was written on the phone. Feeds "captured 5 min ago" in
-- triage.
alter table public.today_reminders add column if not exists captured_at timestamptz;
