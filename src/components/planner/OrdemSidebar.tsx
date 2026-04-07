import type { Ordem } from '@/types'

type Props = {
  ordens: Ordem[]
}

export function OrdemSidebar({ ordens }: Props) {
  function handleDragStart(e: React.DragEvent, ordemId: string) {
    e.dataTransfer.setData('ordemId', ordemId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-64 flex-shrink-0 border border-gray-200 rounded overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Não agendadas ({ordens.length})
        </h3>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {ordens.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Todas as ordens agendadas</p>
        ) : (
          ordens.map((ordem) => (
            <div
              key={ordem.id}
              draggable
              onDragStart={(e) => handleDragStart(e, ordem.id)}
              className="border-b border-gray-100 px-3 py-2.5 cursor-grab active:cursor-grabbing hover:bg-blue-50 select-none"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ordem.produto?.cor ?? '#5B9BD5' }}
                />
                <span className="text-xs font-medium text-gray-800 truncate">
                  {ordem.produto?.nome ?? ordem.produto_sku}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 pl-5">
                #{ordem.numero_externo} · {ordem.quantidade} {ordem.unidade}
                {ordem.produto && (
                  <> · {ordem.produto.tempo_producao_min}min</>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
