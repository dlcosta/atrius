import type { EtapaOrdem } from '@/types'

type OrdemParaVolume = {
  id: string
  quantidade: number
  unidade: string | null
  lote: string | null
  etapa: EtapaOrdem | null
}

const UNIDADES_LITRO = new Set(['L', 'LT', 'LTS', 'LITRO', 'LITROS'])

function quantidadeSegura(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0
}

export function normalizarUnidade(unidade: string | null | undefined): string {
  return (unidade ?? '').trim().toUpperCase()
}

export function unidadeEhLitro(unidade: string | null | undefined): boolean {
  return UNIDADES_LITRO.has(normalizarUnidade(unidade))
}

export function inferirEtapa(
  produtoSku: string | null | undefined,
  unidade: string | null | undefined
): EtapaOrdem {
  if ((produtoSku ?? '').toUpperCase().startsWith('TQ')) return 'tanque'
  if (unidadeEhLitro(unidade)) return 'tanque'
  return 'envase'
}

function ordemEhTanque(ordem: OrdemParaVolume): boolean {
  return (ordem.etapa ?? inferirEtapa('', ordem.unidade)) === 'tanque'
}

function volumePadrao(ordem: OrdemParaVolume): number {
  return quantidadeSegura(Number(ordem.quantidade))
}

export function mapearVolumeReferenciaPorOrdem(ordens: OrdemParaVolume[]): Record<string, number> {
  const volumePorOrdem: Record<string, number> = {}

  for (const ordem of ordens) {
    volumePorOrdem[ordem.id] = volumePadrao(ordem)
  }

  const porLote = new Map<string, OrdemParaVolume[]>()
  for (const ordem of ordens) {
    if (!ordem.lote) continue
    const chave = ordem.lote.trim().toLowerCase()
    if (!chave) continue
    const lista = porLote.get(chave) ?? []
    lista.push(ordem)
    porLote.set(chave, lista)
  }

  porLote.forEach((ordensDoLote) => {
    const tanques = ordensDoLote.filter(ordemEhTanque)
    const envases = ordensDoLote.filter((ordem) => !ordemEhTanque(ordem))

    if (tanques.length === 0 || envases.length === 0) return

    const volumeTanques = tanques.reduce((acc, ordem) => {
      if (unidadeEhLitro(ordem.unidade)) return acc + quantidadeSegura(Number(ordem.quantidade))
      return acc
    }, 0)

    if (volumeTanques <= 0) return

    const totalEnvase = envases.reduce(
      (acc, ordem) => acc + quantidadeSegura(Number(ordem.quantidade)),
      0
    )

    if (totalEnvase <= 0) return

    for (const ordem of envases) {
      const peso = quantidadeSegura(Number(ordem.quantidade)) / totalEnvase
      volumePorOrdem[ordem.id] = Math.max(0, peso * volumeTanques)
    }
  })

  return volumePorOrdem
}

export function obterVolumeReferenciaLitros(
  ordem: OrdemParaVolume,
  volumePorOrdem: Record<string, number>
): number {
  return volumePorOrdem[ordem.id] ?? volumePadrao(ordem)
}
