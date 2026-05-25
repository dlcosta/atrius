import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const ativosOnly = ['1', 'true', 'yes'].includes(
    String(req.query.ativos ?? '').toLowerCase()
  )

  let query = supabase.from('tanques').select('*').order('nome')
  if (ativosOnly) query = query.eq('ativo', true)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { nome, volume_liters } = req.body

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return res.status(422).json({ error: 'Nome é obrigatório' })
  }
  if (!volume_liters || typeof volume_liters !== 'number' || volume_liters <= 0) {
    return res.status(422).json({ error: 'Capacidade deve ser maior que zero' })
  }

  const id = crypto.randomUUID()
  const { data, error } = await supabase
    .from('tanques')
    .insert({ id, nome: nome.trim(), volume_liters })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

router.patch('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id, nome, volume_liters, ativo } = req.body

  if (!id) return res.status(422).json({ error: 'ID é obrigatório' })

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim()) {
      return res.status(422).json({ error: 'Nome inválido' })
    }
    updates.nome = nome.trim()
  }
  if (volume_liters !== undefined) {
    if (typeof volume_liters !== 'number' || volume_liters <= 0) {
      return res.status(422).json({ error: 'Capacidade deve ser maior que zero' })
    }
    updates.volume_liters = volume_liters
  }
  if (ativo !== undefined) updates.ativo = ativo

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({ error: 'Nenhum campo para atualizar' })
  }

  const { data, error } = await supabase
    .from('tanques')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

router.delete('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id } = req.body

  if (!id) return res.status(422).json({ error: 'ID é obrigatório' })

  const { error } = await supabase.from('tanques').delete().eq('id', id)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
})

export default router
