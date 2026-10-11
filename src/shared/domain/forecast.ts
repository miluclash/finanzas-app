// Previsión de caja a 12 meses. Son estimaciones, no certezas: cada supuesto queda listado.
import { addMonthsToMonth, monthEnd, monthOf, monthStart } from '../dates'
import { formatEur } from '../money'
import type { MonthKey, Scenario } from '../types'
import { accountRole, type Ctx } from './ctx'
import { goalProgress } from './goals'
import { effectiveNature, liquidityAt } from './ledger'
import { matchOccurrences, signedAmount } from './recurring'

export interface ForecastRow {
  month: MonthKey
  startCents: number
  incomeCents: number
  fixedCents: number
  transfersCents: number
  variableCents: number
  goalsCents: number
  netCents: number
  endCents: number
  belowMinimum: boolean
}

export interface ForecastResult {
  scenario: Scenario
  startCashCents: number
  rows: ForecastRow[]
  minEndCents: number
  minMonth: MonthKey | null
  riskMonths: MonthKey[]
  endCents: number
  assumptions: string[]
}

function factor(s: string): number {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : 1
}

export function forecast(ctx: Ctx, scenario: Scenario, months = 12): ForecastResult {
  const today = ctx.today
  const curMonth = monthOf(today)
  const fi = factor(scenario.incomeFactor)
  const fe = factor(scenario.expenseFactor)
  const assumptions: string[] = []

  // Punto de partida: liquidez de hoy menos lo ya reservado para objetivos en cuentas líquidas
  const liquidity = liquidityAt(ctx, today)
  let reserved = 0
  for (const g of ctx.goals) if (g.status === 'ACTIVE') reserved += goalProgress(ctx, g).reservedFromAvailableCents
  const start = liquidity - reserved
  assumptions.push(
    `Punto de partida: liquidez de hoy (${formatEur(liquidity)}) menos reservas para objetivos en cuentas líquidas (${formatEur(reserved)}).`
  )
  assumptions.push(
    `Escenario "${scenario.name}": ingresos × ${fi.toString().replace('.', ',')}, gastos × ${fe.toString().replace('.', ',')}.`
  )
  assumptions.push(
    `Gasto variable de ${formatEur(scenario.variableMonthlyCents)} al mes (× factor de gastos). En el mes en curso solo cuenta lo que falta por gastar.`
  )
  assumptions.push('Los ingresos y cargos recurrentes ya registrados como movimiento no se vuelven a contar.')
  assumptions.push('Las transferencias recurrentes a huchas o inversión restan caja; no son gasto.')
  const hasInvestPlan = ctx.recurring.some((r) => {
    if (!r.active || r.kind !== 'TRANSFER' || !r.toAccountId) return false
    const to = ctx.accountById.get(r.toAccountId)
    return !!to && accountRole(to) === 'INVESTMENT'
  })
  if (!hasInvestPlan)
    assumptions.push(
      'No hay aportaciones periódicas a inversión configuradas: si inviertes cada mes, créalo en Recurrentes como transferencia a tu cuenta de bróker.'
    )

  // Gasto variable ya hecho este mes (cuentas líquidas, no fijo, no extraordinario)
  let variableSpentThisMonth = 0
  for (const t of ctx.counted) {
    if (monthOf(t.date) !== curMonth) continue
    if (t.type !== 'EXPENSE' && t.type !== 'REFUND') continue
    const acc = ctx.accountById.get(t.accountId)
    if (!acc || accountRole(acc) !== 'LIQUID') continue
    if (effectiveNature(ctx, t) === 'VARIABLE') variableSpentThisMonth += -t.amountCents
  }

  const undatedRules = ctx.recurring.filter((r) => r.active && !r.startDate && r.frequency !== 'ONE_OFF')
  if (undatedRules.length)
    assumptions.push(
      `Reglas sin fecha (${undatedRules.map((r) => r.concept).join(', ')}): se cuenta su equivalente mensual cada mes.`
    )

  // Objetivos con aportación mensual prevista (sin transferencia recurrente propia)
  const goalPlans = ctx.goals
    .filter((g) => g.status === 'ACTIVE' && (g.plannedMonthlyCents ?? 0) > 0)
    .map((g) => {
      const p = goalProgress(ctx, g)
      const hasTransferRule =
        !!g.linkedAccountId && ctx.recurring.some((r) => r.active && r.kind === 'TRANSFER' && r.toAccountId === g.linkedAccountId)
      return { g, remaining: p.remainingCents, skip: hasTransferRule }
    })
  for (const gp of goalPlans) {
    if (gp.skip)
      assumptions.push(`"${gp.g.name}": su aportación ya está como transferencia recurrente; no se cuenta dos veces.`)
    else
      assumptions.push(
        `"${gp.g.name}": se apartan ${formatEur(gp.g.plannedMonthlyCents)} al mes hasta completarlo${gp.g.deadline ? ' o hasta su fecha límite' : ''}.`
      )
  }

  const rows: ForecastRow[] = []
  let cash = start
  const remainingByGoal = new Map(goalPlans.map((gp) => [gp.g.id, gp.remaining ?? Infinity]))
  for (let i = 0; i < months; i++) {
    const m = addMonthsToMonth(curMonth, i)
    const from = monthStart(m)
    const to = monthEnd(m)
    let income = 0
    let fixed = 0
    let transfers = 0
    for (const r of ctx.recurring) {
      if (!r.active) continue
      if (r.endDate && r.endDate < from) continue
      const fromAcc = ctx.accountById.get(r.accountId)
      if (!fromAcc) continue
      const fromLiquid = accountRole(fromAcc) === 'LIQUID'
      const toAcc = r.toAccountId ? ctx.accountById.get(r.toAccountId) : undefined
      const toLiquid = !!toAcc && accountRole(toAcc) === 'LIQUID'
      let count = 0
      if (!r.startDate) {
        if (r.frequency === 'ONE_OFF') continue
        // regla sin fecha: equivalente mensual cada mes
        const eq =
          r.frequency === 'WEEKLY' ? 52 / 12 : r.frequency === 'MONTHLY' ? 1 : r.frequency === 'QUARTERLY' ? 1 / 3 : 1 / 12
        count = eq
        if (i === 0) {
          // si ya hay un movimiento que encaja este mes, no se vuelve a contar
          const lo = r.minCents ?? Math.round(r.amountCents * 0.85)
          const hi = r.maxCents ?? Math.round(r.amountCents * 1.15)
          const hit = ctx.counted.some(
            (t) =>
              monthOf(t.date) === m &&
              (t.recurringId === r.id ||
                (!t.recurringId &&
                  !!r.categoryId &&
                  t.accountId === r.accountId &&
                  t.categoryId === r.categoryId &&
                  Math.abs(t.amountCents) >= lo &&
                  Math.abs(t.amountCents) <= hi))
          )
          if (hit) count = 0
        }
      } else {
        count = matchOccurrences(ctx, r, from, to).filter((o) => !o.matchedTxId).length
      }
      if (!count) continue
      const amt = Math.round(signedAmount(r) * count)
      if (r.kind === 'INCOME') {
        if (fromLiquid) income += Math.round(amt * fi)
      } else if (r.kind === 'EXPENSE') {
        if (fromLiquid) fixed += Math.round(amt * fe)
      } else {
        // transferencia: solo afecta si cruza la frontera líquido / no líquido
        if (fromLiquid && !toLiquid) transfers += amt
        else if (!fromLiquid && toLiquid) transfers -= amt
      }
    }
    let variable = -Math.round(scenario.variableMonthlyCents * fe)
    if (i === 0) {
      variable = -Math.max(0, Math.round(scenario.variableMonthlyCents * fe) - variableSpentThisMonth)
    }
    let goals = 0
    for (const gp of goalPlans) {
      if (gp.skip) continue
      if (gp.g.deadline && gp.g.deadline < from) continue
      const left = remainingByGoal.get(gp.g.id) ?? 0
      if (left <= 0) continue
      const amt = Math.min(gp.g.plannedMonthlyCents ?? 0, left)
      remainingByGoal.set(gp.g.id, left - amt)
      goals -= amt
    }
    const net = income + fixed + transfers + variable + goals
    const startCents = cash
    cash += net
    rows.push({
      month: m,
      startCents,
      incomeCents: income,
      fixedCents: fixed,
      transfersCents: transfers,
      variableCents: variable,
      goalsCents: goals,
      netCents: net,
      endCents: cash,
      belowMinimum: cash < ctx.settings.minLiquidityCents
    })
  }
  let minEnd = Infinity
  let minMonth: MonthKey | null = null
  for (const r of rows)
    if (r.endCents < minEnd) {
      minEnd = r.endCents
      minMonth = r.month
    }
  return {
    scenario,
    startCashCents: start,
    rows,
    minEndCents: minEnd === Infinity ? start : minEnd,
    minMonth,
    riskMonths: rows.filter((r) => r.belowMinimum).map((r) => r.month),
    endCents: cash,
    assumptions
  }
}
