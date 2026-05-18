-- Tabela de audit log para ordens de produção
-- Registra automaticamente toda movimentação operacional de cada ordem

CREATE TABLE IF NOT EXISTS ordens_audit_log (
  id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_id       uuid         NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
  agendamento_id uuid         REFERENCES agendamentos_producao(id) ON DELETE SET NULL,
  operacao       text         NOT NULL CHECK (operacao IN (
    'CRIADO', 'AGENDADO', 'REAGENDADO', 'CANCELADO',
    'STATUS_ALTERADO', 'EDITADO', 'INICIADO', 'PAUSADO',
    'RETOMADO', 'CONCLUIDO'
  )),
  descricao      text         NOT NULL,
  dados_antes    jsonb,
  dados_depois   jsonb,
  responsavel    text,
  motivo         text,
  criado_em      timestamptz  DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ordens_audit_log_ordem_id_idx  ON ordens_audit_log(ordem_id);
CREATE INDEX IF NOT EXISTS ordens_audit_log_criado_em_idx ON ordens_audit_log(criado_em DESC);
CREATE INDEX IF NOT EXISTS ordens_audit_log_operacao_idx  ON ordens_audit_log(operacao);

ALTER TABLE ordens_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ordens_audit_log" ON ordens_audit_log FOR ALL USING (true) WITH CHECK (true);
