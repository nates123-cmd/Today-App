-- Work assigned INTO a time block, plus the optional timing layer.
--
-- Until now a block carried only a pillar, and PillarBlockView inferred what to
-- work on by listing every project in that pillar. That is not a plan: tapping
-- the 9am Arrow block showed all of Arrow, not the three things Nate actually
-- put there. `block_items` is the missing edge — an explicit, ordered checklist
-- hanging off one placed_blocks row.
--
-- ONE-WAY BY DESIGN. `label` is a SNAPSHOT taken at assignment time, not a live
-- read of cp_tasks. Renaming a task in Course+ does not rewrite what is on
-- today's list, and deleting the project does not blank the block. `cp_task_id`
-- is deliberately NOT a foreign key for the same reason: Course+ owns its rows
-- and may archive or hard-delete them, and that must never cascade into a day
-- that already happened. The one write that does travel back is completion —
-- checking off a course-sourced item marks the cp_task done, because a task
-- that is done is done in both places.

create table if not exists public.block_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  block_id    uuid not null references public.placed_blocks(id) on delete cascade,
  -- Denormalized from the parent block so a whole day's items load in one
  -- query keyed on date, without joining placed_blocks first. Kept in step by
  -- the trigger below.
  date        date not null,
  position    int  not null default 0,

  -- 'manual' = Nate typed it here. 'course' = pulled from Course+.
  source      text not null default 'manual',
  cp_task_id  uuid,
  label       text not null,

  done        boolean not null default false,
  done_at     timestamptz,

  -- ── the optional timing layer ──
  -- All four stay null unless Nate taps the stopwatch on a row. Nothing in the
  -- checklist flow reads them.
  recurring_key text,
  est_minutes   int,
  started_at    timestamptz,
  -- Accumulated run time. Pausing adds (now - started_at) here and nulls
  -- started_at, so a timer survives a reload: elapsed = elapsed_seconds +
  -- (started_at ? now - started_at : 0).
  elapsed_seconds int not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists block_items_block_idx on public.block_items(block_id, position);
create index if not exists block_items_day_idx   on public.block_items(user_id, date);
create index if not exists block_items_recur_idx on public.block_items(user_id, recurring_key)
  where recurring_key is not null;

-- A block can be dragged to another day; its items must follow. Also stamps
-- `date` on insert so callers never have to pass it.
create or replace function public.block_items_sync_date()
returns trigger language plpgsql as $$
begin
  select pb.date into new.date from public.placed_blocks pb where pb.id = new.block_id;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists block_items_sync_date on public.block_items;
create trigger block_items_sync_date
  before insert or update on public.block_items
  for each row execute function public.block_items_sync_date();

create or replace function public.placed_blocks_cascade_date()
returns trigger language plpgsql as $$
begin
  if new.date is distinct from old.date then
    update public.block_items set date = new.date where block_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists placed_blocks_cascade_date on public.placed_blocks;
create trigger placed_blocks_cascade_date
  after update on public.placed_blocks
  for each row execute function public.placed_blocks_cascade_date();

alter table public.block_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='block_items' and policyname='block_items_owner_all') then
    create policy block_items_owner_all on public.block_items
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;


-- ── Recurring work + how long it actually takes ──────────────────────────────
--
-- Only written when Nate answers "do this often? mark recurring" on an item.
-- Deliberately holds ROLLING AGGREGATES, not a per-run log: `runs` +
-- `total_seconds` give the average, `last_seconds` gives the most recent, and
-- that answers "how long does this really take vs what I guessed" with three
-- integers. A per-run history table is the point where this stops being worth
-- the weight.

create table if not exists public.recurring_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  -- Stable slug derived from the label. Editing the label keeps the key, so
  -- the accumulated history is not orphaned by a wording tweak.
  key         text not null,
  label       text not null,
  pillar      text,

  -- Nate's guess, in minutes. The thing actuals get compared against.
  est_minutes int,

  -- Optional auto-scheduling. null = it just remembers, it does not place
  -- itself. 'daily' | 'weekdays' | 'weekly:mon'…'weekly:sun'.
  schedule     text,
  default_hour numeric(4,2),

  runs          int not null default 0,
  total_seconds int not null default 0,
  last_seconds  int,
  last_run_on   date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists recurring_items_owner_key_uidx
  on public.recurring_items(user_id, key);

create or replace function public.recurring_items_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recurring_items_touch on public.recurring_items;
create trigger recurring_items_touch
  before update on public.recurring_items
  for each row execute function public.recurring_items_touch();

alter table public.recurring_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='recurring_items' and policyname='recurring_items_owner_all') then
    create policy recurring_items_owner_all on public.recurring_items
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
