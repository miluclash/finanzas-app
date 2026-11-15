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
import { addDays, addMonthsToMonth, monthEnd, monthOf } from '../../src/shared/dates'
import { exportJsonObject } from '../../src/main/services/backup'
import type { TxDraft } from '../../src/shared/domain/validation'
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
    return Object.is(v, -0) ? '-0' : v
  }
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'function' || typeof v === 'symbol') return null
  // Map y Set conservan su orden de inserción (forma parte del resultado); undefined dentro de arrays se distingue de null
  if (v instanceof Map) return [...v.entries()].map(([k, val]) => [canonItem(k), canonItem(val)])
  if (v instanceof Set) return [...v.values()].map(canonItem)
  if (Array.isArray(v)) return v.map(canonItem)
  const o = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort(cmp)) {
    if (o[k] === undefined || typeof o[k] === 'function') continue
    out[k] = canon(o[k])
  }
  return out
}

function canonItem(v: unknown): unknown {
  return v === undefined ? '__undefined' : canon(v)
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
    todays.forEach((today, i) => {
      s.todayOverride = today
      collectOne(s, h, today, out, i === 0)
    })
  } finally {
    s.todayOverride = saved
  }
  // orden alfabético de claves de primer nivel
  const sorted: Out = {}
  for (const k of Object.keys(out).sort(cmp)) sorted[k] = out[k]
  return sorted
}

/** Error del propio colector (no del dominio): se propaga, nunca se congela. */
class CollectorError extends Error {}

function collectOne(s: AppState, h: ReturnType<typeof createHandlers>, today: string, out: Out, isFirst: boolean): void {
  const put = (key: string, fn: () => unknown): void => {
    const k = `${today}|${key}`
    try {
      const v = fn()
      if (v && typeof (v as { then?: unknown }).then === 'function')
        throw new CollectorError(`El resultado de ${key.replace(/@.*/, '')} es asíncrono (una promesa): el colector debe adaptarse a la nueva firma.`)
      out[k] = canon(v)
    } catch (e) {
      if (e instanceof CollectorError) throw e
      // un fallo también es un resultado: se congela el mensaje
      out[k] = { __error: e instanceof Error ? e.message : String(e) }
    }
  }
  s.todayOverride = today
  let ctx: ReturnType<AppState['ctx']>
  let months: string[]
  try {
    ctx = s.ctx()
    months = trackedMonths(ctx)
  } catch (e) {
    // el mensaje original podría contener datos: solo el nombre del error
    throw new CollectorError('El colector no ha podido construir el contexto (' + (e instanceof Error ? e.name : typeof e) + ')')
  }

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
  const lastMonth = months[months.length - 1]
  put('tx.list@paginado', () => h['tx.list']({ month: lastMonth, onlyIssues: true, limit: 5, offset: 1 }))
  // tx.get: los movimientos con pareja, enlace o devolución, más uno de cada 5 (regla determinista)
  const refunded = new Set(ctx.transactions.map((x) => x.linkedTxId).filter(Boolean))
  ctx.transactions.forEach((x, i) => {
    if (x.transferId || x.linkedTxId || refunded.has(x.id) || i % 5 === 0) put(`tx.get@${x.id}`, () => h['tx.get'](x.id))
  })
  // tx.suggest: consultas derivadas de los datos; la clave lleva el índice, nunca el texto
  const seenDesc = new Set<string>()
  let q = 0
  for (const x of ctx.transactions) {
    const text = x.description.slice(0, 3).toLowerCase()
    if (text.length < 3 || seenDesc.has(text) || q >= 6) continue
    seenDesc.add(text)
    put(`tx.suggest@${q++}`, () => h['tx.suggest'](text))
  }
  // tx.validate: borradores fijos sobre la primera cuenta y la primera categoría de gasto
  const acc0 = ctx.accounts[0]
  const cat0 = ctx.categories.find((c) => ctx.groupById.get(c.groupId)?.kind === 'EXPENSE')
  if (acc0 && cat0) {
    const base: TxDraft = { id: null, date: today, accountId: acc0.id, description: 'Borrador de prueba', amountCents: -1234, type: 'EXPENSE', categoryId: cat0.id, subcategoryId: null, goalId: null, recurringId: null, linkedTxId: null, status: 'CONFIRMED', transferId: null }
    const existing = ctx.transactions.find((x) => x.type === 'EXPENSE' && x.status !== 'CANCELLED')
    const drafts: TxDraft[] = [
      base,
      existing ? { ...base, accountId: existing.accountId, date: existing.date, amountCents: existing.amountCents, description: existing.description, categoryId: existing.categoryId } : { ...base, amountCents: -999 },
      { ...base, date: addDays(today, 30) },
      { ...base, amountCents: 1234 }
    ]
    drafts.forEach((d, i) => put(`tx.validate@${i}`, () => h['tx.validate'](d)))
  }
  if (months[0]) {
    put(`monthly.summaries@6@${addMonthsToMonth(months[0], 2)}`, () => h['monthly.summaries'](6, addMonthsToMonth(months[0], 2)))
    put(`monthly.summaries@6@${lastMonth}`, () => h['monthly.summaries'](6, lastMonth))
  }
  // exportación JSON en memoria (sin la fecha de exportación); nunca se escribe en disco
  if (isFirst)
    put('exportJsonObject', () => {
      const { exportedAt: _ignored, ...rest } = exportJsonObject(s)
      void _ignored
      return rest
    })
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
    for (const cents of [10000, 50000, 123457])
      put(`splitContribution@${cents}`, () => splitContribution(ctx, plan, cents, portfolioSummary(ctx)))
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
