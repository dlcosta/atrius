export interface ParsedEmbalagem {
  produto_base: string
  embalagem_volume: number
  embalagem_unidade: string
  embalagem_volume_ml: number
  embalagem_label: string
  unidades_por_cx: number
  litros_por_unidade: number
  confianca: 'alta' | 'media' | 'manual'
}

const RESULTADO_MANUAL: ParsedEmbalagem = {
  produto_base: '',
  embalagem_volume: 0,
  embalagem_unidade: '',
  embalagem_volume_ml: 0,
  embalagem_label: '',
  unidades_por_cx: 1,
  litros_por_unidade: 0,
  confianca: 'manual',
}

// Extrai quantidade de unidades por caixa/fardo: C/12UN, C/ 4 UN, FD C/6UN, etc.
function parseUnidadesPorCx(descricao: string): number {
  const match = descricao.match(/[CF][DX]?\s*[C\/]+\s*(\d+)\s*UN/i)
  if (match) return parseInt(match[1], 10)
  // também tenta forma simples: C/ 12 UN sem FD/CX no prefixo
  const match2 = descricao.match(/C\/\s*(\d+)\s*UN/i)
  if (match2) return parseInt(match2[1], 10)
  return 1
}

// Remove os segmentos de embalagem (CX/FD, volume) do nome para obter o produto base
function extrairProdutoBase(descricao: string, embalagamLabel: string): string {
  return descricao
    // remove CX C/NUN e FD C/NUN
    .replace(/\s*[-–]?\s*[CF][DX]\s+C\/\s*\d+\s*UN/gi, '')
    .replace(/\s*C\/\s*\d+\s*UN/gi, '')
    // remove padrões de volume (ex: 5L, 500ML, 2 L, GALÃO 5L, FRASCO 500ML)
    .replace(/\s*(GALÃO|FRASCO)\s+\d+\s*(ML|L)\b/gi, '')
    .replace(/\s+\d+[,.]?\d*\s*(ML|L|LT|LTS)\b/gi, '')
    .replace(/\s+\d+\s*(ML|L|LT|LTS)\b/gi, '')
    // remove label normalizado caso ainda reste
    .replace(new RegExp(`\\s*${escapeRegex(embalagamLabel)}\\b`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parseia a descrição de um produto e extrai informações de embalagem.
 * Lida com os padrões:
 *   5L, 5 L, 2L, 1L, 500ML, 500 ML, 0,5L, 0.5L, GALÃO 5L, FRASCO 500ML,
 *   CX C/6UN, FD C/4UN, CX C/12 UN 500ML, etc.
 */
export function normalizarEmbalagem(descricao: string): ParsedEmbalagem {
  const d = descricao.trim().toUpperCase()

  // --- Detectar unidades por caixa/fardo ---
  const unidades_por_cx = parseUnidadesPorCx(d)

  // --- Detectar volume ---
  // Ordem de prioridade: decimal vírgula/ponto, depois inteiro com ML, depois inteiro com L

  let volume_ml = 0
  let embalagem_volume = 0
  let embalagem_unidade = ''
  let embalagem_label = ''
  let confianca: ParsedEmbalagem['confianca'] = 'alta'

  // 0,5L ou 0.5L
  const matchDecimal = d.match(/(\d+)[,.](\d+)\s*(ML|L|LT|LTS)\b/)
  if (matchDecimal) {
    const inteiro = parseInt(matchDecimal[1], 10)
    const decimal = parseInt(matchDecimal[2], 10)
    const valor = inteiro + decimal / Math.pow(10, matchDecimal[2].length)
    const unidade = matchDecimal[3] === 'ML' ? 'ML' : 'L'
    volume_ml = unidade === 'ML' ? valor : valor * 1000
    embalagem_volume = valor
    embalagem_unidade = unidade
    embalagem_label = `${inteiro},${matchDecimal[2]}${unidade}`
    confianca = 'alta'
  }

  // NML ou N ML
  if (!volume_ml) {
    const matchML = d.match(/\b(\d+)\s*ML\b/)
    if (matchML) {
      const valor = parseInt(matchML[1], 10)
      volume_ml = valor
      embalagem_volume = valor
      embalagem_unidade = 'ML'
      embalagem_label = `${valor}ML`
      confianca = 'alta'
    }
  }

  // NL ou N L (inteiro, ex: 5L, 2 L, 1L)
  if (!volume_ml) {
    const matchL = d.match(/\b(0*)(\d+)\s*(L|LT|LTS)\b/)
    if (matchL) {
      const valor = parseInt(matchL[2], 10)
      if (valor > 0) {
        volume_ml = valor * 1000
        embalagem_volume = valor
        embalagem_unidade = 'L'
        embalagem_label = `${valor}L`
        confianca = 'alta'
      }
    }
  }

  // KG como fallback (produtos em pó, etc.)
  if (!volume_ml) {
    const matchKG = d.match(/\b(\d+)\s*KG\b/)
    if (matchKG) {
      const valor = parseInt(matchKG[1], 10)
      volume_ml = valor * 1000 // tratamos 1KG ≈ 1L para fins de agrupamento
      embalagem_volume = valor
      embalagem_unidade = 'KG'
      embalagem_label = `${valor}KG`
      confianca = 'media'
    }
  }

  if (!volume_ml) {
    // parsing falhou — retorna manual para edição pelo usuário
    return { ...RESULTADO_MANUAL, produto_base: descricao.trim() }
  }

  const litros_por_unidade = embalagem_unidade === 'ML' ? volume_ml / 1000 : embalagem_volume

  const produto_base = extrairProdutoBase(descricao.trim().toUpperCase(), embalagem_label)

  return {
    produto_base,
    embalagem_volume,
    embalagem_unidade,
    embalagem_volume_ml: volume_ml,
    embalagem_label,
    unidades_por_cx,
    litros_por_unidade,
    confianca,
  }
}

/**
 * Chave de agrupamento canônica para ordens de envase.
 * Garante que 5L e 2L do mesmo produto NUNCA sejam agrupados.
 */
export function chaveGrupoEnvase(
  produto_base: string,
  embalagem_volume_ml: number,
  data_prevista: string | null
): string {
  return [
    produto_base.toUpperCase().trim(),
    String(embalagem_volume_ml),
    data_prevista ?? 'sem-data',
  ].join('::')
}

/**
 * Calcula o volume total em litros de um grupo de envase.
 *   quantidade: pode ser em caixas (BOXES_MASTER) ou litros (LITERS_MASTER) ou unidades brutas
 *   litros_por_unidade: volume individual de cada embalagem
 *   unidades_por_cx: quantas unidades por caixa/fardo (1 se avulso)
 */
export function calcularVolumeTotalEnvase({
  quantidade,
  litros_por_unidade,
  unidades_por_cx,
  calc_mode,
}: {
  quantidade: number
  litros_por_unidade: number
  unidades_por_cx: number
  calc_mode: 'LITERS_MASTER' | 'BOXES_MASTER'
}): { total_litros: number; total_embalagens: number } {
  if (calc_mode === 'LITERS_MASTER') {
    const total_litros = quantidade
    const total_embalagens = litros_por_unidade > 0 ? Math.ceil(total_litros / litros_por_unidade) : 0
    return { total_litros, total_embalagens }
  }
  // BOXES_MASTER: quantidade = número de caixas
  const total_embalagens = quantidade * unidades_por_cx
  const total_litros = total_embalagens * litros_por_unidade
  return { total_litros, total_embalagens }
}
