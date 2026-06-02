-- Migracao: garante as colunas operacionais em public.ordens
--
-- O banco remoto estava defasado: as migrations de acompanhamento operacional
-- (003_operacao_acompanhamento e 20260519221500_operacao_status_operador_novo_fluxo)
-- e a coluna `notes` nao haviam sido aplicadas na tabela legada `ordens`. Isso fazia
-- a rota POST /api/ordens/operacao (Iniciar/Pausar/Retomar/Finalizar) falhar com:
--   "Could not find the '<coluna>' column of 'ordens' in the schema cache"
--
-- Todas as instrucoes sao idempotentes (add column if not exists), entao e seguro
-- rodar mesmo que algumas colunas ja existam.

alter table public.ordens
  add column if not exists notes text,
  add column if not exists operador_nome text,
  add column if not exists inicio_operacao_em timestamptz,
  add column if not exists fim_operacao_em timestamptz,
  add column if not exists pausado_em timestamptz,
  add column if not exists tempo_restante_pausado_seg integer;

-- Recarrega o schema cache do PostgREST para refletir as novas colunas
notify pgrst, 'reload schema';
