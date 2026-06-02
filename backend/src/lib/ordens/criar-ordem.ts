const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

interface NovaOrdemInput {
  produto_sku: string
  quantidade?: number
  liters?: number
  unidade?: string
  data_prevista?: string | null
  setup_time_minutes?: number
  production_time_minutes?: number
  cleaning_time_minutes?: number
  etapa?: 'tanque' | 'envase'
  tank_id?: string | null
  machine_id?: string | null
  package_volume_liters?: number | null
  units_per_box?: number | null
  origin_tank_order_id?: string | null
}

interface ResultadoValidacao {
  erro?: string
  valido?: true
  dadosNormalizados?: { unidade: string }
}

export function validarNovaOrdem(input: NovaOrdemInput): ResultadoValidacao {
  if (!input.produto_sku) return { erro: 'Produto obrigatório' }

  const quantidadeBase = Number(input.liters ?? input.quantidade ?? 0)
  if (!Number.isFinite(quantidadeBase) || quantidadeBase <= 0) return { erro: 'Litros deve ser maior que zero' }

  const setup = Number(input.setup_time_minutes ?? 0)
  const production = Number(input.production_time_minutes ?? 0)
  const cleaning = Number(input.cleaning_time_minutes ?? 0)
  if (setup < 0) return { erro: 'setupTimeMinutes deve ser maior ou igual a zero' }
  if (production <= 0) return { erro: 'productionTimeMinutes deve ser maior que zero' }
  if (cleaning < 0) return { erro: 'cleaningTimeMinutes deve ser maior ou igual a zero' }

  if (input.etapa === 'tanque' && !input.tank_id) return { erro: 'Tanque é obrigatório para produção de tanque' }
  if (input.etapa === 'envase' && !input.origin_tank_order_id) return { erro: 'Origem de tanque obrigatória para envase' }
  if (input.etapa === 'envase' && !input.machine_id) return { erro: 'Máquina obrigatória para envase' }
  if (input.package_volume_liters !== undefined && input.package_volume_liters !== null && Number(input.package_volume_liters) <= 0) {
    return { erro: 'packageVolumeLiters deve ser maior que zero' }
  }
  if (input.units_per_box !== undefined && input.units_per_box !== null && Number(input.units_per_box) <= 0) {
    return { erro: 'unitsPerBox deve ser maior que zero' }
  }

  if (!input.data_prevista) return { erro: 'Data prevista obrigatória' }
  if (!DATE_REGEX.test(input.data_prevista)) return { erro: 'Data prevista inválida (use YYYY-MM-DD)' }

  const unidade = (input.unidade || 'UN').trim().toUpperCase()
  return {
    valido: true,
    dadosNormalizados: { unidade: unidade || 'UN' },
  }
}
