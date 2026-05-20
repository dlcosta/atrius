create table if not exists public.ordens_tanque_novo_fluxo (
  id uuid primary key default gen_random_uuid(),
  numero_externo text not null unique,
  produto_sku text not null,
  quantidade numeric not null,
  unidade text not null default 'L',
  tanque text not null,
  lote text,
  etapa text not null default 'tanque',
  tank_id text not null references public.tanques(id),
  tank_volume_liters numeric,
  setup_time_minutes integer not null default 0,
  production_time_minutes integer not null default 0,
  cleaning_time_minutes integer not null default 0,
  total_duration_minutes integer not null default 0,
  inicio_agendado timestamptz not null,
  fim_calculado timestamptz not null,
  planning_status text not null default 'SCHEDULED',
  color text,
  notes text,
  data_prevista date not null,
  status text not null default 'aguardando',
  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists ordens_tanque_novo_fluxo_tank_id_idx
  on public.ordens_tanque_novo_fluxo (tank_id);

create index if not exists ordens_tanque_novo_fluxo_data_prevista_idx
  on public.ordens_tanque_novo_fluxo (data_prevista);

create index if not exists ordens_tanque_novo_fluxo_inicio_agendado_idx
  on public.ordens_tanque_novo_fluxo (inicio_agendado);

create table if not exists public.ordens_envase_novo_fluxo (
  id uuid primary key default gen_random_uuid(),
  numero_externo text not null unique,
  produto_sku text not null,
  quantidade numeric not null,
  unidade text not null default 'L',
  tanque text not null,
  lote text,
  etapa text not null default 'envase',
  maquina_id uuid not null references public.maquinas(id),
  package_volume_liters numeric not null,
  units_per_box integer not null default 1,
  box_volume_liters numeric,
  estimated_boxes integer,
  total_unidades integer not null default 0,
  quantidade_agrupamentos integer not null default 0,
  quantidade_unidades_avulsas integer not null default 0,
  embalagem_label text not null,
  origin_tank_order_id text not null,
  origin_tank_source text not null default 'novo_fluxo',
  production_time_minutes integer not null default 0,
  cleaning_time_minutes integer not null default 0,
  total_duration_minutes integer not null default 0,
  inicio_agendado timestamptz not null,
  fim_calculado timestamptz not null,
  planning_status text not null default 'SCHEDULED',
  calc_mode text not null default 'LITERS_MASTER',
  color text,
  notes text,
  data_prevista date not null,
  status text not null default 'aguardando',
  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists ordens_envase_novo_fluxo_maquina_id_idx
  on public.ordens_envase_novo_fluxo (maquina_id);

create index if not exists ordens_envase_novo_fluxo_inicio_agendado_idx
  on public.ordens_envase_novo_fluxo (inicio_agendado);

create index if not exists ordens_envase_novo_fluxo_origin_idx
  on public.ordens_envase_novo_fluxo (origin_tank_source, origin_tank_order_id);

alter table public.ordens_tanque_novo_fluxo enable row level security;
alter table public.ordens_envase_novo_fluxo enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ordens_tanque_novo_fluxo'
      and policyname = 'leitura publica ordens_tanque_novo_fluxo'
  ) then
    create policy "leitura publica ordens_tanque_novo_fluxo"
      on public.ordens_tanque_novo_fluxo for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ordens_tanque_novo_fluxo'
      and policyname = 'escrita publica ordens_tanque_novo_fluxo'
  ) then
    create policy "escrita publica ordens_tanque_novo_fluxo"
      on public.ordens_tanque_novo_fluxo for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ordens_envase_novo_fluxo'
      and policyname = 'leitura publica ordens_envase_novo_fluxo'
  ) then
    create policy "leitura publica ordens_envase_novo_fluxo"
      on public.ordens_envase_novo_fluxo for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ordens_envase_novo_fluxo'
      and policyname = 'escrita publica ordens_envase_novo_fluxo'
  ) then
    create policy "escrita publica ordens_envase_novo_fluxo"
      on public.ordens_envase_novo_fluxo for all using (true) with check (true);
  end if;
end $$;
