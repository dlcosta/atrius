import { createClient } from '@/lib/supabase/server'
import { DemandaContainer } from '@/components/demanda/DemandaContainer'
import type { ItemDemanda, Tanque } from '@/types'

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

export default async function DemandaPage() {
  const [itens, tanques] = await Promise.all([buscarItens(), buscarTanques()])

  return <DemandaContainer itensIniciais={itens} tanques={tanques} />
}
