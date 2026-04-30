-- Migracao 008: tabela de pedidos do ERP (Olist/Tiny)
-- Sincronizacao incremental via upsert por id_olist.

create table if not exists pedidos_erp (
  id_olist bigint primary key,
  situacao integer,
  numero_pedido bigint,
  data_criacao timestamptz,
  data_prevista timestamptz,
  cliente_id bigint,
  cliente_nome text,
  cliente_codigo text,
  cliente_cpf_cnpj text,
  valor numeric,
  origem_pedido integer,
  ecommerce_id bigint,
  ecommerce_nome text,
  ecommerce_numero_pedido text,
  sincronizado_em timestamptz not null default now()
);

create index if not exists pedidos_erp_numero_idx on pedidos_erp(numero_pedido);
create index if not exists pedidos_erp_situacao_idx on pedidos_erp(situacao);
create index if not exists pedidos_erp_data_criacao_idx on pedidos_erp(data_criacao);
create index if not exists pedidos_erp_cliente_cpf_cnpj_idx on pedidos_erp(cliente_cpf_cnpj);

alter table pedidos_erp enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pedidos_erp'
      AND policyname = 'leitura publica pedidos_erp'
  ) THEN
    CREATE POLICY "leitura publica pedidos_erp" ON pedidos_erp FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pedidos_erp'
      AND policyname = 'escrita publica pedidos_erp'
  ) THEN
    CREATE POLICY "escrita publica pedidos_erp" ON pedidos_erp FOR ALL USING (true);
  END IF;
END $$;
