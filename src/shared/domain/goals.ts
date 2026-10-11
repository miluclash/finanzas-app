// Objetivos y huchas.
// - Con cuenta vinculada (hucha real): el progreso es el saldo de esa cuenta. No se suman aportaciones aparte.
// - Sin cuenta vinculada: el progreso son las asignaciones (reservas) registradas en la app.
// El dinero reservado sigue siendo patrimonio; solo deja de estar "disponible" si está en una cuenta líquida.
import { addMonthsToMonth, monthOf, monthsBetween } from '../dates'
import type { Goal, ISODate } from '../types'
import { accountRole, type Ctx } from './ctx'
import { accountBalance } from './ledger'

export type GoalHealth = 'FUNDED' | 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'NO_TARGET' | 'INACTIVE' | 'COMPLETED'

export interface GoalProgress {
  goalId: string
  currentCents: number
  /** Parte del objetivo que reduce el dinero disponible (reservas en cuentas líquidas). */
  reservedFromAvailableCents: number
  remainingCents: number | null
  progress: number | null
  surplusCents: number
  monthsLeft: number | null
  monthlyNeededCents: number | null
  /** Ritmo medio de aportación en los últimos 3 meses. */
  paceMonthlyCents: number
  projectedDate: ISODate | null
  health: GoalHealth
}

function allocationsOf(ctx: Ctx, goalId: string) {
  return ctx.allocations.filter((a) => a.goalId === goalId)
}

export function goalProgress(ctx: Ctx, g: Goal): GoalProgress {
  const today = ctx.today
  let current = 0
  let reserved = 0
  let pace = 0
  const threeMonthsAgo = `${addMonthsToMonth(monthOf(today), -3)}-01`
  if (g.linkedAccountId) {
    const acc = ctx.accountById.get(g.linkedAccountId)
    current = accountBalance(ctx, g.linkedAccountId, today)
    if (acc && accountRole(acc) === 'LIQUID') reserved = Math.max(current, 0)
    // ritmo: entradas netas por transferencia a la hucha en los últimos 3 meses
    let inflow = 0
    for (const t of ctx.countedByAccount.get(g.linkedAccountId) ?? []) {
      if (t.date >= threeMonthsAgo && t.date <= today && t.type === 'TRANSFER') inflow += t.amountCents
    }
    pace = Math.round(inflow / 3)
  } else {
    let allocated = 0
    let reservedLiquid = 0
    let recent = 0
    for (const a of allocationsOf(ctx, g.id)) {
      if (a.date > today) continue
      allocated += a.amountCents
      const acc = ctx.accountById.get(a.accountId)
      if (acc && accountRole(acc) === 'LIQUID') reservedLiquid += a.amountCents
      if (a.date >= threeMonthsAgo) recent += a.amountCents
    }
    // Gastos pagados con cargo al objetivo consumen la reserva (no el progreso)
    let spent = 0
    for (const t of ctx.counted) {
      if (t.goalId !== g.id || t.date > today) continue
      if (t.type === 'EXPENSE' || t.type === 'REFUND') {
        spent += t.amountCents
        const acc = ctx.accountById.get(t.accountId)
        if (acc && accountRole(acc) === 'LIQUID') reservedLiquid += t.amountCents
      }
    }
    current = allocated
    reserved = Math.max(reservedLiquid, 0)
    pace = Math.round(recent / 3)
    void spent
  }
  const active = g.status === 'ACTIVE'
  if (!active) reserved = g.status === 'PAUSED' ? reserved : 0

  const target = g.targetCents
  const remaining = target !== null ? Math.max(target - current, 0) : null
  const progress = target ? Math.min(Math.max(current / target, 0), 1) : null
  const surplus = target !== null ? Math.max(current - target, 0) : 0
  let monthsLeft: number | null = null
  if (g.deadline) monthsLeft = Math.max(monthsBetween(monthOf(today), monthOf(g.deadline)), 0)
  const monthlyNeeded =
    remaining === null ? null : remaining === 0 ? 0 : monthsLeft === null ? null : Math.ceil(remaining / Math.max(monthsLeft, 1))
  const plannedPace = g.plannedMonthlyCents ?? 0
  const effectivePace = Math.max(pace, plannedPace)
  let projectedDate: ISODate | null = null
  if (remaining !== null && remaining > 0 && effectivePace > 0) {
    const months = Math.ceil(remaining / effectivePace)
    projectedDate = `${addMonthsToMonth(monthOf(today), months)}-01`
  }
  let health: GoalHealth
  if (g.status === 'COMPLETED') health = 'COMPLETED'
  else if (!active) health = 'INACTIVE'
  else if (target === null) health = 'NO_TARGET'
  else if (remaining === 0) health = 'FUNDED'
  else if (g.deadline && g.deadline < today) health = 'OVERDUE'
  else if (monthlyNeeded !== null && effectivePace < monthlyNeeded) health = 'AT_RISK'
  else health = 'ON_TRACK'
  return {
    goalId: g.id,
    currentCents: current,
    reservedFromAvailableCents: reserved,
    remainingCents: remaining,
    progress,
    surplusCents: surplus,
    monthsLeft,
    monthlyNeededCents: monthlyNeeded,
    paceMonthlyCents: pace,
    projectedDate,
    health
  }
}

export const GOAL_HEALTH_LABEL: Record<GoalHealth, string> = {
  FUNDED: 'Completo',
  ON_TRACK: 'En camino',
  AT_RISK: 'Con retraso',
  OVERDUE: 'Vencido',
  NO_TARGET: 'Sin cantidad objetivo',
  INACTIVE: 'Inactivo',
  COMPLETED: 'Cerrado'
}
