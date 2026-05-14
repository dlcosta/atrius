-- Planejamento Tanques + Envase sem quebrar o legado de ordens.

create table if not exists public.tanques (
  id text primary key,
  nome text not null,
  volume_liters numeric not null check (volume_liters > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.tanques (id, nome, volume_liters)
values
  ('tank-3800', 'Tanque 3.800L', 3800),
  ('tank-5000', 'Tanque 5.000L', 5000),
  ('tank-10000', 'Tanque 10.000L', 10000)
on conflict (id) do update
set
  nome = excluded.nome,
  volume_liters = excluded.volume_liters,
  ativo = true;

alter table public.ordens add column if not exists tank_id text references public.tanques(id);
alter table public.ordens add column if not exists tank_volume_liters numeric;
alter table public.ordens add column if not exists package_volume_liters numeric;
alter table public.ordens add column if not exists units_per_box integer;
alter table public.ordens add column if not exists box_volume_liters numeric;
alter table public.ordens add column if not exists estimated_boxes integer;
alter table public.ordens add column if not exists setup_time_minutes integer;
alter table public.ordens add column if not exists production_time_minutes integer;
alter table public.ordens add column if not exists cleaning_time_minutes integer;
alter table public.ordens add column if not exists total_duration_minutes integer;
alter table public.ordens add column if not exists planning_status text;
alter table public.ordens add column if not exists color text;
alter table public.ordens add column if not exists origin_tank_order_id uuid references public.ordens(id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ordens'
      and column_name = 'duracao_planejada_min'
  ) then
    execute $sql$
      update public.ordens
      set
        setup_time_minutes = coalesce(setup_time_minutes, 0),
        production_time_minutes = coalesce(production_time_minutes, greatest(duracao_planejada_min, 1)),
        cleaning_time_minutes = coalesce(cleaning_time_minutes, 0)
      where setup_time_minutes is null
         or production_time_minutes is null
         or cleaning_time_minutes is null
    $sql$;
  else
    execute $sql$
      update public.ordens
      set
        setup_time_minutes = coalesce(setup_time_minutes, 0),
        production_time_minutes = coalesce(production_time_minutes, 60),
        cleaning_time_minutes = coalesce(cleaning_time_minutes, 0)
      where setup_time_minutes is null
         or production_time_minutes is null
         or cleaning_time_minutes is null
    $sql$;
  end if;
end $$;

update public.ordens
set total_duration_minutes = greatest(
  1,
  coalesce(setup_time_minutes, 0) + coalesce(production_time_minutes, 0) + coalesce(cleaning_time_minutes, 0)
)
where total_duration_minutes is null;

update public.ordens
set planning_status =
  case
    when status = 'cancelada' then 'CANCELED'
    when status = 'concluida' then 'COMPLETED'
    when status in ('produzindo', 'limpeza') then 'IN_PRODUCTION'
    when inicio_agendado is not null then 'SCHEDULED'
    else 'BACKLOG'
  end
where planning_status is null;

update public.ordens
set units_per_box = coalesce(units_per_box, 1)
where units_per_box is null;

update public.ordens
set box_volume_liters = package_volume_liters * units_per_box
where package_volume_liters is not null
  and units_per_box is not null
  and box_volume_liters is null;

update public.ordens
set estimated_boxes = floor(quantidade / box_volume_liters)
where box_volume_liters is not null
  and box_volume_liters > 0
  and estimated_boxes is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ordens_planning_status_check'
  ) then
    alter table public.ordens
      add constraint ordens_planning_status_check
      check (planning_status in ('BACKLOG','SCHEDULED','IN_PRODUCTION','COMPLETED','CANCELED'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ordens_setup_nonnegative_check'
  ) then
    alter table public.ordens
      add constraint ordens_setup_nonnegative_check
      check (setup_time_minutes is null or setup_time_minutes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ordens_production_positive_check'
  ) then
    alter table public.ordens
      add constraint ordens_production_positive_check
      check (production_time_minutes is null or production_time_minutes > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ordens_cleaning_nonnegative_check'
  ) then
    alter table public.ordens
      add constraint ordens_cleaning_nonnegative_check
      check (cleaning_time_minutes is null or cleaning_time_minutes >= 0);
  end if;
end $$;

alter table public.tanques enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tanques'
      and policyname = 'leitura publica tanques'
  ) then
    create policy "leitura publica tanques" on public.tanques for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tanques'
      and policyname = 'escrita publica tanques'
  ) then
    create policy "escrita publica tanques" on public.tanques for all using (true);
  end if;
end $$;
