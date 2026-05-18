import { createClient } from '@/lib/supabase/server'
import { DemandaProducaoContainer } from '@/components/demanda/DemandaProducaoContainer'
import { buscarItensDemanda } from '@/lib/demanda/itens'
import type { ItemDemanda, Ordem, Tanque, Turno } from '@/types'

async function buscarItens(): Promise<ItemDemanda[]> {
  const supabase = await createClient()
  try {
    return await buscarItensDemanda(supabase, false)
  } catch (error) {
    console.error('[demanda] erro ao buscar itens:', error)
    return []
  }
}

async function buscarTanques(): Promise<Tanque[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tanques')
    .select('*')
    .eq('ativo', true)
    .order('nome', { ascending: true })
  if (error) return []
  return (data as Tanque[]) ?? []
}

async function buscarTurnos(): Promise<Turno[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('ativo', true)
    .order('hora_inicio', { ascending: true })
  if (error) return []
  return (data as Turno[]) ?? []
}

async function buscarOrdens(): Promise<Ordem[]> {
  const supabase = await createClient()
  // Only fetch SCHEDULED and IN_PRODUCTION orders that have agendamentos
  // BACKLOG orders don't affect tank availability yet since they're not scheduled
  const { data, error } = await supabase
    .from('ordens')
    .select(`
      *,
      agendamentos_producao!inner (
        id,
        tank_id,
        data_agendamento,
        turno_id
      )
    `)
    .eq('etapa', 'tanque')
    .in('planning_status', ['SCHEDULED', 'IN_PRODUCTION'])
  if (error) {
    console.error('[demanda] erro ao buscar ordens:', error.message)
    return []
  }

  // Flatten agendamentos data into orden
  const ordensComAgendamento = (data as any[])?.map(ordem => {
    const agendamento = ordem.agendamentos_producao?.[0]
    // Convert date to YYYY-MM-DD format
    const dataAgendamento = agendamento?.data_agendamento
      ? (typeof agendamento.data_agendamento === 'string'
          ? agendamento.data_agendamento
          : new Date(agendamento.data_agendamento).toISOString().split('T')[0])
      : ordem.data_prevista

    return {
      ...ordem,
      tank_id: agendamento?.tank_id,
      turno_id: agendamento?.turno_id,
      data_prevista: dataAgendamento,
      planning_status: ordem.planning_status,
    }
  }) ?? []

  return ordensComAgendamento as Ordem[]
}

export default async function DemandaPage() {
  const [itens, tanques, turnos, ordens] = await Promise.all([
    buscarItens(),
    buscarTanques(),
    buscarTurnos(),
    buscarOrdens(),
  ])

  return (
    <DemandaProducaoContainer
      itensIniciais={itens}
      ordensIniciais={ordens}
      tanques={tanques}
      turnosIniciais={turnos}
    />
  )
}
