import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '@/app'
import { __setSupabaseFactoryForTests, __resetSupabaseFactory } from '@/lib/supabase'
import { createFakeSupabase } from '../helpers/fake-supabase'

let app: Express
let fake: any

beforeEach(() => {
  fake = createFakeSupabase({
    // Tanque criado pelo NOVO FLUXO (bug: nao aparecia como origem de envase)
    ordens_tanque_novo_fluxo: [
      {
        id: 'nt-1', numero_externo: 'TQNOVO-1', produto_sku: 'TQ-1', lote: 'L1',
        quantidade: 3000, data_prevista: '2026-06-02', planning_status: 'SCHEDULED', status: 'aguardando',
      },
    ],
    // Envase do novo fluxo consumindo 1000L do tanque novo
    ordens_envase_novo_fluxo: [
      { id: 'ne-1', origin_tank_order_id: 'nt-1', quantidade: 1000, planning_status: 'SCHEDULED', status: 'aguardando' },
    ],
    // Envase LEGADO consumindo mais 500L do mesmo tanque (saldo deve descontar ambas as fontes)
    ordens: [
      { id: 'le-1', etapa: 'envase', origin_tank_order_id: 'nt-1', quantidade: 500, planning_status: 'SCHEDULED', status: 'aguardando' },
    ],
  })
  __setSupabaseFactoryForTests(() => fake)
  app = createApp()
})

afterEach(() => {
  __resetSupabaseFactory()
})

describe('GET /api/ordens/tanques-origem', () => {
  it('inclui tanque do novo fluxo e desconta envases legado + novo fluxo do saldo', async () => {
    const res = await request(app).get('/api/ordens/tanques-origem')

    expect(res.status).toBe(200)
    const tanque = res.body.find((t: any) => t.id === 'nt-1')
    expect(tanque).toBeTruthy()
    expect(tanque.flow_source).toBe('novo_fluxo_tanque')
    expect(tanque.litros_tanque).toBe(3000)
    expect(tanque.litros_envasados).toBe(1500) // 1000 (novo) + 500 (legado)
    expect(tanque.saldo_litros).toBe(1500)
  })

  it('omite tanque sem saldo restante', async () => {
    // Consome todo o saldo restante (mais 1500) → saldo 0, deve sair da lista
    fake.__tables.ordens_envase_novo_fluxo.push({
      id: 'ne-2', origin_tank_order_id: 'nt-1', quantidade: 1500, planning_status: 'SCHEDULED', status: 'aguardando',
    })
    const res = await request(app).get('/api/ordens/tanques-origem')
    expect(res.status).toBe(200)
    expect(res.body.find((t: any) => t.id === 'nt-1')).toBeUndefined()
  })
})
