-- Migracao 006: tabela de produtos do ERP (Olist/Tiny)
-- Sincronizacao incremental via upsert por id_olist.

create table if not exists produtos_erp (
  id_olist bigint primary key,
  sku text,
  descricao text not null,
  tipo text not null,
  situacao text not null,
  unidade text,
  preco numeric,
  preco_custo numeric,
  preco_custo_medio numeric,
  estoque_quantidade numeric,
  estoque_localizacao text,
  data_criacao timestamptz,
  data_alteracao timestamptz,
  sincronizado_em timestamptz not null default now()
);

create index if not exists produtos_erp_sku_idx on produtos_erp(sku);
create index if not exists produtos_erp_situacao_idx on produtos_erp(situacao);
create index if not exists produtos_erp_tipo_idx on produtos_erp(tipo);

alter table produtos_erp enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'produtos_erp'
      AND policyname = 'leitura publica produtos_erp'
  ) THEN
    CREATE POLICY "leitura publica produtos_erp" ON produtos_erp FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'produtos_erp'
      AND policyname = 'escrita publica produtos_erp'
  ) THEN
    CREATE POLICY "escrita publica produtos_erp" ON produtos_erp FOR ALL USING (true);
  END IF;
END $$;
