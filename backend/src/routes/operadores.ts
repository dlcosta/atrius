import { Router, Request, Response } from 'express'
import {
  atualizarOperador,
  criarOperador,
  listarOperadores,
  removerOperador,
} from '../lib/operators/store'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  try {
    const ativosOnly = ['1', 'true', 'yes'].includes(String(req.query.ativos ?? '').toLowerCase())
    const operadores = await listarOperadores()
    return res.json(ativosOnly ? operadores.filter((operador) => operador.ativo) : operadores)
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao listar operadores',
    })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { nome } = req.body as { nome?: string }
    const operador = await criarOperador(nome ?? '')
    return res.status(201).json(operador)
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao criar operador',
    })
  }
})

router.patch('/', async (req: Request, res: Response) => {
  try {
    const { id, nome, ativo } = req.body as { id?: string; nome?: string; ativo?: boolean }
    if (!id?.trim()) {
      return res.status(422).json({ error: 'id obrigatório' })
    }
    const operador = await atualizarOperador(id, { nome, ativo })
    return res.json(operador)
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao atualizar operador',
    })
  }
})

router.delete('/', async (req: Request, res: Response) => {
  try {
    const { id } = req.body as { id?: string }
    if (!id?.trim()) {
      return res.status(422).json({ error: 'id obrigatório' })
    }
    await removerOperador(id)
    return res.json({ ok: true })
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao excluir operador',
    })
  }
})

export default router
