import { OrdemProducaoTanquePage } from '@/components/tanques/OrdemProducaoTanquePage'
import { createClient } from '@/lib/supabase/server'
import type { Produto } from '@/types'

async function buscarProdutos(): Promise<Produto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('produtos').select('*').order('nome')

  if (error) {
    console.error('[ordem-producao-tanques] erro ao buscar produtos:', error.message)
    return []
  }

  return (data as Produto[]) ?? []
}

export default async function OrdemProducaoTanquesPage() {
  const produtos = await buscarProdutos()

  return <OrdemProducaoTanquePage produtos={produtos} />
}
