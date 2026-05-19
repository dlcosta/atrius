import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  const statusParam = searchParams.get('status')
  const search = searchParams.get('search')?.toLowerCase()
  const dataInicio = searchParams.get('data_inicio')
  const dataFim = searchParams.get('data_fim')
  const etapaParam = searchParams.get('etapa') ?? 'tanque'

  // Buscar ordens com joins
  let query = supabase
    .from('ordens')
    .select(`
      *,
      agendamentos_producao (
        id,
        tank_id,
        turno_id,
        turno_nome,
        data_agendamento,
        status,
        data_inicio,
        data_pausa,
        observacao_pausa,
        data_retomada,
        data_conclusao,
        observacao_final,
        criado_em,
        atualizado_em
      ),
      ordens_pedidos_erp (
        id,
        numero_pedido,
        produto_descricao,
        quantidade,
        total_litros,
        criado_em
      )
    `)
    .eq('etapa', etapaParam)
    .order('sincronizado_em', { ascending: false })

  // Filtro por status
  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim())
    query = query.in('planning_status', statuses)
  }

  // Filtro por data de agendamento (usando data_prevista como proxy)
  if (dataInicio) {
    query = query.gte('data_prevista', dataInicio)
  }
  if (dataFim) {
    query = query.lte('data_prevista', dataFim)
  }

  const { data, error } = await query

  if (error) {
    console.error('[historico/producoes] erro:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer com contagem de audit logs e nomes de tanques
  const ordens = data ?? []
  const ordemIds = ordens.map((o: any) => o.id)

  // Buscar contagem de audit logs por ordem
  const { data: auditCounts } = await supabase
    .from('ordens_audit_log')
    .select('ordem_id')
    .in('ordem_id', ordemIds.length > 0 ? ordemIds : ['00000000-0000-0000-0000-000000000000'])

  const countMap: Record<string, number> = {}
  for (const row of auditCounts ?? []) {
    countMap[row.ordem_id] = (countMap[row.ordem_id] ?? 0) + 1
  }

  // Buscar nomes dos tanques
  const { data: tanques } = await supabase.from('tanques').select('id, nome')
  const tanqueMap: Record<string, string> = {}
  for (const t of tanques ?? []) {
    tanqueMap[t.id] = t.nome
  }

  // Montar resposta enriquecida
  let resultado = ordens.map((o: any) => {
    const agendamentos = (o.agendamentos_producao ?? []).map((ag: any) => ({
      ...ag,
      tank_nome: tanqueMap[ag.tank_id] ?? ag.tank_id,
    }))
    return {
      ...o,
      agendamentos,
      pedidos_vinculados: o.ordens_pedidos_erp ?? [],
      audit_count: countMap[o.id] ?? 0,
      // Limpar joins do retorno base
      agendamentos_producao: undefined,
      ordens_pedidos_erp: undefined,
    }
  })

  // Filtro de texto (após fetch — busca em numero_externo, tanque, pedidos)
  if (search) {
    resultado = resultado.filter((o: any) => {
      const nomeLower = (o.numero_externo ?? '').toLowerCase()
      const categLower = (o.tanque ?? '').toLowerCase()
      const pedidosMatch = (o.pedidos_vinculados ?? []).some(
        (p: any) =>
          (p.numero_pedido ?? '').toLowerCase().includes(search) ||
          (p.produto_descricao ?? '').toLowerCase().includes(search)
      )
      return nomeLower.includes(search) || categLower.includes(search) || pedidosMatch
    })
  }

  return NextResponse.json(resultado)
}
