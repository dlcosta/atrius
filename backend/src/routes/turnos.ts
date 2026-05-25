import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('ativo', true)
    .order('hora_inicio')

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { nome, hora_inicio, hora_fim } = req.body

  if (!nome || typeof nome !== 'string' || !nome.trim())
    return res.status(422).json({ error: 'Nome é obrigatório' })
  if (hora_inicio === undefined || hora_inicio === null || typeof hora_inicio !== 'number' || hora_inicio < 0 || hora_inicio > 1439)
    return res.status(422).json({ error: 'Hora de início inválida' })
  if (hora_fim === undefined || hora_fim === null || typeof hora_fim !== 'number' || hora_fim < 0 || hora_fim > 1439)
    return res.status(422).json({ error: 'Hora de fim inválida' })

  const { data, error } = await supabase
    .from('turnos')
    .insert({ nome: nome.trim(), hora_inicio, hora_fim })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

router.patch('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id, nome, hora_inicio, hora_fim, ativo } = req.body

  if (!id) return res.status(422).json({ error: 'ID é obrigatório' })

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim())
      return res.status(422).json({ error: 'Nome inválido' })
    updates.nome = nome.trim()
  }
  if (hora_inicio !== undefined) {
    if (typeof hora_inicio !== 'number' || hora_inicio < 0 || hora_inicio > 1439)
      return res.status(422).json({ error: 'Hora de início inválida' })
    updates.hora_inicio = hora_inicio
  }
  if (hora_fim !== undefined) {
    if (typeof hora_fim !== 'number' || hora_fim < 0 || hora_fim > 1439)
      return res.status(422).json({ error: 'Hora de fim inválida' })
    updates.hora_fim = hora_fim
  }
  if (ativo !== undefined) updates.ativo = ativo

  if (Object.keys(updates).length === 0)
    return res.status(422).json({ error: 'Nenhum campo para atualizar' })

  const { data, error } = await supabase
    .from('turnos')
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

  const { error } = await supabase.from('turnos').update({ ativo: false }).eq('id', id)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
})

export default router
