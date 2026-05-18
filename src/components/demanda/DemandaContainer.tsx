'use client'

import { useState } from 'react'
import type { ItemDemanda, Ordem, Tanque, Turno } from '@/types'
import { DemandaCalendar } from './DemandaCalendar'

type Props = {
  itensIniciais: ItemDemanda[]
  ordensIniciais: Ordem[]
  tanques: Tanque[]
  turnos: Turno[]
}

export function DemandaContainer({ itensIniciais, ordensIniciais, tanques, turnos }: Props) {
  const [ordens, setOrdens] = useState<Ordem[]>(ordensIniciais)

  const handleOrdemCriada = () => {
    fetch('/api/demanda/ordens')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOrdens(data)
      })
      .catch(console.error)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-6xl mx-auto">
        <DemandaCalendar
          itensIniciais={itensIniciais}
          ordensAgendadas={ordens}
          tanques={tanques}
          turnos={turnos}
          onOrdemCriada={handleOrdemCriada}
        />
      </div>
    </div>
  )
}
