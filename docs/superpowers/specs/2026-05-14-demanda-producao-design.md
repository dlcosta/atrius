# Demanda de Produção — Design Spec

**Data:** 2026-05-14  
**Status:** Aprovado

---

## Contexto

O sistema já sincroniza pedidos do ERP (Olist/Tiny) para a tabela `pedidos_erp` e seus itens em `pedidos_erp_itens`. Existe um Planner (Gantt) e um Calendário para agendar ordens de produção, mas não há uma tela para transformar pedidos ERP em ordens de produção de forma estruturada.

Esta spec define a página `/demanda` — a ponte entre os pedidos de venda e o planejamento de produção.

---

## Objetivo

Permitir que o operador veja os pedidos ERP agrupados por `data_prevista` e `categoria_produto`, selecione os itens a produzir limitados pela capacidade de um tanque, e crie ordens de produção com status `BACKLOG` para posterior agendamento no Planner.

---

## Fluxo Principal

1. Operador acessa `/demanda`
2. Vê lista agrupada: **data prevista → categoria → produtos → pedidos**
3. Expande um grupo de categoria
4. Seleciona o tanque (dropdown)
5. Marca checkboxes dos itens/pedidos a incluir — barra de % do tanque atualiza em tempo real
6. Ao atingir 100% da capacidade do tanque, checkboxes restantes ficam bloqueados
7. Clica em "Criar Ordem de Produção"
8. Ordem criada com `status = BACKLOG`, `etapa = tanque`, `calc_mode = LITERS_MASTER`
9. Itens criados saem da lista de pendentes (vinculados na tabela `ordens_pedidos_erp`)

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│ Demanda de Produção                [□ Mostrar alocados]  │
├─────────────────────────────────────────────────────────┤
│ 📅 05/05/2026                                            │
│  ├─ ÁGUA SANITÁRIA          1.200L pendentes  [▼]       │
│  ├─ AMACIANTE AZUL           600L pendentes  [▼]        │
│  └─ DESINFETANTE LAVANDA    1.800L pendentes  [▼]       │
│                                                          │
│ 📅 06/05/2026                                            │
│  ├─ ÁGUA SANITÁRIA          9.120L pendentes  [▼]       │
│  └─ ...                                                  │
├─────────────────────────────────────────────────────────┤
│ [categoria expandida — ex: ÁGUA SANITÁRIA / 05/05]      │
│  Tanque: [Tanque 5.000L ▼]   ████████░░  72% (3.600L)  │
│                                                          │
│  ☑ Pedido 64871 - FORMENTON S/A            8.000L       │
│     ÁGUA SANITÁRIA 5L - FD C/4 UN                       │
│  ☑ Pedido 64776 - Diego Hauschild            900L       │
│     ÁGUA SANITÁRIA 5L - FD C/4 UN                       │
│  ☐ Pedido 64783 - Nikosul [bloqueado - tanque cheio]    │
│                                                          │
│                     [Criar Ordem de Produção — 8.900L]  │
└─────────────────────────────────────────────────────────┘
```

**Comportamentos:**
- Apenas um grupo pode estar expandido por vez (accordion)
- Toggle "Mostrar alocados" exibe itens já vinculados a ordens, com visual distinto (opacidade/badge)
- Barra de % usa a capacidade do tanque selecionado (3.800L, 5.000L ou 10.000L)
- Bloqueio ao atingir 100%: tooltip "Tanque cheio — crie esta ordem antes de continuar"
- Botão "Criar Ordem" só aparece quando há itens selecionados

---

## Fonte de Dados

### Query de Demanda (Supabase)

```sql
WITH base AS (
    SELECT 
        data_prevista,
        produto_descricao,
        numero_pedido,
        cliente_nome,
        quantidade,
        TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        produto_descricao,
                        '[[:space:]]+[0-9]+[[:space:]]*(ML|L|LT|LTS|KG|G)([[:space:]]|$)',
                        ' ', 'gi'
                    ),
                    '[[:space:]]*-[[:space:]]*(CX|FD)[[:space:]].*',
                    '', 'gi'
                ),
                '[[:space:]]+', ' ', 'g'
            )
        ) AS categoria_produto,
        CASE
            WHEN produto_descricao ~* '500[[:space:]]*ML' THEN 0.5
            WHEN produto_descricao ~* '[[:space:]]1[[:space:]]*(L|LT|LTS)' THEN 1
            WHEN produto_descricao ~* '[[:space:]]2[[:space:]]*(L|LT|LTS)' THEN 2
            WHEN produto_descricao ~* '[[:space:]]5[[:space:]]*(L|LT|LTS)' THEN 5
            ELSE 0
        END AS litros_por_unidade,
        CASE
            WHEN produto_descricao ~* 'C/[[:space:]]*24[[:space:]]*UN' THEN 24
            WHEN produto_descricao ~* 'C/[[:space:]]*12[[:space:]]*UN' THEN 12
            WHEN produto_descricao ~* 'C/[[:space:]]*6[[:space:]]*UN'  THEN 6
            WHEN produto_descricao ~* 'C/[[:space:]]*4[[:space:]]*UN'  THEN 4
            ELSE 1
        END AS unidades_por_embalagem
    FROM public.v_pedidos_erp_com_itens
)
SELECT 
    data_prevista,
    categoria_produto,
    produto_descricao,
    numero_pedido,
    cliente_nome,
    SUM(quantidade) AS quantidade,
    MAX(litros_por_unidade) AS litros_por_unidade,
    MAX(unidades_por_embalagem) AS unidades_por_embalagem,
    SUM(quantidade * litros_por_unidade * unidades_por_embalagem) AS total_litros
FROM base
GROUP BY 
    data_prevista, categoria_produto, produto_descricao, numero_pedido, cliente_nome
ORDER BY 
    data_prevista, categoria_produto, produto_descricao
```

**Filtro de pendentes:** A API filtra itens que ainda **não** possuem registro em `ordens_pedidos_erp` (numero_pedido + produto_descricao). O toggle "Mostrar alocados" remove esse filtro.

---

## Modelo de Dados

### Nova tabela: `ordens_pedidos_erp`

```sql
CREATE TABLE ordens_pedidos_erp (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_id          uuid NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
    numero_pedido     text NOT NULL,
    produto_descricao text NOT NULL,
    quantidade        numeric NOT NULL,
    total_litros      numeric NOT NULL,
    criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON ordens_pedidos_erp (numero_pedido);
CREATE INDEX ON ordens_pedidos_erp (ordem_id);
```

### Lógica de pendência

Um item `(numero_pedido, produto_descricao)` está **pendente** quando não existe nenhuma linha em `ordens_pedidos_erp` com essa combinação.

Um item está **alocado** quando existe pelo menos uma linha — podendo ser exibido com o status da ordem vinculada (`BACKLOG`, `IN_PRODUCTION`, `COMPLETED`).

---

## API

### `GET /api/demanda`

Executa a query acima via Supabase. Parâmetros opcionais:
- `mostrar_alocados=true` — inclui itens já vinculados a ordens

Retorna array de linhas já agrupáveis pelo cliente.

### `POST /api/demanda/ordens`

Cria a ordem e os vínculos em uma transação:

```typescript
// Body
{
  categoria_produto: string
  data_prevista: string
  tank_id: string
  total_litros: number
  itens: Array<{
    numero_pedido: string
    produto_descricao: string
    quantidade: number
    total_litros: number
  }>
}
```

1. Cria registro em `ordens` com:
   - `etapa = 'tanque'`
   - `planning_status = 'BACKLOG'`
   - `calc_mode = 'LITERS_MASTER'`
   - `quantidade = total_litros`
   - `tank_id = tank_id`
   - `data_prevista = data_prevista`
   - `numero_externo = categoria_produto` (identificador legível)
2. Insere todos os itens em `ordens_pedidos_erp`
3. Retorna a ordem criada

---

## Componentes (Client Components)

| Componente | Responsabilidade |
|---|---|
| `DemandaPage` | Server component, busca dados iniciais |
| `DemandaList` | Renderiza accordion por data → categoria |
| `CategoriaAccordion` | Expansão de um grupo, dropdown de tanque, barra de % |
| `ItemPedidoRow` | Linha com checkbox, nome do pedido, litros |
| `TanqueProgressBar` | Barra de progresso com % e litros |

---

## Integração com Fluxo Existente

- Ordens criadas aqui chegam no **Planner** com status `BACKLOG`
- O Planner já exibe ordens em backlog — nenhuma mudança necessária
- Futura tela "Status por Pedido" pode consultar `ordens_pedidos_erp` JOIN `ordens` para mostrar o que foi produzido vs. pendente por número de pedido

---

## Fora de Escopo (desta fase)

- Agendamento de data/hora/máquina (feito no Planner)
- Tela de "Status por Pedido" (fase futura)
- Edição ou exclusão de vínculos `ordens_pedidos_erp`
