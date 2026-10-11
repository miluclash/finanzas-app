// Agregados para el panel principal y la bandeja de alertas.
import { addDays, addMonthsToMonth, formatDate, formatMonth, monthOf } from '../dates'
import { formatEur } from '../money'
import type { MonthKey, Transaction } from '../types'
import { availableCash, type AvailableCash } from './available'
import { budgetReport } from './budgets'
import type { Ctx } from './ctx'
import { forecast } from './forecast'
import { goalProgress, type GoalProgress } from './goals'
import { allBalances, monthSummaries, positionAt, type MonthSummary, type PositionSummary } from './ledger'
import { portfolioSummary } from './investments'
import { monthlyEquivalent, pendingOccurrences, ruleStatus, signedAmount } from './recurring'
import { allDuplicatePairs, transactionIssues } from './validation'

export interface Alert {
  level: 'info' | 'warn' | 'error'
  text: string
  link?: string
}

export interface UpcomingItem {
  date: string
  ruleId: string
  concept: string
  amountCents: number
  accountId: string
}

export interface DashboardData {
  month: MonthKey
  position: PositionSummary
  available: AvailableCash
  summary: MonthSummary
  prevSummary: MonthSummary
  series: MonthSummary[]
  recurringMonthlyCents: number
  budgetUsedPct: number | null
  budgetTotalCents: number
  goals: Array<{ goalId: string; name: string; progress: GoalProgress; priority: string }>
  recent: Transaction[]
  upcoming: UpcomingItem[]
  alerts: Alert[]
  investmentsValueCents: number
}

export function computeAlerts(ctx: Ctx): Alert[] {
  const alerts: Alert[] = []
  const pending = ctx.transactions.filter((t) => t.status === 'PENDING_REVIEW').length
  if (pending) alerts.push({ level: 'warn', text: `${pending} movimiento(s) pendientes de revisar.`, link: '/movimientos?vista=revision' })
  let withErrors = 0
  for (const t of ctx.transactions) if (transactionIssues(ctx, t).errors.length) withErrors++
  if (withErrors) alerts.push({ level: 'error', text: `${withErrors} movimiento(s) con datos incorrectos.`, link: '/movimientos?vista=revision' })
  const dups = allDuplicatePairs(ctx).length
  if (dups) alerts.push({ level: 'warn', text: `${dups} posible(s) duplicado(s) por revisar.`, link: '/movimientos?vista=revision' })
  for (const b of allBalances(ctx)) {
    const acc = ctx.accountById.get(b.accountId)!
    if (!acc.active) continue
    if (b.lastReconciliation && b.lastReconciliation.differenceCents !== 0)
      alerts.push({
        level: 'error',
        text: `${acc.name}: el saldo calculado al ${formatDate(b.lastReconciliation.date)} difiere ${formatEur(b.lastReconciliation.differenceCents, { sign: true })} del banco.`,
        link: '/cuentas'
      })
    else if (b.reconciliationStale)
      alerts.push({ level: 'info', text: `${acc.name}: sin verificar con el banco en los últimos ${ctx.settings.verifyStaleDays} días.`, link: '/cuentas' })
  }
  const month = monthOf(ctx.today)
  const br = budgetReport(ctx, month)
  for (const l of br.lines) {
    const cat = ctx.categoryById.get(l.categoryId)
    if (l.state === 'OVER') alerts.push({ level: 'error', text: `Presupuesto superado en ${cat?.name}.`, link: '/presupuestos' })
    else if (l.state === 'ALERT') alerts.push({ level: 'warn', text: `${cat?.name}: llevas el ${Math.round((l.usedPct ?? 0) * 100)} % del presupuesto.`, link: '/presupuestos' })
  }
  for (const g of ctx.goals) {
    if (g.status !== 'ACTIVE') continue
    const p = goalProgress(ctx, g)
    if (p.health === 'OVERDUE') alerts.push({ level: 'error', text: `Objetivo "${g.name}" vencido sin completar.`, link: '/objetivos' })
    else if (p.health === 'AT_RISK')
      alerts.push({ level: 'warn', text: `Objetivo "${g.name}" con retraso: necesita ${formatEur(p.monthlyNeededCents)} al mes.`, link: '/objetivos' })
  }
  const av = availableCash(ctx)
  if (av.availableCents < 0) alerts.push({ level: 'error', text: 'El dinero disponible es negativo.', link: '/' })
  else if (av.belowMinimum)
    alerts.push({ level: 'warn', text: `El dinero disponible está por debajo de tu mínimo (${formatEur(ctx.settings.minLiquidityCents)}).`, link: '/' })
  const sc = ctx.scenarios.find((s) => s.id === ctx.settings.forecastScenarioId) ?? ctx.scenarios[0]
  if (sc) {
    const fc = forecast(ctx, sc)
    if (fc.riskMonths.length)
      alerts.push({ level: 'warn', text: `La previsión (${sc.name}) baja del mínimo de liquidez en ${formatMonth(fc.riskMonths[0])}.`, link: '/prevision' })
  }
  for (const r of ctx.recurring) {
    const st = ruleStatus(ctx, r)
    if (st.overdue.length)
      alerts.push({ level: 'info', text: `"${r.concept}" previsto el ${formatDate(st.overdue[st.overdue.length - 1])} y sin movimiento registrado.`, link: '/recurrentes' })
  }
  if (ctx.ops.length) for (const a of portfolioSummary(ctx).alerts) alerts.push({ level: a.level, text: a.text, link: '/inversiones' })
  return alerts
}

export function dashboardData(ctx: Ctx, month: MonthKey = monthOf(ctx.today)): DashboardData {
  const months: MonthKey[] = []
  for (let i = 11; i >= 0; i--) months.push(addMonthsToMonth(month, -i))
  const sums = monthSummaries(ctx, months)
  const series = months.map((m) => sums.get(m)!).filter((s) => s.month >= monthOf(ctx.settings.trackingStart) || s.txCount > 0)
  const summary = sums.get(month)!
  const prevSummary = sums.get(addMonthsToMonth(month, -1))!
  const position = positionAt(ctx, ctx.today)
  const br = budgetReport(ctx, month)
  const goals = ctx.goals
    .filter((g) => g.status === 'ACTIVE')
    .map((g) => ({ goalId: g.id, name: g.name, progress: goalProgress(ctx, g), priority: g.priority }))
    .sort((a, b) => {
      const pr = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>
      return pr[a.priority] - pr[b.priority]
    })
  const recent = [...ctx.transactions]
    .filter((t) => t.status !== 'CANCELLED')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))
    .slice(0, 8)
  const upcoming: UpcomingItem[] = []
  const horizon = addDays(ctx.today, 30)
  for (const r of ctx.recurring) {
    if (!r.active) continue
    for (const d of pendingOccurrences(ctx, r, ctx.today, horizon))
      upcoming.push({ date: d, ruleId: r.id, concept: r.concept, amountCents: signedAmount(r), accountId: r.accountId })
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : 1))
  const recurringMonthly = ctx.recurring
    .filter((r) => r.active && r.kind === 'EXPENSE' && (!r.endDate || r.endDate >= ctx.today))
    .reduce((s, r) => s + monthlyEquivalent(r), 0)
  return {
    month,
    position,
    available: availableCash(ctx),
    summary,
    prevSummary,
    series,
    recurringMonthlyCents: recurringMonthly,
    budgetUsedPct: br.usedPct,
    budgetTotalCents: br.totalBudgetCents,
    goals,
    recent,
    upcoming: upcoming.slice(0, 8),
    alerts: computeAlerts(ctx),
    investmentsValueCents: position.investmentsCents
  }
}
