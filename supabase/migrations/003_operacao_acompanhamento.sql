-- Migracao 003: acompanhamento operacional por ordem
-- Acrescenta timestamps de inicio/fim real da operacao.

alter table ordens add column if not exists inicio_operacao_em timestamptz;
alter table ordens add column if not exists fim_operacao_em timestamptz;

create index if not exists ordens_status_maquina_idx on ordens (maquina_id, status);
create index if not exists ordens_inicio_operacao_idx on ordens (inicio_operacao_em);
