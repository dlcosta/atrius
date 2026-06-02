import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'

const router = Router()

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

router.get('/eventos', async (req: Request, res: Response) => {
  const supabase = createClient()
  const inicio = req.query.inicio as string | undefined
  const fim = req.query.fim as string | undefined

  if (!inicio || !fim) {
    return res.status(422).json({ error: 'início e fim são obrigatórios' })
  }

  if (!DATE_REGEX.test(inicio) || !DATE_REGEX.test(fim)) {
    return res.status(422).json({ error: 'início ou fim inválido' })
  }

  if (inicio > fim) {
    return res.status(422).json({ error: 'início deve ser menor ou igual ao fim' })
  }

  const inicioIso = `${inicio}T00:00:00.000Z`
  const fimIso = `${fim}T23:59:59.999Z`

  const withOperator = await supabase
    .from('eventos_timer')
    .select('id, ordem_id, maquina_id, tipo, timestamp, operador_nome')
    .gte('timestamp', inicioIso)
    .lte('timestamp', fimIso)
    .order('timestamp', { ascending: true })

  if (!withOperator.error) {
    return res.json(withOperator.data ?? [])
  }

  if (!withOperator.error.message.includes('operador_nome')) {
    return res.status(500).json({ error: withOperator.error.message })
  }

  const fallback = await supabase
    .from('eventos_timer')
    .select('id, ordem_id, maquina_id, tipo, timestamp')
    .gte('timestamp', inicioIso)
    .lte('timestamp', fimIso)
    .order('timestamp', { ascending: true })

  if (fallback.error) {
    return res.status(500).json({ error: fallback.error.message })
  }

  const normalized = (fallback.data ?? []).map((evento) => ({
    ...evento,
    operador_nome: null,
  }))

  return res.json(normalized)
})

export default router
