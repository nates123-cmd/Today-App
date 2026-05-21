-- Task-level pillar tag. Lets a task carry a pillar assignment
-- independent of its project (or when it has no project at all). Today's
-- Triage uses this to let users move orphan tasks into a pillar without
-- forcing them into a project.
--
-- When present, this OVERRIDES the inherited project.pillar in Today's
-- groupBy. Course should treat this as advisory; it doesn't change
-- project ownership.

alter table public.course_tasks
  add column if not exists pillar text;

create index if not exists course_tasks_pillar_idx on public.course_tasks(pillar);
