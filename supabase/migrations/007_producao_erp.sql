-- Migracao 007: tabela de estrutura de producao dos produtos ERP (Olist/Tiny)

-- Estrutura de materias-primas por produto fabricado
create table if not exists producao_estrutura_erp (
  id bigserial primary key,
  produto_id_olist bigint not null references produtos_erp(id_olist) on delete cascade,
  mp_id_olist bigint,
  mp_sku text,
  mp_descricao text not null,
  mp_tipo text,
  quantidade numeric not null,
  sincronizado_em timestamptz not null default now()
);

create index if not exists producao_estrutura_produto_idx on producao_estrutura_erp(produto_id_olist);

-- Etapas de producao por produto fabricado
create table if not exists producao_etapas_erp (
  id bigserial primary key,
  produto_id_olist bigint not null references produtos_erp(id_olist) on delete cascade,
  ordem integer not null,
  descricao text not null,
  sincronizado_em timestamptz not null default now()
);

create index if not exists producao_etapas_produto_idx on producao_etapas_erp(produto_id_olist);

alter table producao_estrutura_erp enable row level security;
alter table producao_etapas_erp enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'producao_estrutura_erp'
      AND policyname = 'leitura publica producao_estrutura_erp'
  ) THEN
    CREATE POLICY "leitura publica producao_estrutura_erp" ON producao_estrutura_erp FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'producao_estrutura_erp'
      AND policyname = 'escrita publica producao_estrutura_erp'
  ) THEN
    CREATE POLICY "escrita publica producao_estrutura_erp" ON producao_estrutura_erp FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'producao_etapas_erp'
      AND policyname = 'leitura publica producao_etapas_erp'
  ) THEN
    CREATE POLICY "leitura publica producao_etapas_erp" ON producao_etapas_erp FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'producao_etapas_erp'
      AND policyname = 'escrita publica producao_etapas_erp'
  ) THEN
    CREATE POLICY "escrita publica producao_etapas_erp" ON producao_etapas_erp FOR ALL USING (true);
  END IF;
END $$;
