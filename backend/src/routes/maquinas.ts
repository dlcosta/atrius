import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const supabase = createClient()
  const { data, error } = await supabase.from('maquinas').select('*').order('nome')
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { nome } = req.body

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return res.status(422).json({ error: 'Nome é obrigatório' })
  }

  const { data, error } = await supabase
    .from('maquinas')
    .insert({ nome: nome.trim() })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

router.patch('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id, nome, ativa } = req.body

  if (!id) return res.status(422).json({ error: 'ID é obrigatório' })

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim()) {
      return res.status(422).json({ error: 'Nome inválido' })
    }
    updates.nome = nome.trim()
  }
  if (ativa !== undefined) updates.ativa = ativa

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({ error: 'Nenhum campo para atualizar' })
  }

  const { data, error } = await supabase
    .from('maquinas')
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

  const { error } = await supabase.from('maquinas').delete().eq('id', id)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
})

export default router
