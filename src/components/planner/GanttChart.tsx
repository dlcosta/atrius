'use client'
import type { BlocoGantt, Maquina, Ordem, Tanque } from '@/types'
import { GanttTimeline } from './GanttTimeline'
import { GanttRow } from './GanttRow'
import { detectarConflito } from '@/lib/planning/engine'
import { JanelaProducao, obterDuracaoJanelaMinutos } from '@/lib/planning/gantt-layout'

type Props = {
  maquinas: Maquina[]
  tanques?: Tanque[]
  blocos: BlocoGantt[]
  ordens: Ordem[]
  dia: Date
  janela: JanelaProducao
  label?: string
  onAgendar: (ordemId: string, maquinaId: string, inicio: Date) => void
  onDesagendar: (ordemId: string) => void
}

export function GanttChart({ maquinas, tanques = [], blocos, ordens, dia, janela, label, onAgendar, onDesagendar }: Props) {
  const conflitos = new Set<string>()
  ordens.forEach((ordem) => {
    if (detectarConflito(ordem, ordens)) conflitos.add(ordem.id)
  })

  const maquinasAtivas = maquinas.filter((m) => m.ativa)
  const minutosJanela = obterDuracaoJanelaMinutos(janela)

  return (
    <div className="border border-[#E4E7EC] rounded-2xl overflow-x-auto bg-white shadow-sm">
      <GanttTimeline janela={janela} label={label} />

      {maquinasAtivas.map((maquina) => {
        const blocosDaMaquina = blocos.filter((b) => b.maquinaId === maquina.id)
        const minutosOcupados = blocosDaMaquina.reduce((acc, bloco) => acc + bloco.duracao_min, 0)
        const ocupacaoPercentual = (minutosOcupados / minutosJanela) * 100
        const tanque = tanques.find((t) => t.id === maquina.id) ?? null

        return (
          <GanttRow
            key={maquina.id}
            maquina={maquina}
            tanque={tanque}
            blocos={blocosDaMaquina}
            dia={dia}
            janela={janela}
            conflitos={conflitos}
            ocupacaoPercentual={ocupacaoPercentual}
            onSoltar={onAgendar}
            onRemover={onDesagendar}
          />
        )
      })}
    </div>
  )
}
