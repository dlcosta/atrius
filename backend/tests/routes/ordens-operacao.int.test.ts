import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '@/app'
import { __setSupabaseFactoryForTests, __resetSupabaseFactory } from '@/lib/supabase'
import { createFakeSupabase } from '../helpers/fake-supabase'

// Ordem de tanque LEGADA agendada para o futuro (02/06 07:45), iniciada "agora" (antes do horario).
function tabelasBase() {
  return {
    ordens: [
      {
        id: 'ord-1',
        numero_externo: 'MAN-1',
        etapa: 'tanque',
        tank_id: 'tank-1',
        maquina_id: null,
        produto_sku: 'TQ-1',
        quantidade: 3000,
        unidade: 'L',
        status: 'aguardando',
        planning_status: 'SCHEDULED',
        data_prevista: '2026-06-02',
        inicio_agendado: '2026-06-02T07:45:00.000Z',
        fim_calculado: '2026-06-02T09:05:00.000Z',
        total_duration_minutes: 80,
        notes: null,
      },
    ],
    produtos: [{ sku: 'TQ-1', volume_base: 3000, tempos_maquinas: {} }],
    ordens_tanque_novo_fluxo: [],
    ordens_envase_novo_fluxo: [],
    eventos_timer: [],
  }
}

let app: Express
let fake: any

beforeEach(() => {
  fake = createFakeSupabase(tabelasBase())
  __setSupabaseFactoryForTests(() => fake)
  app = createApp()
})

afterEach(() => {
  __resetSupabaseFactory()
})

describe('POST /api/ordens/operacao — iniciar antes do horario agendado', () => {
  it('inicia sem erro de constraint e NAO altera as colunas de agendamento', async () => {
    const res = await request(app)
      .post('/api/ordens/operacao')
      .send({ ordem_id: 'ord-1', acao: 'iniciar', operador_nome: 'Bento', flow_source: 'legado' })

    expect(res.status).toBe(200)

    const ordem = fake.__tables.ordens[0]
    // Janela planejada permanece intocada (preserva "Inicio previsto" e a posicao no calendario)
    expect(ordem.inicio_agendado).toBe('2026-06-02T07:45:00.000Z')
    expect(ordem.fim_calculado).toBe('2026-06-02T09:05:00.000Z')
    // Estado operacional gravado
    expect(ordem.status).toBe('produzindo')
    expect(ordem.planning_status).toBe('IN_PRODUCTION')
    expect(ordem.inicio_operacao_em).toBeTruthy()
    // fim_estimado vive no JSON notes, nao nas colunas de agendamento
    const operacao = JSON.parse(ordem.notes).operacao
    expect(operacao.fim_estimado).toBeTruthy()
    // registrou evento de inicio
    expect(fake.__tables.eventos_timer.length).toBe(1)
    expect(fake.__tables.eventos_timer[0].tipo).toBe('inicio')
  })

  it('apos iniciar, pausar congela com tempo_restante e mantem fim_calculado planejado', async () => {
    await request(app).post('/api/ordens/operacao')
      .send({ ordem_id: 'ord-1', acao: 'iniciar', operador_nome: 'Bento', flow_source: 'legado' })

    const res = await request(app).post('/api/ordens/operacao')
      .send({ ordem_id: 'ord-1', acao: 'pausar', operador_nome: 'Bento', observacao_pausa: 'troca', flow_source: 'legado' })

    expect(res.status).toBe(200)
    const ordem = fake.__tables.ordens[0]
    expect(ordem.status).toBe('pausada')
    expect(ordem.tempo_restante_pausado_seg).toBeGreaterThan(0)
    expect(ordem.fim_calculado).toBe('2026-06-02T09:05:00.000Z')
  })

  it('retorna 404 quando a ordem nao existe em nenhuma tabela', async () => {
    const res = await request(app)
      .post('/api/ordens/operacao')
      .send({ ordem_id: 'inexistente', acao: 'iniciar', operador_nome: 'Bento' })

    expect(res.status).toBe(404)
  })
})
