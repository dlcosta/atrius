-- Adiciona WAITING_TANK e READY_TO_SCHEDULE ao planning_status das ordens
-- para suportar o fluxo de planejamento de envase dependente do tanque.

-- Remove o constraint atual e recria com os novos valores
alter table public.ordens drop constraint if exists ordens_planning_status_check;

alter table public.ordens
  add constraint ordens_planning_status_check
  check (planning_status in (
    'BACKLOG',
    'WAITING_TANK',
    'READY_TO_SCHEDULE',
    'SCHEDULED',
    'IN_PRODUCTION',
    'COMPLETED',
    'CANCELED'
  ));
