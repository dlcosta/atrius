'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TimerDisplay } from '@/components/timer/TimerDisplay'
import { ordenarPorInicio } from '@/lib/planning/engine'
import type { Maquina, Ordem } from '@/types'
import { format } from 'date-fns'

export default function MaquinaPage() {
  const params = useParams()
  const id = params?.id as string
  const [maquina, setMaquina] = useState<Maquina | null>(null)
  const [ordens, setOrdens] = useState<Ordem[]>([])

  const carregarOrdens = useCallback(async () => {
    if (!id) return
    const hoje = format(new Date(), 'yyyy-MM-dd')
    const res = await fetch(`/api/ordens?data=${hoje}`)
    const data: Ordem[] = await res.json()
    const dasMaquina = data.filter(
      (o) => o.maquina_id === id && o.inicio_agendado !== null
    )
    setOrdens(ordenarPorInicio(dasMaquina))
  }, [id])

  useEffect(() => {
    if (!id) return
    // Load machine name
    fetch('/api/maquinas')
      .then((r) => r.json())
      .then((maquinas: Maquina[]) => {
        setMaquina(maquinas.find((m) => m.id === id) ?? null)
      })

    carregarOrdens()
  }, [id, carregarOrdens])

  // Supabase Realtime — updates when planner edits the Gantt
  useEffect(() => {
    if (!id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`ordens-maquina-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordens', filter: `maquina_id=eq.${id}` },
        () => { carregarOrdens() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, carregarOrdens])

  if (!maquina) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-400">
        Carregando...
      </div>
    )
  }

  return <TimerDisplay ordens={ordens} nomeMaquina={maquina.nome} />
}
