import { OrdemProducaoTanquePage } from '@/components/tanques/OrdemProducaoTanquePage'
import { createClient } from '@/lib/supabase/server'
import type { ProdutoTanque } from '@/types'

async function buscarProdutosTanque(): Promise<ProdutoTanque[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('produtos_tanque').select('*').order('nome')

  if (error) {
    console.error('[ordem-producao-tanques] erro ao buscar produtos_tanque:', error.message)
    return []
  }

  return (data as ProdutoTanque[]) ?? []
}

export default async function OrdemProducaoTanquesPage() {
  const produtosTanque = await buscarProdutosTanque()

  return <OrdemProducaoTanquePage produtosTanque={produtosTanque} />
}
