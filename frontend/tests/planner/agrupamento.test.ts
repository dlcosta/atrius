import { describe, expect, it } from 'vitest'
import {
  montarGrupos,
  formatarRestante,
  calcularProgresso,
  segParaRelogio,
} from '@/lib/planner/agrupamento'
import type { Maquina, Ordem, Tanque } from '@/types'

function ordem(partial: Partial<Ordem>): Ordem {
  return {
    id: partial.id ?? '1',
    numero_externo: partial.numero_externo ?? 'MAN-1',
    produto_sku: partial.produto_sku ?? 'SKU-1',
    maquina_id: partial.maquina_id ?? null,
    quantidade: partial.quantidade ?? 3000,
    unidade: partial.unidade ?? 'L',
    tanque: partial.tanque ?? null,
    lote: partial.lote ?? null,
    etapa: partial.etapa ?? 'tanque',
    data_prevista: partial.data_prevista ?? '2026-06-02',
    // honra null explicito (nao usa ?? para nao reverter ao default)
    inicio_agendado: 'inicio_agendado' in partial ? partial.inicio_agendado : '2026-06-02T07:45:00.000Z',
    fim_calculado: partial.fim_calculado ?? '2026-06-02T09:05:00.000Z',
    fim_estimado: partial.fim_estimado,
    inicio_operacao_em: partial.inicio_operacao_em,
    tempo_restante_pausado_seg: partial.tempo_restante_pausado_seg,
    status: partial.status ?? 'aguardando',
    sincronizado_em: partial.sincronizado_em ?? '2026-06-01T00:00:00.000Z',
    tank_id: partial.tank_id ?? null,
  } as Ordem
}

const tanque1: Tanque = { id: 'tank-1', nome: 'Tanque 1', volume_liters: 3000, ativo: true } as Tanque
const tanque2: Tanque = { id: 'tank-2', nome: 'Tanque 2', volume_liters: 10000, ativo: true } as Tanque

describe('montarGrupos — regressao "ordem em dois tanques"', () => {
  it('coloca a ordem apenas no tanque do tank_id, ignorando label tanque desatualizado', () => {
    // tank_id aponta para Tanque 1, mas o label `tanque` ainda diz "Tanque 2" (movida no calendario)
    const o = ordem({ id: 'A', tank_id: 'tank-1', tanque: 'Tanque 2' })
    const grupos = montarGrupos([], [tanque1, tanque2], [o])

    const g1 = grupos.find((g) => g.id === 'tank-1')!
    const g2 = grupos.find((g) => g.id === 'tank-2')!
    expect(g1.ordens.map((x) => x.id)).toEqual(['A'])
    expect(g2.ordens).toHaveLength(0)
  })

  it('usa o label tanque como fallback somente quando tank_id e nulo', () => {
    const o = ordem({ id: 'B', tank_id: null, tanque: 'Tanque 2' })
    const grupos = montarGrupos([], [tanque1, tanque2], [o])
    expect(grupos.find((g) => g.id === 'tank-2')!.ordens.map((x) => x.id)).toEqual(['B'])
    expect(grupos.find((g) => g.id === 'tank-1')!.ordens).toHaveLength(0)
  })

  it('agrupa ordens de maquina por maquina_id e ignora sem inicio_agendado', () => {
    const maq: Maquina = { id: 'maq-1', nome: 'MAQ 1', ativa: true } as Maquina
    const agendada = ordem({ id: 'C', etapa: 'envase', maquina_id: 'maq-1' })
    const semAgenda = ordem({ id: 'D', etapa: 'envase', maquina_id: 'maq-1', inicio_agendado: null })
    const grupos = montarGrupos([maq], [], [agendada, semAgenda])
    expect(grupos.find((g) => g.id === 'maq-1')!.ordens.map((x) => x.id)).toEqual(['C'])
  })
})

describe('timer ao vivo usa fim_estimado', () => {
  it('formatarRestante conta a partir de fim_estimado (nao fim_calculado)', () => {
    const agoraMs = Date.parse('2026-06-01T19:34:00.000Z')
    const o = ordem({
      status: 'produzindo',
      fim_estimado: '2026-06-01T20:54:00.000Z', // +80min
      fim_calculado: '2026-06-02T09:05:00.000Z', // planejado, ignorado
    })
    expect(formatarRestante(o, agoraMs)).toBe('01:20:00')
  })

  it('formatarRestante usa tempo_restante_pausado_seg quando pausada', () => {
    const o = ordem({ status: 'pausada', tempo_restante_pausado_seg: 125 })
    expect(formatarRestante(o, Date.now())).toBe('00:02:05')
  })

  it('calcularProgresso usa inicio_operacao_em e fim_estimado', () => {
    const o = ordem({
      inicio_operacao_em: '2026-06-01T19:00:00.000Z',
      fim_estimado: '2026-06-01T20:00:00.000Z',
    })
    const meio = Date.parse('2026-06-01T19:30:00.000Z')
    expect(calcularProgresso(o, meio)).toBe(50)
  })

  it('segParaRelogio formata HH:MM:SS', () => {
    expect(segParaRelogio(3661)).toBe('01:01:01')
  })
})
