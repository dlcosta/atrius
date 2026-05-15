# Spec: Montagem de Ordem com Múltiplos Dias e Data Padrão Hoje

**Date:** 2026-05-15  
**Status:** Design Review  
**Scope:** Update order creation flow to support multi-day item selection and default execution date to today

## Problem

Currently, when creating a production order (ordem de produção):
1. Execution date defaults to the item's scheduled delivery date, not today
2. Users can only select items from the initially selected delivery date, blocking the ability to include priority customers with different scheduled dates in the same order

## Solution

### 1. Default Execution Date to Today

**Change:** Update `TanqueSelector` initialization to use today's date instead of the selected delivery date.

**Current behavior (line 70):**
```typescript
const dataInicialExecucao = dataSelecionada === SEM_DATA_KEY ? getHojeYmd() : dataSelecionada
const [diaExecucao, setDiaExecucao] = useState<string>(dataInicialExecucao)
```

**New behavior:**
```typescript
const [diaExecucao, setDiaExecucao] = useState<string>(getHojeYmd())
```

Always start with today, regardless of the selected delivery date.

### 2. Allow Items from Multiple Days

**Change:** Remove the date filter from item selection logic.

**Current behavior (lines 77-84):**
- Filters items by: `categoria_produto === categoriaSelecionada` AND `getDataKey(item) === dataSelecionada` AND `!alocado`
- Restricts to only the initially selected delivery date

**New behavior:**
- Filter items by: `categoria_produto === categoriaSelecionada` AND `!alocado`
- Allow selection from any delivery date within the category
- Users can mix items from different days in the same order

**Impact on order creation:**
- When creating the order, use the earliest scheduled delivery date among selected items as the order's `data_prevista`
- This ensures the order is marked for the soonest deadline (line 165-168)

## Implementation Changes

### File: `src/components/demanda/TanqueSelector.tsx`

1. **Line 70-71:** Remove `dataSelecionada` from `dataInicialExecucao` calculation
   - Change: `const dataInicialExecucao = getHojeYmd()`
   - Remove: `const dataInicialExecucao = dataSelecionada === SEM_DATA_KEY ? getHojeYmd() : dataSelecionada`

2. **Lines 77-84:** Remove date filter from `itensDaCategoria` useMemo
   - Remove: `getDataKey(item) === dataSelecionada &&`
   - Keep: `item.categoria_produto === categoriaSelecionada && !item.alocado`

3. **Line 228:** Update reset logic after order creation
   - Change: `setDiaExecucao(dataInicialExecucao)` → `setDiaExecucao(getHojeYmd())`
   - Ensures next order defaults to today

## Behavior Examples

### Example 1: Mix Different Days
- User selects category "ÁGUA SANITÁRIA" with delivery date 18/05
- Opens item selection → sees items from 18/05, 17/05, 19/05, etc. all available
- Selects 5 items: 3 from 18/05, 2 from 17/05
- Execution date defaults to today (e.g., 15/05)
- Order created with `data_prevista = 17/05` (earliest among selected items)

### Example 2: Priority Customer
- Main items scheduled for 18/05
- Priority customer item scheduled for 16/05
- Can now include both in same order by selecting from available items
- Order deadline will be 16/05 to respect the earliest commitment

## Testing Checklist

- [ ] Default execution date shows today's date when opening order form
- [ ] Item list shows items from multiple delivery dates, not just selected date
- [ ] Tank capacity logic still works with mixed-date items
- [ ] Order's `data_prevista` uses earliest selected item's date
- [ ] Reset after creation restores execution date to today
- [ ] Items from different days can be selected/deselected freely

## Risk Assessment

**Low risk** — changes are isolated to item filtering and initialization logic. No API changes, no database schema changes. Existing order creation logic remains intact.
