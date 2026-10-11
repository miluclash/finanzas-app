// Recurrentes, objetivos, asignaciones, presupuestos y escenarios.
import { budgetReport } from '@shared/domain/budgets'
import { forecast } from '@shared/domain/forecast'
import { goalProgress } from '@shared/domain/goals'
import { ruleStatus } from '@shared/domain/recurring'
import { addMonthsToMonth } from '@shared/dates'
import { AllocationInput, BudgetSetInput, GoalInput, RecurringInput, ScenarioInput } from '@shared/schemas'
import type { Goal, GoalAllocation, MonthKey, RecurringRule, Scenario } from '@shared/types'
import { audit } from '../db/store'
import { insertRow, nextId } from '../db/tables'
import { deleteEntity, parseInput, saveEntity } from './crud'
import { UserError, type AppState } from './state'

// ---------- Recurrentes ----------

export function listRecurring(s: AppState) {
  const ctx = s.ctx()
  return ctx.recurring.map((rule) => ({ rule, status: ruleStatus(ctx, rule) }))
}

export function saveRecurring(s: AppState, input: RecurringInput): RecurringRule {
  const d = parseInput(RecurringInput, input)
  const ctx = s.ctx()
  if (!ctx.accountById.get(d.accountId)) throw new UserError('La cuenta no existe.')
  if (d.kind !== 'TRANSFER' && !d.categoryId) throw new UserError('Elige una categoría.')
  if (d.minCents !== null && d.maxCents !== null && d.minCents > d.maxCents) throw new UserError('El mínimo es mayor que el máximo.')
  return saveEntity<RecurringRule>(
    s,
    'recurring_rules',
    d.id,
    (ex, id, now) => ({
      id,
      concept: d.concept,
      kind: d.kind,
      amountCents: d.amountCents,
      frequency: d.frequency,
      startDate: d.startDate,
      endDate: d.endDate,
      categoryId: d.kind === 'TRANSFER' ? null : d.categoryId,
      accountId: d.accountId,
      toAccountId: d.kind === 'TRANSFER' ? d.toAccountId : null,
      essential: d.essential,
      active: d.active,
      minCents: d.minCents,
      maxCents: d.maxCents,
      notes: d.notes,
      createdAt: ex?.createdAt ?? now,
      updatedAt: now
    }),
    (r) => r.concept
  )
}

export function deleteRecurring(s: AppState, id: string): void {
  // los movimientos enlazados conservan su historial (recurring_id pasa a NULL)
  deleteEntity(s, 'recurring_rules', id)
}

// ---------- Objetivos ----------

export function listGoals(s: AppState) {
  const ctx = s.ctx()
  return ctx.goals.map((goal) => ({
    goal,
    progress: goalProgress(ctx, goal),
    allocations: ctx.allocations.filter((a) => a.goalId === goal.id),
    linkedTxCount: ctx.transactions.filter((t) => t.goalId === goal.id && t.status !== 'CANCELLED').length
  }))
}

export function saveGoal(s: AppState, input: GoalInput): Goal {
  const d = parseInput(GoalInput, input)
  if (d.linkedAccountId) {
    const acc = s.ctx().accountById.get(d.linkedAccountId)
    if (!acc) throw new UserError('La cuenta vinculada no existe.')
    const other = s.ctx().goals.find((g) => g.linkedAccountId === d.linkedAccountId && g.id !== d.id && g.status === 'ACTIVE')
    if (other) throw new UserError(`La cuenta ya está vinculada al objetivo "${other.name}". Una hucha no puede contar para dos objetivos.`)
    if (d.id && s.ctx().allocations.some((a) => a.goalId === d.id))
      throw new UserError('Este objetivo tiene reservas registradas. Bórralas antes de vincularlo a una cuenta para no contar el dinero dos veces.')
  }
  return saveEntity<Goal>(
    s,
    'goals',
    d.id,
    (ex, id, now) => ({
      id,
      name: d.name,
      type: d.type,
      priority: d.priority,
      targetCents: d.targetCents,
      deadline: d.deadline,
      status: d.status,
      linkedAccountId: d.linkedAccountId,
      plannedMonthlyCents: d.plannedMonthlyCents,
      notes: d.notes,
      sortOrder: d.sortOrder ?? ex?.sortOrder ?? 0,
      createdAt: ex?.createdAt ?? now,
      updatedAt: now
    }),
    (g) => g.name
  )
}

export function deleteGoal(s: AppState, id: string): void {
  deleteEntity(s, 'goals', id)
}

export function saveAllocation(s: AppState, input: AllocationInput): GoalAllocation {
  const d = parseInput(AllocationInput, input)
  const ctx = s.ctx()
  const goal = ctx.goals.find((g) => g.id === d.goalId)
  if (!goal) throw new UserError('El objetivo no existe.')
  if (goal.linkedAccountId)
    throw new UserError('Este objetivo tiene una hucha vinculada: su progreso es el saldo de la hucha. Mueve dinero con una transferencia.')
  if (!ctx.accountById.get(d.accountId)) throw new UserError('La cuenta no existe.')
  return saveEntity<GoalAllocation>(
    s,
    'goal_allocations',
    d.id,
    (ex, id, now) => ({
      id,
      goalId: d.goalId,
      date: d.date,
      amountCents: d.amountCents,
      accountId: d.accountId,
      notes: d.notes,
      createdAt: ex?.createdAt ?? now
    }),
    (a) => `${goal.name}: ${a.amountCents / 100} €`
  )
}

export function deleteAllocation(s: AppState, id: string): void {
  deleteEntity(s, 'goal_allocations', id, `Reserva ${id}`)
}

// ---------- Presupuestos ----------

export function getBudgetReport(s: AppState, month: MonthKey) {
  return budgetReport(s.ctx(), month)
}

export function setBudget(s: AppState, input: { month: string; categoryId: string; amountCents?: number | null; alertPct?: number | null }) {
  const d = parseInput(BudgetSetInput, input)
  s.db.tx(() => {
    const ex = s.db.get<{ id: string; amount_cents: number }>('SELECT id, amount_cents FROM budgets WHERE month = ? AND category_id = ?', [
      d.month,
      d.categoryId
    ])
    if (d.amountCents === null || d.amountCents === undefined) {
      if (ex) {
        s.db.run('DELETE FROM budgets WHERE id = ?', [ex.id])
        audit(s.db, 'budgets', ex.id, 'delete', `${d.month} ${d.categoryId}`, ex, null)
      }
      return
    }
    if (d.amountCents < 0) throw new UserError('El presupuesto no puede ser negativo.')
    if (ex) {
      s.db.run('UPDATE budgets SET amount_cents = ?, alert_pct = ? WHERE id = ?', [d.amountCents, d.alertPct ?? null, ex.id])
      audit(s.db, 'budgets', ex.id, 'update', `${d.month} ${d.categoryId}`, ex, d)
    } else {
      const id = nextId(s.db, 'budgets')
      insertRow(s.db, 'budgets', { id, month: d.month, category_id: d.categoryId, amount_cents: d.amountCents, alert_pct: d.alertPct ?? null })
      audit(s.db, 'budgets', id, 'create', `${d.month} ${d.categoryId}`, null, d)
    }
  })
  return budgetReport(s.ctx(), d.month)
}

/** Copia los presupuestos de un mes a otro. Sin `overwrite`, no toca los que ya existan. */
export function copyBudgets(s: AppState, fromMonth: MonthKey, toMonth: MonthKey, overwrite = false): number {
  if (fromMonth === toMonth) throw new UserError('Elige meses distintos.')
  const src = s.db.all<{ category_id: string; amount_cents: number; alert_pct: number | null }>(
    'SELECT category_id, amount_cents, alert_pct FROM budgets WHERE month = ?',
    [fromMonth]
  )
  if (!src.length) throw new UserError('El mes de origen no tiene presupuestos.')
  let n = 0
  s.db.tx(() => {
    for (const b of src) {
      const ex = s.db.get<{ id: string }>('SELECT id FROM budgets WHERE month = ? AND category_id = ?', [toMonth, b.category_id])
      if (ex && !overwrite) continue
      if (ex) s.db.run('UPDATE budgets SET amount_cents = ?, alert_pct = ? WHERE id = ?', [b.amount_cents, b.alert_pct, ex.id])
      else
        insertRow(s.db, 'budgets', {
          id: nextId(s.db, 'budgets'),
          month: toMonth,
          category_id: b.category_id,
          amount_cents: b.amount_cents,
          alert_pct: b.alert_pct
        })
      n++
    }
    audit(s.db, 'budgets', toMonth, 'copy', `${n} presupuestos copiados desde ${fromMonth}`, null, null)
  })
  return n
}

export function previousMonth(m: MonthKey): MonthKey {
  return addMonthsToMonth(m, -1)
}

// ---------- Escenarios y previsión ----------

export function saveScenario(s: AppState, input: ScenarioInput): Scenario {
  const d = parseInput(ScenarioInput, input)
  const f1 = Number(d.incomeFactor)
  const f2 = Number(d.expenseFactor)
  if (!(f1 >= 0 && f1 <= 5) || !(f2 >= 0 && f2 <= 5)) throw new UserError('Los factores deben estar entre 0 y 5.')
  return saveEntity<Scenario>(
    s,
    'scenarios',
    d.id,
    (ex, id) => ({
      id,
      name: d.name,
      incomeFactor: d.incomeFactor,
      expenseFactor: d.expenseFactor,
      variableMonthlyCents: d.variableMonthlyCents,
      notes: d.notes,
      sortOrder: d.sortOrder ?? ex?.sortOrder ?? 0
    }),
    (x) => x.name
  )
}

export function deleteScenario(s: AppState, id: string): void {
  if (s.snap().scenarios.length <= 1) throw new UserError('Tiene que quedar al menos un escenario.')
  deleteEntity(s, 'scenarios', id)
}

export function runForecasts(s: AppState, months = 12) {
  const ctx = s.ctx()
  return ctx.scenarios.map((sc) => forecast(ctx, sc, months))
}
