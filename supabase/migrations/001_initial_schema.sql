-- Extensões
create extension if not exists "uuid-ossp";

-- Tabela: maquinas
create table maquinas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Seed das 3 máquinas
insert into maquinas (nome) values ('MAQ 1'), ('MAQ 2'), ('MAQ 3');

-- Tabela: produtos
create table produtos (
  id uuid primary key default uuid_generate_v4(),
  sku text not null unique,
  nome text not null,
  tempo_producao_min integer not null check (tempo_producao_min > 0),
  tempo_limpeza_min integer not null default 0 check (tempo_limpeza_min >= 0),
  cor text not null default '#5B9BD5',
  criado_em timestamptz not null default now()
);

-- Tabela: ordens
create table ordens (
  id uuid primary key default uuid_generate_v4(),
  numero_externo text not null unique,
  produto_sku text references produtos(sku) on update cascade,
  maquina_id uuid references maquinas(id),
  quantidade numeric not null,
  unidade text not null default 'UN',
  data_prevista date,
  inicio_agendado timestamptz,
  fim_calculado timestamptz,
  status text not null default 'aguardando'
    check (status in ('aguardando','produzindo','limpeza','concluida','atrasada')),
  sincronizado_em timestamptz not null default now()
);

-- Tabela: eventos_timer
create table eventos_timer (
  id uuid primary key default uuid_generate_v4(),
  ordem_id uuid references ordens(id) on delete cascade,
  maquina_id uuid references maquinas(id),
  tipo text not null check (tipo in ('inicio','pausa','retomada','conclusao')),
  timestamp timestamptz not null default now()
);

-- Habilitar Realtime na tabela ordens
alter publication supabase_realtime add table ordens;

-- RLS
alter table maquinas enable row level security;
alter table produtos enable row level security;
alter table ordens enable row level security;
alter table eventos_timer enable row level security;

-- Políticas: leitura pública (MVP sem auth por enquanto)
create policy "leitura publica maquinas" on maquinas for select using (true);
create policy "leitura publica produtos" on produtos for select using (true);
create policy "leitura publica ordens" on ordens for select using (true);
create policy "leitura publica eventos" on eventos_timer for select using (true);

-- Políticas: escrita pública (MVP — restringir com auth depois)
create policy "escrita publica maquinas" on maquinas for all using (true);
create policy "escrita publica produtos" on produtos for all using (true);
create policy "escrita publica ordens" on ordens for all using (true);
create policy "escrita publica eventos" on eventos_timer for all using (true);
