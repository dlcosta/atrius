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
  const [carregando, setCarregando] = useState(true)

  const carregarOrdens = useCallback(async () => {
    if (!id) return
    try {
      const hoje = format(new Date(), 'yyyy-MM-dd')
      const res = await fetch(`/api/ordens?data=${hoje}`)
      if (!res.ok) return
      const data: Ordem[] = await res.json()
      const dasMaquina = data.filter(
        (o) => o.maquina_id === id && o.inicio_agendado !== null
      )
      setOrdens(ordenarPorInicio(dasMaquina))
    } catch (err) {
      console.error('Erro ao carregar ordens da máquina:', err)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    fetch('/api/maquinas')
      .then((r) => r.json())
      .then((maquinas: Maquina[]) => {
        setMaquina(maquinas.find((m) => m.id === id) ?? null)
        setCarregando(false)
      })
      .catch((err) => {
        console.error(err)
        setCarregando(false)
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

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-400">
        Carregando...
      </div>
    )
  }

  if (!maquina) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-red-400">
        Máquina não encontrada.
      </div>
    )
  }

  return <TimerDisplay ordens={ordens} nomeMaquina={maquina.nome} />
}
