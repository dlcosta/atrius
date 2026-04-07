import type { Ordem } from '@/types'

type Props = {
  ordens: Ordem[]
  onNovaOrdem: () => void
}

function badgeEtapa(etapa: Ordem['etapa']) {
  if (etapa === 'tanque') {
    return 'bg-cyan-100 text-cyan-700'
  }
  return 'bg-violet-100 text-violet-700'
}

export function OrdemSidebar({ ordens, onNovaOrdem }: Props) {
  function handleDragStart(e: React.DragEvent, ordemId: string) {
    e.dataTransfer.setData('ordemId', ordemId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-80 flex-shrink-0 rounded-lg border-2 border-slate-200 bg-white overflow-hidden shadow-md">
      <div className="bg-slate-100 border-b-2 border-slate-200 px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-tighter">Não agendadas</h3>
          <p className="text-xs text-slate-500 mt-0.5 font-bold">{ordens.length} ordens no backlog</p>
        </div>
        <button
          onClick={onNovaOrdem}
          title="Nova ordem manual"
          className="w-7 h-7 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-base leading-none font-bold shadow-sm transition-colors"
        >
          +
        </button>
      </div>

      <div className="overflow-y-auto max-h-[calc(100vh-220px)] divide-y divide-slate-100">
        {ordens.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">Todas as ordens estao agendadas</p>
        ) : (
          ordens.map((ordem) => (
            <div
              key={ordem.id}
              draggable
              onDragStart={(e) => handleDragStart(e, ordem.id)}
              className="px-4 py-3 cursor-grab active:cursor-grabbing hover:bg-blue-50/30 select-none transition-colors border-l-4"
              style={{ borderLeftColor: ordem.produto?.cor ?? '#5B9BD5' }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ordem.produto?.cor ?? '#5B9BD5' }}
                />
                <span className="text-base font-bold text-slate-900 truncate tracking-tight">
                  {ordem.produto?.nome ?? ordem.produto_sku}
                </span>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeEtapa(ordem.etapa)}`}>
                  {ordem.etapa}
                </span>
              </div>

              <div className="text-xs text-slate-500">
                #{ordem.numero_externo} - {ordem.quantidade} {ordem.unidade}
              </div>

              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                {ordem.tanque && <span className="px-1.5 py-0.5 rounded bg-slate-100">{ordem.tanque}</span>}
                {ordem.lote && <span className="px-1.5 py-0.5 rounded bg-slate-100">{ordem.lote}</span>}
                {ordem.quantidade_referencia_litros ? (
                  <span className="ml-auto font-medium text-slate-600">
                    {ordem.quantidade_referencia_litros.toFixed(0)} L ref
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
