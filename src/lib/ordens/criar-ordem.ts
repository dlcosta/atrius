const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

interface NovaOrdemInput {
  produto_sku: string
  quantidade: number
  unidade: string
  data_prevista: string
}

interface ResultadoValidacao {
  erro?: string
  valido?: true
  dadosNormalizados?: { unidade: string }
}

export function validarNovaOrdem(input: NovaOrdemInput): ResultadoValidacao {
  if (!input.produto_sku) return { erro: 'Produto obrigatorio' }
  if (input.quantidade <= 0) return { erro: 'Quantidade deve ser maior que zero' }
  if (!input.data_prevista) return { erro: 'Data prevista obrigatoria' }
  if (!DATE_REGEX.test(input.data_prevista)) return { erro: 'Data prevista invalida (use YYYY-MM-DD)' }

  const unidade = (input.unidade || 'UN').trim().toUpperCase()
  return {
    valido: true,
    dadosNormalizados: { unidade: unidade || 'UN' },
  }
}
