import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const supabase = createClient()
  const { data, error } = await supabase.from('produtos_tanque').select('*').order('nome')
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body

  const { data, error } = await supabase
    .from('produtos_tanque')
    .insert({
      sku: body.sku,
      nome: body.nome,
      cor: body.cor ?? '#5B9BD5',
      volume_base: Number(body.volume_base ?? 3800),
      tempo_limpeza_min: Number(body.tempo_limpeza_min ?? 0),
    })
    .select('*')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

router.patch('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id, nome, cor, volume_base, tempo_limpeza_min } = req.body

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) updates.nome = nome
  if (cor !== undefined) updates.cor = cor
  if (volume_base !== undefined) updates.volume_base = Number(volume_base)
  if (tempo_limpeza_min !== undefined) updates.tempo_limpeza_min = Number(tempo_limpeza_min)

  try {
    const { data, error } = await supabase
      .from('produtos_tanque')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

router.delete('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id } = req.body
  const { error } = await supabase.from('produtos_tanque').delete().eq('id', id)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
})

export default router
