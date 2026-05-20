alter table public.ordens
  add column if not exists operador_nome text,
  add column if not exists pausado_em timestamptz,
  add column if not exists tempo_restante_pausado_seg integer;

alter table public.eventos_timer
  add column if not exists operador_nome text;

alter table public.ordens_tanque_novo_fluxo
  add column if not exists operador_nome text,
  add column if not exists inicio_operacao_em timestamptz,
  add column if not exists fim_operacao_em timestamptz,
  add column if not exists pausado_em timestamptz,
  add column if not exists tempo_restante_pausado_seg integer;

alter table public.ordens_envase_novo_fluxo
  add column if not exists operador_nome text,
  add column if not exists inicio_operacao_em timestamptz,
  add column if not exists fim_operacao_em timestamptz,
  add column if not exists pausado_em timestamptz,
  add column if not exists tempo_restante_pausado_seg integer;

create index if not exists ordens_planejamento_operacao_idx
  on public.ordens (planning_status, status, maquina_id, tank_id);

create index if not exists ordens_tanque_novo_fluxo_planejamento_operacao_idx
  on public.ordens_tanque_novo_fluxo (planning_status, status, tank_id);

create index if not exists ordens_envase_novo_fluxo_planejamento_operacao_idx
  on public.ordens_envase_novo_fluxo (planning_status, status, maquina_id);
