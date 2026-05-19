# Planejamento do Tanque — Documentação Técnica

> Referência completa da arquitetura implementada.
> Este documento será usado como base para criar o fluxo de **Envase**.

---

## 1. Visão geral do fluxo

```
Planejamento do Tanque
        ↓
   Cria Ordem (planning_status = BACKLOG, etapa = tanque)
        ↓
Backlog dos Tanques (sidebar do Calendário)
        ↓
   Drag & Drop → Calendário de Produção
        ↓
   Cria agendamentos_producao (planning_status = SCHEDULED)
        ↓
   Execução (IN_PRODUCTION → COMPLETED)
        ↓
   ordens_audit_log (todas as operações registradas)
```

---

## 2. Tabelas envolvidas

| Tabela | Papel |
|--------|-------|
| `ordens` | Entidade central — toda ordem nasce aqui |
| `tanques` | Referência de capacidade e identificação dos tanques |
| `turnos` | Janelas de tempo disponíveis para agendamento |
| `agendamentos_producao` | Vínculo ordem ↔ tanque ↔ turno ↔ data |
| `ordens_pedidos_erp` | Vínculo entre a ordem e os pedidos do ERP que a originaram |
| `ordens_audit_log` | Log completo de todas as operações |
| `produtos` | Tempos de produção, limpeza e volume base |

### Campos críticos em `ordens`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `etapa` | TEXT | `'tanque'` ou `'envase'` |
| `planning_status` | TEXT | `BACKLOG`, `SCHEDULED`, `IN_PRODUCTION`, `COMPLETED`, `CANCELED` |
| `tank_id` | TEXT | FK → `tanques.id` |
| `tank_volume_liters` | NUMERIC | Capacidade do tanque no momento da criação |
| `quantidade` | NUMERIC | Volume em litros (quando etapa=tanque) |
| `production_time_minutes` | INTEGER | Tempo estimado de produção |
| `cleaning_time_minutes` | INTEGER | Tempo estimado de limpeza |
| `total_duration_minutes` | INTEGER | Soma de produção + limpeza |
| `inicio_agendado` | TIMESTAMPTZ | Início real no calendário (ISO) |
| `fim_calculado` | TIMESTAMPTZ | Fim calculado com base na duração |

### Campos críticos em `agendamentos_producao`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `ordem_id` | UUID | FK → `ordens.id` |
| `tank_id` | TEXT | FK → `tanques.id` |
| `turno_id` | TEXT/UUID | FK → `turnos.id` (ou `'manual'` quando fora de turno) |
| `turno_nome` | TEXT | Nome do turno para exibição |
| `data_agendamento` | DATE | Data `YYYY-MM-DD` |
| `status` | TEXT | `SCHEDULED`, `IN_PRODUCTION`, `PAUSED`, `COMPLETED`, `CANCELED` |
| `data_inicio` | TIMESTAMPTZ | Início real da execução |
| `data_conclusao` | TIMESTAMPTZ | Conclusão real |

---

## 3. APIs utilizadas

### Planejamento do Tanque (criação de ordem)

| Método | Endpoint | Função |
|--------|----------|--------|
| `POST` | `/api/demanda/ordens` | Cria ordem no BACKLOG com vínculos de pedidos |
| `GET` | `/api/demanda/ordens` | Lista ordens SCHEDULED/IN_PRODUCTION com agendamentos |

### Backlog

| Método | Endpoint | Função |
|--------|----------|--------|
| `GET` | `/api/backlog` | Lista **todas** as ordens BACKLOG etapa=tanque com pedidos vinculados |

### Agendamento

| Método | Endpoint | Função |
|--------|----------|--------|
| `GET` | `/api/producao/agendamentos?ordem_id=X` | Busca agendamento ativo de uma ordem |
| `POST` | `/api/producao/agendamentos` | Cria agendamento + muda planning_status para SCHEDULED |
| `DELETE` | `/api/producao/agendamentos?id=X` | Remove agendamento + volta planning_status para BACKLOG |

### Ordens

| Método | Endpoint | Função |
|--------|----------|--------|
| `PATCH` | `/api/ordens` | Atualiza `inicio_agendado`, `fim_calculado`, `tank_id`, `planning_status` |

---

## 4. Componentes front-end

| Componente | Caminho | Papel |
|-----------|---------|-------|
| `DemandaProducaoContainer` | `src/components/demanda/` | Hub do módulo Planejamento do Tanque |
| `DemandaContainer` | `src/components/demanda/` | Distribuidor de views interno |
| `CategoriaAccordion` | `src/components/demanda/` | Agrupamento por categoria + seleção de tanque |
| `ItemPedidoRow` | `src/components/demanda/` | Linha individual de item de pedido |
| `TanqueProgressBar` | `src/components/demanda/` | Barra visual de capacidade do tanque |
| `BacklogTanques` | `src/components/calendario/` | Sidebar do Calendário com ordens pendentes |
| `GanttChart` | `src/components/planner/` | Raiz do calendário visual |
| `GanttRow` | `src/components/planner/` | Linha por tanque com blocos de produção |
| `GanttBlock` | `src/components/planner/` | Bloco individual (setup / produção / limpeza) |
| `GanttTimeline` | `src/components/planner/` | Cabeçalho com horas |

---

## 5. Como uma ordem nasce no Planejamento do Tanque

1. O operador acessa `Planejamento do Tanque → Planejamento do Tanque (aba)`.
2. Os itens são carregados da view `v_pedidos_erp_com_itens` via `GET /api/demanda`.
3. Os itens são agrupados por `categoria_produto` (calculada por regex na descrição do produto).
4. O operador seleciona itens e atribui um tanque com capacidade suficiente.
5. O sistema valida: `total_litros ≤ tanque.volume_liters`.
6. `POST /api/demanda/ordens` cria:
   - Um registro em `ordens` com `planning_status = 'BACKLOG'` e `etapa = 'tanque'`
   - Registros em `ordens_pedidos_erp` vinculando cada pedido à ordem
   - Um registro em `ordens_audit_log` com `operacao = 'CRIADO'`

---

## 6. Como a ordem entra no Backlog dos Tanques

- O `BacklogTanques` faz `GET /api/backlog` ao carregar.
- A API retorna **todas** as ordens onde `planning_status = 'BACKLOG'` e `etapa = 'tanque'`, sem filtro por data.
- Isso garante que ordens antigas ou sem data apareçam sempre no backlog.
- Os cards exibem: categoria, volume, pedidos vinculados, tempos estimados, data prevista e alertas de prazo.

---

## 7. Como a ordem é agendada no Calendário

1. O operador **arrasta** um card do `BacklogTanques` para uma célula do calendário.
2. O `handleDragEnd` no `CalendarioPage` detecta `payload.type === 'backlog'` + `resourceTab === 'tanque'`.
3. A função `agendarTanque(ordemId, tankId, inicio)` é chamada:
   - Calcula `fim` usando `total_duration_minutes` da ordem (ou 60min como fallback).
   - Encontra o turno correspondente pela função `encontrarTurno(inicio)` — compara horário com `turnos.hora_inicio` e `turnos.hora_fim` (em minutos do dia).
   - Se nenhum turno bate, usa `turno_id = 'manual'` e `turno_nome = 'Manual'`.
   - `POST /api/producao/agendamentos` — cria o registro em `agendamentos_producao` e muda `planning_status = 'SCHEDULED'`.
   - `PATCH /api/ordens` — define `inicio_agendado`, `fim_calculado`, `tank_id`.
4. Após ambas as chamadas, `carregarTudo()` atualiza estado: backlog recarrega (ordem some) + ordens do calendário recarregam (bloco aparece).

---

## 8. Como a ordem sai do Backlog após ser agendada

- O backlog é recarregado via `GET /api/backlog` após cada agendamento.
- A query filtra `planning_status = 'BACKLOG'` — logo, a ordem SCHEDULED não aparece mais.
- Não há "remoção manual" no componente: o estado é sempre derivado do banco.

---

## 9. Como a ordem aparece no Gantt

- O calendário carrega ordens via `GET /api/ordens?inicio=...&fim=...`.
- A query filtra `planning_status IN ('SCHEDULED', 'IN_PRODUCTION')` com inner join em `agendamentos_producao`.
- Ordens agendadas com `inicio_agendado` e `fim_calculado` são renderizadas como `VerticalScheduledEvent` no `MachineCalendarBoard`.
- O `GanttBlock` usa `horaParaPixel()` para posicionamento e `duracao_min * PIXELS_PER_MINUTE` para largura.

---

## 10. Como o status muda ao longo do processo

| Evento | `planning_status` (ordens) | `status` (agendamentos_producao) |
|--------|--------------------------|----------------------------------|
| Ordem criada | `BACKLOG` | — |
| Agendada | `SCHEDULED` | `SCHEDULED` |
| Iniciada | `IN_PRODUCTION` | `IN_PRODUCTION` |
| Pausada | `IN_PRODUCTION` | `PAUSED` |
| Retomada | `IN_PRODUCTION` | `IN_PRODUCTION` |
| Concluída | `COMPLETED` | `COMPLETED` |
| Desagendada | `BACKLOG` | *(registro deletado)* |
| Cancelada | `CANCELED` | `CANCELED` |

---

## 11. Cálculo de duração

A duração total de uma ordem de tanque é:

```
duração = production_time_minutes + cleaning_time_minutes
```

Esses valores são definidos pelo operador no momento da criação da ordem em `Planejamento do Tanque`, via `CategoriaAccordion`.

Para ordens com produto vinculado, a duração proporcional seria:
```
duração_produção = (quantidade_referencia_L / produto.volume_base) × produto.tempo_producao_min
```

A lógica de cálculo está em `src/lib/planning/engine.ts` — função `calcularDuracao()`.

---

## 12. Validação de conflito por tanque

A função `detectarConflito()` em `engine.ts` verifica sobreposição temporal:

```typescript
// Para ordens de tanque, verifica pelo tank_id
if (isTank) {
  if (!candidata.tank_id || e.tank_id !== candidata.tank_id) return false
}
// Sobreposição: início da candidata < fim da existente E fim da candidata > início da existente
return inicioC < fimE && fimC > inicioE
```

Quando ocorre conflito durante DnD:
- Para tanque: exibe `mensagem` de erro direto (sem modal de resolução).
- Para envase: abre `ConflictModal` com opções de reprogramação.

O conflito é verificado no `VerticalScheduledEvent` durante movimento de ordens já agendadas.

---

## 13. Drag and Drop — implementação

**Biblioteca**: `@dnd-kit/core` (v6.3.1)

**Componentes:**
- `DndContext` — wrapper na raiz de `CalendarioPage`
- `useDraggable` — usado em cada card do `BacklogTanques`
- `useDroppable` — usado em cada `MachineCalendarBoard` (id: `board:{resourceId}`)
- `DragOverlay` — card fantasma durante o arrastar

**Payload do drag:**
```typescript
type DragPayload =
  | { type: 'backlog'; ordemId: string }
  | { type: 'scheduled'; ordemId: string }
```

**Fluxo do drop (tanque):**
1. `handleDragEnd` recebe `event.over.id = 'board:{tankId}'`
2. Calcula posição `inicio` a partir das coordenadas do drop
3. Se `payload.type === 'backlog'` e `resourceTab === 'tanque'` → chama `agendarTanque()`
4. Caso contrário → chama `salvarAgenda()` (para envase ou para reposicionamento)

---

## 14. Logs operacionais

Todas as operações são registradas em `ordens_audit_log`:

| Operação | Quando ocorre |
|----------|--------------|
| `CRIADO` | Ordem criada em `/api/demanda/ordens POST` |
| `AGENDADO` | Agendamento criado em `/api/producao/agendamentos POST` |
| `REAGENDADO` | Ordem movida (via PATCH com novo horário) |
| `CANCELADO` | Agendamento deletado, ordem volta para BACKLOG |
| `STATUS_ALTERADO` | Mudança de status manual |
| `INICIADO` | Produção iniciada |
| `PAUSADO` | Produção pausada |
| `RETOMADO` | Produção retomada |
| `CONCLUIDO` | Produção concluída |

**Campos registrados:**
- `ordem_id`, `agendamento_id`
- `operacao`, `descricao`
- `dados_antes` (JSONB), `dados_depois` (JSONB)
- `responsavel` (TEXT livre — aguarda autenticação)
- `motivo`
- `criado_em`

---

## 15. Campos obrigatórios para criar uma ordem de tanque

Para `POST /api/demanda/ordens`:
```json
{
  "categoria_produto": "string — nome da categoria",
  "nome_ordem": "string — identificador único",
  "data_prevista": "YYYY-MM-DD",
  "tank_id": "string — id do tanque",
  "total_litros": "number > 0",
  "itens": [
    {
      "numero_pedido": "string",
      "produto_descricao": "string",
      "quantidade": "number",
      "total_litros": "number"
    }
  ],
  "production_time_minutes": "number (opcional)",
  "cleaning_time_minutes": "number (opcional)"
}
```

Para `POST /api/producao/agendamentos`:
```json
{
  "ordem_id": "UUID",
  "tank_id": "string",
  "turno_id": "UUID ou 'manual'",
  "turno_nome": "string",
  "data_agendamento": "YYYY-MM-DD"
}
```

---

## 16. Base para implementação futura do Envase

### O que pode ser reaproveitado diretamente

| Elemento | Reutilização no Envase |
|----------|----------------------|
| Conceito de backlog | `BacklogEnvase` com filtro `etapa = 'envase'` |
| Cards pendentes | Mesmo design de `DraggableCard` do `BacklogTanques` |
| Agendamento no calendário | Mesmo fluxo, recurso = máquina de envase (não tanque) |
| Vínculo com ordem de produção | Campo `origin_tank_order_id` já existe em `ordens` |
| Mudança de status | Mesmo `planning_status`, mesma tabela `agendamentos_producao` |
| Logs operacionais | Mesma tabela `ordens_audit_log`, mesmas operações |
| Validação de conflito | `detectarConflito()` — trocar `tank_id` por `maquina_id` |
| Separação visual no calendário | Aba "Envase" já existe em `resourceTab` |
| Drag and drop | Mesma infraestrutura `@dnd-kit`, novo droppable por máquina |
| Sincronização com dashboard | Mesma tabela `ordens`, mesmos campos de status |

### O que será diferente no Envase

| Elemento | Diferença |
|----------|-----------|
| Recurso agendado | Máquinas de envase (`maquinas` table, `etapa = 'envase'`) — não tanques |
| Campo de conflito | `maquina_id` em vez de `tank_id` |
| Origem da ordem | Derivada de uma ordem de tanque via `origin_tank_order_id` |
| Dependência temporal | O envase só pode ocorrer após a produção no tanque estar concluída |
| Tempos | `setup_time_minutes`, `production_time_minutes` e `cleaning_time_minutes` específicos para envase |
| Volume de referência | `package_volume_liters × units_per_box` (calc_mode = BOXES_MASTER) |
| Cálculo de caixas | `estimated_boxes = origin_tank_liters / box_volume_liters` |
| Balanceo de volume | Campo `origin_tank_balance_status` (BALANCED / UNDER / OVER) |
| Backlog de envase | Ordens com `etapa = 'envase'` e `planning_status = 'BACKLOG'` |
| Nova API de backlog | `GET /api/backlog/envase` com join em `origem (tanque)` |

### Campos já existentes em `ordens` para suportar o Envase

```sql
origin_tank_order_id    UUID     -- FK → ordens.id (tanque de origem)
origin_tank_liters      NUMERIC  -- Litros do tanque de origem
origin_tank_filled_liters NUMERIC -- Litros já enviados para envase
origin_tank_delta_liters NUMERIC  -- Saldo pendente
origin_tank_balance_status TEXT   -- 'BALANCED' | 'UNDER' | 'OVER'
package_volume_liters   NUMERIC   -- Volume por embalagem
units_per_box           INTEGER   -- Unidades por caixa
box_volume_liters       NUMERIC   -- Volume total da caixa
estimated_boxes         INTEGER   -- Caixas estimadas
calc_mode               TEXT      -- 'BOXES_MASTER' para envase
```

### Ordem recomendada de implementação do Envase

1. Criar `GET /api/backlog/envase` — ordens `BACKLOG + etapa=envase` com vínculo ao tanque de origem
2. Criar `BacklogEnvase.tsx` baseado no `BacklogTanques.tsx`
3. No Calendário, a aba "Envase" já renderiza a `DroppableBacklog` — trocar por `BacklogEnvase`
4. No `handleDragEnd`, quando `resourceTab === 'envase'` e `payload.type === 'backlog'`:
   - Chamar `POST /api/producao/agendamentos` com `maquina_id` em vez de `tank_id`
   - Ou criar endpoint específico `/api/producao/agendamentos/envase`
5. Adicionar validação de dependência: verificar se a ordem de tanque de origem está concluída
6. Adicionar cálculo `estimated_boxes` baseado em `box_volume_liters`
7. Criar view `v_envase_pendente` que une a ordem de envase com a origem do tanque
