alter table public.ordens
  add column if not exists calc_mode text;

update public.ordens
set calc_mode = coalesce(calc_mode, 'LITERS_MASTER')
where calc_mode is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ordens_calc_mode_check'
  ) then
    alter table public.ordens
      add constraint ordens_calc_mode_check
      check (calc_mode in ('LITERS_MASTER', 'BOXES_MASTER'));
  end if;
end $$;
