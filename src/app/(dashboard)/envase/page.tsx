import { createClient } from '@/lib/supabase/server'
import { EnvaseProducaoContainer } from '@/components/envase/EnvaseProducaoContainer'
import { buscarItensEnvase } from '@/lib/envase/itens'
import type { ItemDemandaEnvase, Maquina, Ordem } from '@/types'

async function buscarItens(): Promise<ItemDemandaEnvase[]> {
  const supabase = await createClient()
  try {
    return await buscarItensEnvase(supabase, false)
  } catch (error) {
    console.error('[envase] erro ao buscar itens:', error)
    return []
  }
}

async function buscarMaquinas(): Promise<Maquina[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquinas')
    .select('*')
    .eq('ativa', true)
    .order('nome', { ascending: true })
  if (error) return []
  return (data as Maquina[]) ?? []
}

async function buscarOrdens(): Promise<Ordem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ordens')
    .select('*')
    .eq('etapa', 'envase')
    .in('planning_status', ['SCHEDULED', 'IN_PRODUCTION', 'WAITING_TANK'])
  if (error) {
    console.error('[envase] erro ao buscar ordens:', error.message)
    return []
  }
  return (data as Ordem[]) ?? []
}

// Tanques de origem disponíveis para vínculo (produto já sendo fabricado ou concluído)
async function buscarOrdensTanque(): Promise<Ordem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ordens')
    .select('id, numero_externo, tanque, planning_status, quantidade, data_prevista')
    .eq('etapa', 'tanque')
    .in('planning_status', ['SCHEDULED', 'IN_PRODUCTION', 'COMPLETED'])
    .order('data_prevista', { ascending: true })
  if (error) return []
  return (data as Ordem[]) ?? []
}

export default async function EnvasePage() {
  const [itens, maquinas, ordens, ordensTanque] = await Promise.all([
    buscarItens(),
    buscarMaquinas(),
    buscarOrdens(),
    buscarOrdensTanque(),
  ])

  return (
    <EnvaseProducaoContainer
      itensIniciais={itens}
      ordensIniciais={ordens}
      maquinas={maquinas}
      ordensTanqueIniciais={ordensTanque}
    />
  )
}
