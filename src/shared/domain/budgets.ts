// Presupuestos por mes y categoría.
import { addMonthsToMonth, daysInMonth, monthOf, parts } from '../dates'
import type { MonthKey } from '../types'
import { categoryKind, type Ctx } from './ctx'
import { monthSummaries } from './ledger'

export type BudgetState = 'NO_BUDGET' | 'OK' | 'FAST' | 'ALERT' | 'OVER'

export interface BudgetLine {
  categoryId: string
  budgetCents: number | null
  spentCents: number // positivo = gastado (neto de reembolsos)
  remainingCents: number | null
  usedPct: number | null
  /** Gasto esperado a estas alturas del mes si fuese lineal. */
  expectedToDateCents: number | null
  prevAvgCents: number
  prevMonthCents: number
  alertPct: number
  state: BudgetState
}

export interface BudgetReport {
  month: MonthKey
  elapsedRatio: number
  lines: BudgetLine[]
  totalBudgetCents: number
  totalSpentBudgetedCents: number
  totalSpentCents: number
  usedPct: number | null
}

export function budgetReport(ctx: Ctx, month: MonthKey): BudgetReport {
  const months = [addMonthsToMonth(month, -3), addMonthsToMonth(month, -2), addMonthsToMonth(month, -1), month]
  const sums = monthSummaries(ctx, months)
  const cur = sums.get(month)!
  const prev = sums.get(months[2])!
  const todayMonth = monthOf(ctx.today)
  let elapsed = 1
  if (month === todayMonth) {
    const { y, m, d } = parts(ctx.today)
    elapsed = d / daysInMonth(y, m)
  } else if (month > todayMonth) elapsed = 0
  const budgets = new Map(ctx.budgets.filter((b) => b.month === month).map((b) => [b.categoryId, b]))
  const lines: BudgetLine[] = []
  const expenseCats = ctx.categories.filter((c) => categoryKind(ctx, c.id) === 'EXPENSE')
  let totalBudget = 0
  let totalSpentBudgeted = 0
  let totalSpent = 0
  for (const c of expenseCats) {
    const b = budgets.get(c.id)
    const spent = -(cur.expensesByCategory[c.id] ?? 0)
    const prevAvg = Math.round(-months.slice(0, 3).reduce((s, m) => s + (sums.get(m)!.expensesByCategory[c.id] ?? 0), 0) / 3)
    const prevMonth = -(prev.expensesByCategory[c.id] ?? 0)
    if (!b && spent === 0 && !c.active) continue
    const alertPct = b?.alertPct ?? ctx.settings.budgetAlertPct
    totalSpent += spent
    let state: BudgetState = 'NO_BUDGET'
    let used: number | null = null
    let expected: number | null = null
    if (b) {
      totalBudget += b.amountCents
      totalSpentBudgeted += spent
      used = b.amountCents > 0 ? spent / b.amountCents : spent > 0 ? Infinity : 0
      expected = Math.round(b.amountCents * elapsed)
      if (spent > b.amountCents) state = 'OVER'
      else if (used * 100 >= alertPct) state = 'ALERT'
      else if (elapsed < 1 && spent > expected * 1.15 && spent > 0) state = 'FAST'
      else state = 'OK'
    }
    lines.push({
      categoryId: c.id,
      budgetCents: b?.amountCents ?? null,
      spentCents: spent,
      remainingCents: b ? b.amountCents - spent : null,
      usedPct: used,
      expectedToDateCents: expected,
      prevAvgCents: prevAvg,
      prevMonthCents: prevMonth,
      alertPct,
      state
    })
  }
  // Gastos sin categoría
  const none = -(cur.expensesByCategory['__none'] ?? 0)
  if (none !== 0) totalSpent += none
  return {
    month,
    elapsedRatio: elapsed,
    lines,
    totalBudgetCents: totalBudget,
    totalSpentBudgetedCents: totalSpentBudgeted,
    totalSpentCents: totalSpent,
    usedPct: totalBudget > 0 ? totalSpentBudgeted / totalBudget : null
  }
}

export const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
  NO_BUDGET: 'Sin presupuesto',
  OK: 'Bien',
  FAST: 'Ritmo alto',
  ALERT: 'Cerca del límite',
  OVER: 'Superado'
}
