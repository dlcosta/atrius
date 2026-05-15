-- Tabela de agendamentos de produção por tanque e turno

create table if not exists public.agendamentos_producao (
  id                uuid primary key default gen_random_uuid(),
  ordem_id          uuid not null references public.ordens(id) on delete cascade,
  tank_id           text not null references public.tanques(id),
  turno_id          text not null,
  turno_nome        text not null,
  data_agendamento  date not null,
  status            text not null default 'SCHEDULED',

  -- Rastreamento de execução
  data_inicio       timestamptz,
  data_pausa        timestamptz,
  observacao_pausa  text,
  data_retomada     timestamptz,
  data_conclusao    timestamptz,
  observacao_final  text,

  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- Índices para performance
create index if not exists agendamentos_producao_ordem_id_idx
  on public.agendamentos_producao (ordem_id);

create index if not exists agendamentos_producao_tank_id_idx
  on public.agendamentos_producao (tank_id);

create index if not exists agendamentos_producao_data_agendamento_idx
  on public.agendamentos_producao (data_agendamento);

create index if not exists agendamentos_producao_status_idx
  on public.agendamentos_producao (status);

-- RLS
alter table public.agendamentos_producao enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agendamentos_producao'
      and policyname = 'leitura publica agendamentos'
  ) then
    create policy "leitura publica agendamentos" on public.agendamentos_producao for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agendamentos_producao'
      and policyname = 'escrita publica agendamentos'
  ) then
    create policy "escrita publica agendamentos" on public.agendamentos_producao for all using (true);
  end if;
end $$;

-- Constraint para valores válidos de status
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agendamentos_producao_status_check'
  ) then
    alter table public.agendamentos_producao
      add constraint agendamentos_producao_status_check
      check (status in ('SCHEDULED', 'IN_PRODUCTION', 'PAUSED', 'COMPLETED', 'CANCELED'));
  end if;
end $$;
