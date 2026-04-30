-- Migracao 004: tabela de categorias do ERP (Olist/Tiny)
-- Estrutura voltada para sincronizacao incremental via upsert por id.

create table if not exists categorias_erp (
  id bigint primary key,
  descricao text not null,
  categoria_pai_id bigint,
  nivel integer not null default 0 check (nivel >= 0),
  caminho text not null,
  filhas_count integer not null default 0 check (filhas_count >= 0),
  sincronizado_em timestamptz not null default now()
);

create index if not exists categorias_erp_categoria_pai_id_idx on categorias_erp(categoria_pai_id);
create index if not exists categorias_erp_nivel_idx on categorias_erp(nivel);
create index if not exists categorias_erp_descricao_idx on categorias_erp(descricao);

alter table categorias_erp enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'categorias_erp'
      AND policyname = 'leitura publica categorias_erp'
  ) THEN
    CREATE POLICY "leitura publica categorias_erp" ON categorias_erp FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'categorias_erp'
      AND policyname = 'escrita publica categorias_erp'
  ) THEN
    CREATE POLICY "escrita publica categorias_erp" ON categorias_erp FOR ALL USING (true);
  END IF;
END $$;
