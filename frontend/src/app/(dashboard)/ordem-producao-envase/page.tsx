import { OrdemProducaoEnvasePage } from '@/components/envase/OrdemProducaoEnvasePage'
import { createClient } from '@/lib/supabase/server'
import type { Maquina, Produto } from '@/types'

async function buscarProdutos(): Promise<Produto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('produtos').select('*').order('nome')

  if (error) {
    console.error('[ordem-producao-envase] erro ao buscar produtos:', error.message)
    return []
  }

  return (data as Produto[]) ?? []
}

async function buscarMaquinas(): Promise<Maquina[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquinas')
    .select('*')
    .eq('ativa', true)
    .order('nome', { ascending: true })

  if (error) {
    console.error('[ordem-producao-envase] erro ao buscar maquinas:', error.message)
    return []
  }

  return (data as Maquina[]) ?? []
}

export default async function OrdemProducaoEnvaseRoutePage() {
  const [produtos, maquinas] = await Promise.all([buscarProdutos(), buscarMaquinas()])
  return <OrdemProducaoEnvasePage produtos={produtos} maquinas={maquinas} />
}
