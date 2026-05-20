-- Today's day-of placed blocks.
-- Per spec §11. Owns the schedule that Triage commits + Scheduling places +
-- Live reads. Hour is a decimal so 11:30 = 11.5; renderer derives time labels
-- from hour + duration_minutes. type enum: meeting | routine | pillar | adhoc
-- | prep. source enum: gcal | tide_routine | today_user.
--
-- pillar is a text tag (matches Course's tag-string convention, not a FK).
-- project_id FKs course_projects so a block can drill into a Pillar Block view.

create table if not exists public.placed_blocks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  hour numeric(4,2) not null,
  duration_minutes int not null check (duration_minutes > 0),
  type text not null,
  title text not null,
  pillar text,
  project_id uuid references public.course_projects(id) on delete set null,
  source text not null default 'today_user',
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists placed_blocks_date_idx on public.placed_blocks(date);

-- updated_at trigger
create or replace function public.placed_blocks_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists placed_blocks_touch_updated_at on public.placed_blocks;
create trigger placed_blocks_touch_updated_at
  before update on public.placed_blocks
  for each row execute function public.placed_blocks_touch_updated_at();
