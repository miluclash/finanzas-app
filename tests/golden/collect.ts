// Colector del test dorado de finanzas: recoge TODAS las cifras que la app enseña, en forma canónica,
// para poder compararlas antes y después de cada refactorización. No modifica la base de datos.
import Decimal from 'decimal.js'
import { computeAlerts } from '../../src/shared/domain/dashboard'
import { availableCash } from '../../src/shared/domain/available'
import { goalProgress } from '../../src/shared/domain/goals'
import {
  cashEffects,
  computeHoldings,
  contributedTo,
  holdingsValueByAccount,
  investmentAccountIds,
  investmentSeries,
  portfolioSummary
} from '../../src/shared/domain/investments'
import { DEFAULT_PLAN, nextExecutionDate, splitContribution } from '../../src/shared/domain/investmentPlan'
import { allBalances, effectiveNature, liquidityAt, positionAt, trackedMonths } from '../../src/shared/domain/ledger'
import { matchOccurrences, pendingOccurrences, ruleStatus, suggestRule } from '../../src/shared/domain/recurring'
import { allDuplicatePairs } from '../../src/shared/domain/validation'
import { addDays, monthEnd, monthOf } from '../../src/shared/dates'
import { createHandlers, type DialogProvider } from '../../src/main/services/api'
import type { AppState } from '../../src/main/services/state'

/** Diálogos falsos: las lecturas que se recogen nunca los usan. */
const noDialogs: DialogProvider = {
  openFile: async () => null,
  saveFile: async () => null,
  openDir: async () => null,
  showItem: () => undefined,
  openPath: () => undefined
}

// ---------- Normalización canónica ----------

/** Convierte cualquier valor en JSON canónico: claves ordenadas, Map/Set/Decimal/Date normalizados. */
export function canon(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (Decimal.isDecimal(v)) return (v as Decimal).toString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN'
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity'
    return v === 0 ? 0 : v
  }
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'function' || typeof v === 'symbol') return null
  if (v instanceof Map) return [...v.entries()].map(([k, val]) => [canon(k), canon(val)])
  if (v instanceof Set) return [...v.values()].map(canon).sort((a, b) => cmp(JSON.stringify(a), JSON.stringify(b)))
  if (Array.isArray(v)) return v.map(canon)
  const o = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort(cmp)) {
    if (o[k] === undefined || typeof o[k] === 'function') continue
    out[k] = canon(o[k])
  }
  return out
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function str(v: unknown): string {
  return JSON.stringify(canon(v))
}

// ---------- Colector ----------

type Out = Record<string, unknown>

export function collectGolden(s: AppState, todays: string[]): Record<string, unknown> {
  const out: Out = {}
  const h = createHandlers(s, noDialogs, '0.0.0')
  const saved = s.todayOverride
  try {
    for (const today of todays) {
      s.todayOverride = today
      collectOne(s, h, today, out)
    }
  } finally {
    s.todayOverride = saved
  }
  // orden alfabético de claves de primer nivel
  const sorted: Out = {}
  for (const k of Object.keys(out).sort(cmp)) sorted[k] = canon(out[k])
  return sorted
}

function collectOne(s: AppState, h: ReturnType<typeof createHandlers>, today: string, out: Out): void {
  const put = (key: string, fn: () => unknown): void => {
    const k = `${today}|${key}`
    try {
      out[k] = fn()
    } catch (e) {
      // un fallo también es un resultado: se congela el mensaje
      out[k] = { __error: e instanceof Error ? e.message : String(e) }
    }
  }
  s.todayOverride = today
  const ctx = s.ctx()
  const months = trackedMonths(ctx)

  // ----- A través de los handlers (lo que ve la interfaz) -----
  put('catalog.get', () => h['catalog.get']())
  put('accounts.list', () => h['accounts.list']())
  for (const a of ctx.accounts) put(`accounts.reconciliations@${a.id}`, () => h['accounts.reconciliations'](a.id))
  for (const c of ctx.categories) put(`categories.usage@${c.id}`, () => h['categories.usage'](c.id))
  put('tx.list', () => h['tx.list']({}))
  // variantes pequeñas: ejercitan filtros y ordenaciones sin duplicar todo el libro
  put('tx.list@cancelled', () => h['tx.list']({ status: 'CANCELLED' }))
  put('tx.list@refunds', () => h['tx.list']({ type: 'REFUND', sort: 'amount', dir: 'asc' }))
  put('tx.list@extraordinary', () => h['tx.list']({ nature: 'EXTRAORDINARY' }))
  put('tx.list@search', () => h['tx.list']({ search: 'cafe', includeCancelled: true }))
  put('tx.list@2026-10', () => h['tx.list']({ month: '2026-10', onlyIssues: true, limit: 5, offset: 1 }))
  put('tx.reviewQueue', () => h['tx.reviewQueue']())
  put('dashboard.get', () => h['dashboard.get']())
  for (const m of months) put(`dashboard.get@${m}`, () => h['dashboard.get'](m))
  put('alerts.get', () => h['alerts.get']())
  put('monthly.summaries@120', () => h['monthly.summaries'](120))
  put('networth.series', () => h['networth.series']())
  for (const m of months) put(`budgets.report@${m}`, () => h['budgets.report'](m))
  put('recurring.list', () => h['recurring.list']())
  put('goals.list', () => h['goals.list']())
  put('forecast.run@12', () => h['forecast.run'](12))
  put('forecast.run@24', () => h['forecast.run'](24))
  put('inv.overview', () => h['inv.overview']())
  put('inv.plan', () => h['inv.plan']())
  put('inv.ops', () => h['inv.ops']())
  put('inv.prices', () => h['inv.prices']())

  // ----- Dominio directo (fechas pasadas y piezas que los handlers no exponen sueltas) -----
  put('trackedMonths', () => months)
  put('computeAlerts', () => computeAlerts(ctx))
  for (const m of months) {
    const end = monthEnd(m)
    put(`allBalances@${end}`, () => allBalances(ctx, end))
    put(`positionAt@${end}`, () => positionAt(ctx, end))
    put(`liquidityAt@${end}`, () => liquidityAt(ctx, end))
    put(`portfolioSummary@${end}`, () => portfolioSummary(ctx, end))
    put(`holdingsValueByAccount@${end}`, () => holdingsValueByAccount(ctx, end))
    put(`contributedTo@${end}`, () => contributedTo(ctx, investmentAccountIds(ctx), end))
  }
  const first = months[0]
  if (first) put(`investmentSeries@${first}`, () => investmentSeries(ctx, first))
  put('availableCash', () => availableCash(ctx))
  for (const g of ctx.goals) put(`goalProgress@${g.id}`, () => goalProgress(ctx, g))
  const monthStart = `${monthOf(today)}-01`
  for (const r of ctx.recurring) {
    put(`ruleStatus@${r.id}`, () => ruleStatus(ctx, r))
    put(`matchOccurrences@${r.id}`, () => matchOccurrences(ctx, r, r.startDate ?? addDays(today, -400), addDays(today, 400)))
    put(`pendingOccurrences@${r.id}`, () => pendingOccurrences(ctx, r, monthStart, monthEnd(monthOf(today))))
  }
  put('allDuplicatePairs', () => allDuplicatePairs(ctx))
  put('suggestRule', () =>
    ctx.transactions
      .filter((t) => t.type === 'INCOME' || t.type === 'EXPENSE')
      .map((t) => [t.id, suggestRule(ctx, t)?.id ?? null])
  )
  put('effectiveNature', () =>
    ctx.transactions.filter((t) => t.type === 'EXPENSE' || t.type === 'REFUND').map((t) => [t.id, effectiveNature(ctx, t)])
  )
  put('computeHoldings@AVERAGE', () => computeHoldings(ctx.ops, ctx.prices, 'AVERAGE', today))
  put('computeHoldings@FIFO', () => computeHoldings(ctx.ops, ctx.prices, 'FIFO', today))
  put('cashEffects', () => ctx.ops.map((op) => [op.id, cashEffects(op, ctx.instrumentById.get(op.instrumentId ?? '')?.name ?? '')]))
  const plan = ctx.settings.investmentPlan
  put('nextExecutionDate', () => nextExecutionDate(plan ?? DEFAULT_PLAN, today))
  if (plan) {
    const summary = portfolioSummary(ctx)
    for (const cents of [10000, 50000, 123457]) put(`splitContribution@${cents}`, () => splitContribution(ctx, plan, cents, summary))
  }
}

// ---------- Comparación ----------

/** Claves de primer nivel que faltan, sobran o cuyo valor canónico difiere. Solo nombres, nunca valores. */
export function diffGolden(expected: Record<string, unknown>, actual: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  const bad: string[] = []
  for (const k of keys) {
    const inE = Object.prototype.hasOwnProperty.call(expected, k)
    const inA = Object.prototype.hasOwnProperty.call(actual, k)
    if (inE !== inA || str(expected[k]) !== str(actual[k])) bad.push(k)
  }
  return bad.sort(cmp)
}
