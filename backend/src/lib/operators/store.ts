import { createClient } from '../supabase'
import type { Operador } from '../../types'

const OPERADORES_TABLE = 'operadores'

type SupabaseErrorLike = {
  code?: string
  message?: string
}

function normalizarErro(error: SupabaseErrorLike | null | undefined, fallback: string) {
  if (!error) {
    return new Error(fallback)
  }

  if (error.code === 'PGRST205' || error.message?.includes(`table 'public.${OPERADORES_TABLE}'`)) {
    return new Error('Tabela public.operadores nao encontrada no Supabase. Rode a migration mais recente antes de usar este cadastro.')
  }

  if (error.code === '23505') {
    return new Error('Ja existe um operador com esse nome')
  }

  return new Error(error.message || fallback)
}

function normalizarNome(nome: string) {
  const nomeNormalizado = nome.trim()
  if (!nomeNormalizado) {
    throw new Error('Nome do operador obrigatorio')
  }

  return nomeNormalizado
}

export async function listarOperadores(): Promise<Operador[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from(OPERADORES_TABLE)
    .select('*')
    .order('nome', { ascending: true })

  if (error) {
    throw normalizarErro(error, 'Erro ao listar operadores')
  }

  return (data ?? []) as Operador[]
}

export async function criarOperador(nome: string) {
  const supabase = createClient()
  const nomeNormalizado = normalizarNome(nome)

  const { data, error } = await supabase
    .from(OPERADORES_TABLE)
    .insert({ nome: nomeNormalizado, ativo: true })
    .select('*')
    .single()

  if (error) {
    throw normalizarErro(error, 'Erro ao criar operador')
  }

  return data as Operador
}

export async function atualizarOperador(id: string, updates: Partial<Pick<Operador, 'nome' | 'ativo'>>) {
  const supabase = createClient()
  const operadorId = id.trim()
  if (!operadorId) {
    throw new Error('id obrigatorio')
  }

  const payload: Record<string, unknown> = {}
  if (typeof updates.nome === 'string') {
    payload.nome = normalizarNome(updates.nome)
  }

  if (typeof updates.ativo === 'boolean') {
    payload.ativo = updates.ativo
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('Nenhum campo valido para atualizar')
  }

  const { data, error } = await supabase
    .from(OPERADORES_TABLE)
    .update(payload)
    .eq('id', operadorId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw normalizarErro(error, 'Erro ao atualizar operador')
  }

  if (!data) {
    throw new Error('Operador nao encontrado')
  }

  return data as Operador
}

export async function buscarOperadorPorId(id: string) {
  const operadorId = id.trim()
  if (!operadorId) {
    return null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from(OPERADORES_TABLE)
    .select('*')
    .eq('id', operadorId)
    .maybeSingle()

  if (error) {
    throw normalizarErro(error, 'Erro ao buscar operador')
  }

  return (data as Operador | null) ?? null
}

export async function removerOperador(id: string) {
  const operadorId = id.trim()
  if (!operadorId) {
    throw new Error('id obrigatorio')
  }

  const supabase = createClient()
  const { error } = await supabase
    .from(OPERADORES_TABLE)
    .delete()
    .eq('id', operadorId)

  if (error) {
    throw normalizarErro(error, 'Erro ao excluir operador')
  }
}
