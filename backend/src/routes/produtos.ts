import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'

const router = Router()

function mensagemErroProduto(errorMessage: string): string {
  const lower = errorMessage.toLowerCase()
  if (lower.includes('tempos_maquinas') || lower.includes('volume_base') || lower.includes('schema cache')) {
    return 'Schema do banco desatualizado para produtos. Rode a migration 002_dashboard_producao.sql no Supabase.'
  }
  return errorMessage
}

router.get('/', async (_req: Request, res: Response) => {
  const supabase = createClient()
  const { data, error } = await supabase.from('produtos').select('*').order('nome')
  if (error) return res.status(500).json({ error: mensagemErroProduto(error.message) })
  return res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body

  const { data, error } = await supabase
    .from('produtos')
    .insert({
      sku: body.sku,
      nome: body.nome,
      volume_base: Number(body.volume_base ?? 3800),
      tempos_maquinas: body.tempos_maquinas ?? {},
      tempo_limpeza_min: 0,
      cor: body.cor ?? '#5B9BD5',
      package_volume_liters: body.package_volume_liters != null ? Number(body.package_volume_liters) : null,
      units_per_box: Number(body.units_per_box ?? 1),
    })
    .select('*')
    .single()

  if (error) return res.status(400).json({ error: mensagemErroProduto(error.message) })
  return res.status(201).json(data)
})

router.patch('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id, nome, volume_base, tempos_maquinas, tempo_limpeza_min, cor, package_volume_liters, units_per_box } = req.body

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) updates.nome = nome
  if (volume_base !== undefined) updates.volume_base = Number(volume_base)
  if (tempos_maquinas !== undefined) updates.tempos_maquinas = tempos_maquinas
  if (tempo_limpeza_min !== undefined) updates.tempo_limpeza_min = Number(tempo_limpeza_min)
  if (cor !== undefined) updates.cor = cor
  if (package_volume_liters !== undefined) updates.package_volume_liters = package_volume_liters != null ? Number(package_volume_liters) : null
  if (units_per_box !== undefined) updates.units_per_box = Number(units_per_box)

  try {
    const { data, error } = await supabase
      .from('produtos')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return res.status(400).json({ error: mensagemErroProduto(error.message) })
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

router.delete('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id } = req.body
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) return res.status(400).json({ error: mensagemErroProduto(error.message) })
  return res.json({ ok: true })
})

export default router
