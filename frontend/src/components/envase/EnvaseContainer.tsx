'use client'
import { apiUrl } from '@/lib/api'

import { useState } from 'react'
import type { ItemDemandaEnvase, Maquina, Ordem } from '@/types'
import { EnvaseCalendar } from './EnvaseCalendar'

type Props = {
  itensIniciais: ItemDemandaEnvase[]
  ordensIniciais: Ordem[]
  maquinas: Maquina[]
  ordensTanqueIniciais: Ordem[]
}

export function EnvaseContainer({ itensIniciais, ordensIniciais, maquinas, ordensTanqueIniciais }: Props) {
  const [ordens, setOrdens] = useState<Ordem[]>(ordensIniciais)

  const handleOrdemCriada = () => {
    fetch(apiUrl('/api/envase/ordens'))
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOrdens(data)
      })
      .catch(console.error)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-6xl mx-auto">
        <EnvaseCalendar
          itensIniciais={itensIniciais}
          maquinas={maquinas}
          ordensTanque={ordensTanqueIniciais}
          onOrdemCriada={handleOrdemCriada}
        />
      </div>
    </div>
  )
}
