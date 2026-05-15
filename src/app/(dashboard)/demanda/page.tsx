import { createClient } from '@/lib/supabase/server'
import { DemandaProducaoContainer } from '@/components/demanda/DemandaProducaoContainer'
import type { ItemDemanda, Ordem, Tanque } from '@/types'

async function buscarItens(): Promise<ItemDemanda[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('demanda_itens_pendentes', {
    p_mostrar_alocados: false,
  })
  if (error) {
    console.error('[demanda] erro ao buscar itens:', error.message)
    return []
  }
  return (data as ItemDemanda[]) ?? []
}

async function buscarTanques(): Promise<Tanque[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tanques')
    .select('*')
    .eq('ativo', true)
    .order('volume_liters', { ascending: true })
  if (error) return []
  return (data as Tanque[]) ?? []
}

async function buscarOrdens(): Promise<Ordem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ordens')
    .select('*')
    .eq('etapa', 'tanque')
    .in('planning_status', ['BACKLOG', 'SCHEDULED', 'IN_PRODUCTION'])
  if (error) {
    console.error('[demanda] erro ao buscar ordens:', error.message)
    return []
  }
  return (data as Ordem[]) ?? []
}

export default async function DemandaPage() {
  const [itens, tanques, ordens] = await Promise.all([
    buscarItens(),
    buscarTanques(),
    buscarOrdens(),
  ])

  return (
    <DemandaProducaoContainer
      itensIniciais={itens}
      ordensIniciais={ordens}
      tanques={tanques}
    />
  )
}
