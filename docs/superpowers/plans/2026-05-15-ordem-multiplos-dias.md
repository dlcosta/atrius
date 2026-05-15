# Multi-Day Order Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable production order creation to accept items from multiple delivery dates and default execution date to today.

**Architecture:** Modify `TanqueSelector.tsx` to remove date-based filtering from item selection while preserving category filtering and tank capacity logic. The execution date now defaults to today instead of the selected delivery date. When creating an order, the earliest delivery date among selected items becomes the order's deadline.

**Tech Stack:** React, TypeScript, Next.js API routes

---

## File Structure

**Modified:**
- `src/components/demanda/TanqueSelector.tsx` — Update item filtering, initialization, and reset logic

---

## Task 1: Update Default Execution Date to Today

**Files:**
- Modify: `src/components/demanda/TanqueSelector.tsx:70-72`

- [ ] **Step 1: Locate current initialization code**

Find lines 70-72 in `TanqueSelector.tsx`:
```typescript
const dataInicialExecucao = dataSelecionada === SEM_DATA_KEY ? getHojeYmd() : dataSelecionada
const [diaExecucao, setDiaExecucao] = useState<string>(dataInicialExecucao)
```

This currently uses the selected delivery date as the initial execution date. We'll change it to always use today.

- [ ] **Step 2: Replace with today's date**

Replace lines 70-72 with:
```typescript
const [diaExecucao, setDiaExecucao] = useState<string>(getHojeYmd())
```

This removes the dependency on `dataSelecionada` and always initializes execution date to today.

- [ ] **Step 3: Verify initialization change**

Check that `dataInicialExecucao` variable is no longer referenced elsewhere. Use Find All (`Ctrl+Shift+F`) to search for `dataInicialExecucao` in the file.

Expected: Should find exactly one match — the variable declaration we're removing. If found elsewhere, we need to update the reset logic in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/components/demanda/TanqueSelector.tsx
git commit -m "fix: default execution date to today instead of delivery date"
```

---

## Task 2: Remove Date Filter from Item Selection

**Files:**
- Modify: `src/components/demanda/TanqueSelector.tsx:76-84`

- [ ] **Step 1: Locate item filtering logic**

Find the `itensDaCategoria` useMemo hook (lines 76-84):
```typescript
const itensDaCategoria = useMemo(() => {
  return itensIniciais.filter(
    (item) =>
      item.categoria_produto === categoriaSelecionada &&
      getDataKey(item) === dataSelecionada &&
      !item.alocado
  )
}, [itensIniciais, categoriaSelecionada, dataSelecionada])
```

Currently filters by category AND delivery date. We'll remove the date filter.

- [ ] **Step 2: Remove date filter condition**

Replace the filter logic with:
```typescript
const itensDaCategoria = useMemo(() => {
  return itensIniciais.filter(
    (item) =>
      item.categoria_produto === categoriaSelecionada &&
      !item.alocado
  )
}, [itensIniciais, categoriaSelecionada])
```

Key changes:
- Remove: `getDataKey(item) === dataSelecionada &&`
- Remove: `dataSelecionada` from dependency array (it's no longer used)

- [ ] **Step 3: Verify dependency array update**

Confirm the useMemo dependency array now contains only: `itensIniciais, categoriaSelecionada`

The `dataSelecionada` variable is still used elsewhere (the UI title showing the selected date), but the item filter no longer depends on it.

- [ ] **Step 4: Commit**

```bash
git add src/components/demanda/TanqueSelector.tsx
git commit -m "feat: allow items from multiple delivery dates in order selection"
```

---

## Task 3: Update Reset Logic After Order Creation

**Files:**
- Modify: `src/components/demanda/TanqueSelector.tsx:228`

- [ ] **Step 1: Locate reset logic**

Find line 228 in the `handleCriarOrdem` function, after successful order creation:
```typescript
setDiaExecucao(dataInicialExecucao)
```

This line attempts to reset the execution date to the initial value, but `dataInicialExecucao` was removed in Task 1.

- [ ] **Step 2: Replace reset with direct today's date**

Replace line 228 with:
```typescript
setDiaExecucao(getHojeYmd())
```

This ensures the next order creation also defaults to today.

- [ ] **Step 3: Verify reset context**

Check the surrounding code context (lines 226-230) to confirm this is the reset block after successful order creation:
```typescript
setSelecionados(new Set())
setNomeOrdem('')
setDiaExecucao(getHojeYmd())  // ← this line
setTurnoId('manha')
onOrdemCriada()
```

- [ ] **Step 4: Commit**

```bash
git add src/components/demanda/TanqueSelector.tsx
git commit -m "fix: reset execution date to today after order creation"
```

---

## Task 4: Manual Testing - Default Date Behavior

**Files:**
- No code changes; testing only

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait for the server to start. Expected output: "✓ Ready in X.XXs"

- [ ] **Step 2: Navigate to order creation**

1. Open http://localhost:3000 in your browser
2. Go to the Demanda section
3. Click "Por Data" tab
4. Select a date with items (e.g., "18/05" from the screenshots)
5. Select a category (e.g., "ÁGUA SANITÁRIA")
6. The TanqueSelector screen should appear

- [ ] **Step 3: Verify execution date defaults to today**

Check the "Dia de producao" field in the form:
- Expected: Should show today's date (2026-05-15), NOT the selected delivery date
- Verify this date matches your system's current date

- [ ] **Step 4: Change execution date and verify items remain consistent**

1. Click the "Dia de producao" input
2. Select a different date (e.g., 2026-05-20)
3. Confirm items from the category are still visible
4. The items list should NOT change when you change the execution date

- [ ] **Step 5: Verify items from multiple dates appear**

1. Go back and select a different delivery date with items (e.g., "19/05")
2. Select the same category again
3. The item list should now show items from BOTH the original date and the new date
4. Example: If "ÁGUA SANITÁRIA" has items on both 18/05 and 19/05, you should see all of them in one list

- [ ] **Step 6: Verify reset after order creation**

1. Select several items (e.g., 3-4 items)
2. Give the order a name
3. Click "Criar Ordem"
4. Wait for success
5. Verify you're back at the tanque selection screen
6. Select the same tanque again
7. The "Dia de producao" field should reset to today's date

---

## Task 5: Manual Testing - Multi-Day Order Creation

**Files:**
- No code changes; testing only

- [ ] **Step 1: Create multi-day order scenario**

1. Navigate back to Demanda calendar
2. Select a category that has items on multiple delivery dates
3. Note the delivery dates of available items (e.g., 17/05, 18/05, 19/05)

- [ ] **Step 2: Select items from different dates**

1. Open the item selection screen
2. Verify you can see items from multiple delivery dates in the same list
3. Select items from at least 2 different delivery dates:
   - Example: Select 2 items from 17/05 and 3 items from 18/05
4. Monitor the "Selecionado agora" total — should accumulate correctly

- [ ] **Step 3: Create order and verify earliest date is used**

1. Give the order a name (e.g., "Ordem Multi-Dia")
2. Click "Criar Ordem"
3. Order should be created successfully
4. Note the order's `data_prevista` in the success feedback or by checking the orders list

Expected: The order's deadline should be the earliest delivery date among selected items (e.g., if you selected from 17/05 and 18/05, the order's `data_prevista` should be 17/05)

- [ ] **Step 4: Verify order appears in calendar**

1. Go back to the calendar view
2. Items you selected should now show as "alocado" (allocated)
3. The new order should appear in the calendar visualization
4. Confirm the order respects the earliest deadline

---

## Task 6: Browser Console Verification

**Files:**
- No code changes; testing only

- [ ] **Step 1: Open browser DevTools**

Press `F12` to open DevTools, go to the Console tab.

- [ ] **Step 2: Create an order and check logs**

1. Follow the order creation flow
2. Before clicking "Criar Ordem", check the console for any errors
3. After clicking, watch the console for API responses
4. Expected: No errors, successful POST to `/api/demanda/ordens` and `/api/producao/agendamentos`

- [ ] **Step 3: Verify no date-filtering warnings**

Search the console for any messages about `dataSelecionada` or date mismatches.

Expected: No warnings about inconsistent dates or missing data.

---

## Spec Coverage Check

✅ **Requirement: Default execution date to today** → Task 1 (initialization) + Task 3 (reset) + Task 4 (testing)

✅ **Requirement: Allow items from multiple days** → Task 2 (remove date filter) + Task 5 (testing multi-day orders)

✅ **Requirement: Use earliest date as order deadline** → Existing code (lines 165-168) already handles this; no changes needed

✅ **Requirement: Tank capacity logic still works** → No changes to capacity logic; Task 5 verifies it works with multi-day selections

---

## Notes

- The `dataSelecionada` variable is still used in the UI (showing the selected delivery date as a label), so it remains a prop and state. We only removed it from the item filter dependency.
- The `data_prevista` calculation in `handleCriarOrdem` (line 165-168) already selects the earliest date from selected items — no changes needed there.
- All existing API endpoints remain unchanged; this is a pure frontend filtering change.
