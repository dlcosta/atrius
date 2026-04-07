'use client'
import type { BlocoGantt, Maquina, Ordem } from '@/types'
import { GanttTimeline } from './GanttTimeline'
import { GanttRow } from './GanttRow'
import { detectarConflito } from '@/lib/planning/engine'
import { JanelaProducao, obterDuracaoJanelaMinutos } from '@/lib/planning/gantt-layout'

type Props = {
  maquinas: Maquina[]
  blocos: BlocoGantt[]
  ordens: Ordem[]
  dia: Date
  janela: JanelaProducao
  onAgendar: (ordemId: string, maquinaId: string, inicio: Date) => void
  onDesagendar: (ordemId: string) => void
}

export function GanttChart({ maquinas, blocos, ordens, dia, janela, onAgendar, onDesagendar }: Props) {
  const conflitos = new Set<string>()
  ordens.forEach((ordem) => {
    if (detectarConflito(ordem, ordens)) conflitos.add(ordem.id)
  })

  const maquinasAtivas = maquinas.filter((m) => m.ativa)
  const minutosJanela = obterDuracaoJanelaMinutos(janela)

  return (
    <div className="border border-slate-200 rounded-2xl overflow-x-auto bg-white shadow-sm">
      <GanttTimeline janela={janela} />

      {maquinasAtivas.map((maquina) => {
        const blocosDaMaquina = blocos.filter((b) => b.maquinaId === maquina.id)
        const minutosOcupados = blocosDaMaquina.reduce((acc, bloco) => acc + bloco.duracao_min, 0)
        const ocupacaoPercentual = (minutosOcupados / minutosJanela) * 100

        return (
          <GanttRow
            key={maquina.id}
            maquina={maquina}
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
