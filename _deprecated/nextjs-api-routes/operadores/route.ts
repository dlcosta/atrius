import { NextRequest, NextResponse } from 'next/server'
import {
  atualizarOperador,
  criarOperador,
  listarOperadores,
  removerOperador,
} from '@/lib/operators/store'

export async function GET(req: NextRequest) {
  try {
    const ativosOnly = ['1', 'true', 'yes'].includes(
      new URL(req.url).searchParams.get('ativos')?.toLowerCase() ?? ''
    )
    const operadores = await listarOperadores()
    return NextResponse.json(ativosOnly ? operadores.filter((operador) => operador.ativo) : operadores)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao listar operadores' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome } = (await req.json()) as { nome?: string }
    const operador = await criarOperador(nome ?? '')
    return NextResponse.json(operador, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar operador' },
      { status: 400 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, nome, ativo } = (await req.json()) as { id?: string; nome?: string; ativo?: boolean }
    if (!id?.trim()) {
      return NextResponse.json({ error: 'id obrigatorio' }, { status: 422 })
    }

    const operador = await atualizarOperador(id, { nome, ativo })
    return NextResponse.json(operador)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar operador' },
      { status: 400 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string }
    if (!id?.trim()) {
      return NextResponse.json({ error: 'id obrigatorio' }, { status: 422 })
    }

    await removerOperador(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao excluir operador' },
      { status: 400 }
    )
  }
}
