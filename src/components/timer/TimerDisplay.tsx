'use client'
import { useState, useEffect } from 'react'
import type { Ordem } from '@/types'

type Props = {
  ordens: Ordem[]
  nomeMaquina: string
}

function calcularTempoRestante(fimISO: string): number {
  return Math.max(0, new Date(fimISO).getTime() - Date.now())
}

function formatarMs(ms: number): string {
  const totalSeg = Math.floor(ms / 1000)
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function TimerDisplay({ ordens, nomeMaquina }: Props) {
  const [agora, setAgora] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const ordemAtual = ordens.find((o) => {
    if (!o.inicio_agendado || !o.fim_calculado) return false
    return new Date(o.inicio_agendado).getTime() <= agora &&
           new Date(o.fim_calculado).getTime() > agora
  })

  const proximas = ordens.filter((o) => {
    if (!o.inicio_agendado) return false
    return new Date(o.inicio_agendado).getTime() > agora
  }).slice(0, 2)

  if (!ordemAtual) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-2xl font-bold text-gray-400 mb-2">{nomeMaquina}</div>
        <div className="text-6xl font-bold text-gray-600 mb-8">Aguardando</div>
        {proximas.length > 0 && (
          <div className="space-y-3 mt-8 w-full max-w-md">
            <div className="text-sm text-gray-500 uppercase tracking-widest text-center mb-4">Próximas</div>
            {proximas.map((o) => (
              <div key={o.id} className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-lg font-semibold">{o.produto?.nome ?? o.produto_sku}</div>
                <div className="text-sm text-gray-400 mt-1">
                  {o.inicio_agendado
                    ? new Date(o.inicio_agendado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : ''
                  } · {o.produto?.tempo_producao_min}min
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const msRestante = calcularTempoRestante(ordemAtual.fim_calculado!)
  const duracaoTotal = (ordemAtual.produto?.tempo_producao_min ?? 1) * 60 * 1000
  const progresso = Math.min(100, ((duracaoTotal - msRestante) / duracaoTotal) * 100)
  const cor = ordemAtual.produto?.cor ?? '#5B9BD5'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
      <div className="text-xl font-semibold text-gray-400 mb-4">{nomeMaquina}</div>
      <div className="text-sm uppercase tracking-widest text-green-400 mb-3">Produzindo</div>
      <div className="text-5xl font-bold text-center mb-8 leading-tight">
        {ordemAtual.produto?.nome ?? ordemAtual.produto_sku}
      </div>
      <div className="text-8xl font-mono font-bold mb-6" style={{ color: cor }}>
        {formatarMs(msRestante)}
      </div>
      <div className="w-full max-w-2xl bg-gray-700 rounded-full h-4 mb-8">
        <div
          className="h-4 rounded-full transition-all duration-1000"
          style={{ width: `${progresso}%`, backgroundColor: cor }}
        />
      </div>
      <div className="text-gray-400 text-sm mb-12">
        #{ordemAtual.numero_externo} · {ordemAtual.quantidade} {ordemAtual.unidade}
      </div>
      {proximas.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Próximos</div>
          <div className="space-y-2">
            {proximas.map((o) => (
              <div key={o.id} className="bg-gray-800 rounded px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium">{o.produto?.nome ?? o.produto_sku}</span>
                <span className="text-xs text-gray-400">
                  {o.inicio_agendado
                    ? new Date(o.inicio_agendado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : ''
                  } · {o.produto?.tempo_producao_min}min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
