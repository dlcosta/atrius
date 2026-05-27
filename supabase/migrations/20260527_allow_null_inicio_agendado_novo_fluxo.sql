-- Allow null inicio_agendado and fim_calculado in new flow tables
-- Needed to support "unscheduling" orders (returning them to backlog)
ALTER TABLE ordens_tanque_novo_fluxo ALTER COLUMN inicio_agendado DROP NOT NULL;
ALTER TABLE ordens_tanque_novo_fluxo ALTER COLUMN fim_calculado DROP NOT NULL;
ALTER TABLE ordens_envase_novo_fluxo ALTER COLUMN inicio_agendado DROP NOT NULL;
ALTER TABLE ordens_envase_novo_fluxo ALTER COLUMN fim_calculado DROP NOT NULL;
