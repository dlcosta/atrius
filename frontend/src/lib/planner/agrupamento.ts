import type { Maquina, Ordem, Tanque } from '@/types'

// Lógica PURA do painel de operação (agrupamento por recurso + timer ao vivo).
// Extraída de OperacaoDashboard.tsx para permitir testes de regressão sem renderizar React.

export type ResourceGroup = {
  id: string
  nome: string
  tipo: 'maquina' | 'tanque'
  capacidadeLitros?: number
  ordens: Ordem[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function segParaRelogio(totalSeg: number): string {
  const s = totalSeg % 60
  const m = Math.floor((totalSeg % 3600) / 60)
  const h = Math.floor(totalSeg / 3600)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function formatarRestante(ordem: Ordem, agoraMs: number): string {
  if (ordem.status === 'pausada' && ordem.tempo_restante_pausado_seg) {
    return segParaRelogio(Math.max(0, ordem.tempo_restante_pausado_seg))
  }
  // Timer ao vivo usa o fim estimado operacional; fim_calculado serve de fallback p/ ordens antigas
  const fimAlvo = ordem.fim_estimado ?? ordem.fim_calculado
  if (!fimAlvo) return '--:--:--'
  const ms = Math.max(0, new Date(fimAlvo).getTime() - agoraMs)
  return segParaRelogio(Math.floor(ms / 1000))
}

export function formatarDecorrido(ordem: Ordem, agoraMs: number): string {
  if (!ordem.inicio_operacao_em) return '--:--:--'
  const ms = Math.max(0, agoraMs - new Date(ordem.inicio_operacao_em).getTime())
  return segParaRelogio(Math.floor(ms / 1000))
}

export function calcularProgresso(ordem: Ordem, agoraMs: number): number {
  const inicioStr = ordem.inicio_operacao_em ?? ordem.inicio_agendado
  const fimStr = ordem.fim_estimado ?? ordem.fim_calculado
  if (!inicioStr || !fimStr) return 0
  const inicio = new Date(inicioStr).getTime()
  const fim = new Date(fimStr).getTime()
  const total = fim - inicio
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, ((agoraMs - inicio) / total) * 100))
}

export function getRecursoKey(tipo: 'maquina' | 'tanque', id: string): string {
  return tipo === 'maquina' ? `machine:${id}` : `tank:${id}`
}

export function ordenarOrdens(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aT = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bT = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aT - bT
  })
}

export function montarGrupos(maquinas: Maquina[], tanques: Tanque[], ordens: Ordem[]): ResourceGroup[] {
  const gruposMaquina = maquinas
    .filter((m) => m.ativa)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      tipo: 'maquina' as const,
      ordens: ordenarOrdens(ordens.filter((o) => o.maquina_id === m.id && o.inicio_agendado)),
    }))

  const tanqueIdsConhecidos = new Set(tanques.map((t) => t.id))

  const gruposTanque = tanques
    .filter((t) => t.ativo)
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      tipo: 'tanque' as const,
      capacidadeLitros: t.volume_liters,
      ordens: ordenarOrdens(
        ordens.filter(
          (o) =>
            o.etapa === 'tanque' &&
            o.inicio_agendado &&
            (o.tank_id === t.id || (!o.tank_id && o.tanque === t.nome)),
        ),
      ),
    }))

  // Tanques órfãos (ordens sem tank_id conhecido)
  const mapExtras = new Map<string, ResourceGroup>()
  ordens
    .filter(
      (o) =>
        o.etapa === 'tanque' &&
        o.inicio_agendado &&
        (!o.tank_id || !tanqueIdsConhecidos.has(o.tank_id)),
    )
    .forEach((o, i) => {
      const key = o.tank_id ?? o.tanque ?? `extra-${i}`
      const nome = o.tanque_ref?.nome ?? o.tanque ?? `Tanque ${i + 1}`
      if (!mapExtras.has(key)) mapExtras.set(key, { id: key, nome, tipo: 'tanque', ordens: [] })
      mapExtras.get(key)!.ordens.push(o)
    })
  const gruposExtras = Array.from(mapExtras.values()).map((g) => ({
    ...g,
    ordens: ordenarOrdens(g.ordens),
  }))

  return [...gruposMaquina, ...gruposTanque, ...gruposExtras]
}
