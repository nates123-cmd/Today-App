-- Sub-schedule: which way a block's items are shown.
--
-- A block's checklist (block_items) can now also be read as a schedule — the
-- same rows, laid out on the clock from the block's start using each item's
-- est_minutes. No start time is stored per item; it is derived from order, so
-- moving or resizing the block cannot leave a sub-schedule stale.
--
-- The only thing worth persisting is which of the two views Nate left this
-- block in, so a block planned as a schedule reopens as one.

alter table public.placed_blocks
  add column if not exists items_view text not null default 'list';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'placed_blocks_items_view_check') then
    alter table public.placed_blocks
      add constraint placed_blocks_items_view_check check (items_view in ('list', 'schedule'));
  end if;
end $$;
