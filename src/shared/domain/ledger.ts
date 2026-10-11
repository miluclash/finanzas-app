// Saldos, resúmenes mensuales, patrimonio y liquidez. Funciones puras sobre el contexto.
import { addMonthsToMonth, monthEnd, monthOf } from '../dates'
import type { ISODate, MonthKey, Nature, Transaction } from '../types'
import { accountRole, categoryKind, type Ctx } from './ctx'
import { holdingsValueByAccount } from './investments'

/** Saldo de efectivo de una cuenta: saldo inicial + movimientos que cuentan hasta `asOf` (incluido). */
export function accountCashBalance(ctx: Ctx, accountId: string, asOf?: ISODate): number {
  const acc = ctx.accountById.get(accountId)
  if (!acc) return 0
  if (asOf && asOf < acc.openingDate) return 0
  let total = acc.openingBalanceCents
  for (const t of ctx.countedByAccount.get(accountId) ?? []) {
    if (asOf && t.date > asOf) break
    total += t.amountCents
  }
  return total
}

/** Saldo total de la cuenta: efectivo + valor de mercado de las posiciones (cuentas de inversión). */
export function accountBalance(ctx: Ctx, accountId: string, asOf?: ISODate): number {
  const cash = accountCashBalance(ctx, accountId, asOf)
  const holdings = holdingsValueByAccount(ctx, asOf ?? ctx.today).get(accountId) ?? 0
  return cash + holdings
}

export interface AccountBalanceRow {
  accountId: string
  cashCents: number
  holdingsCents: number
  balanceCents: number
  lastReconciliation: { date: ISODate; bankBalanceCents: number; differenceCents: number } | null
  /** Diferencia entre lo calculado HOY a la fecha de la última conciliación y lo que dijo el banco ese día. */
  reconciliationStale: boolean
}

export function allBalances(ctx: Ctx, asOf?: ISODate): AccountBalanceRow[] {
  const date = asOf ?? ctx.today
  const holdings = holdingsValueByAccount(ctx, date)
  return ctx.accounts.map((a) => {
    const cash = accountCashBalance(ctx, a.id, date)
    const h = holdings.get(a.id) ?? 0
    const recs = ctx.reconciliations
      .filter((r) => r.accountId === a.id)
      .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.createdAt < y.createdAt ? 1 : -1))
    const last = recs[0]
    let lastReconciliation: AccountBalanceRow['lastReconciliation'] = null
    let stale = false
    if (last) {
      const computedAtDate = accountCashBalance(ctx, a.id, last.date) + (holdingsValueByAccount(ctx, last.date).get(a.id) ?? 0)
      lastReconciliation = {
        date: last.date,
        bankBalanceCents: last.bankBalanceCents,
        differenceCents: computedAtDate - last.bankBalanceCents
      }
      const days = (Date.parse(ctx.today) - Date.parse(last.date)) / 86400000
      stale = days > ctx.settings.verifyStaleDays
    } else {
      stale = a.active
    }
    return {
      accountId: a.id,
      cashCents: cash,
      holdingsCents: h,
      balanceCents: cash + h,
      lastReconciliation,
      reconciliationStale: stale
    }
  })
}

export interface PositionSummary {
  date: ISODate
  netWorthCents: number
  assetsCents: number
  liabilitiesCents: number
  liquidCents: number
  savingsCents: number
  investmentsCents: number
  byAccount: Array<{ accountId: string; balanceCents: number }>
}

/** Patrimonio, liquidez, ahorro e inversiones a una fecha. Usa la configuración de inclusión de cada cuenta. */
export function positionAt(ctx: Ctx, date: ISODate): PositionSummary {
  const holdings = holdingsValueByAccount(ctx, date)
  let assets = 0
  let liabilities = 0
  let liquid = 0
  let savings = 0
  let investments = 0
  const byAccount: PositionSummary['byAccount'] = []
  for (const a of ctx.accounts) {
    if (date < a.openingDate) continue
    const bal = accountCashBalance(ctx, a.id, date) + (holdings.get(a.id) ?? 0)
    byAccount.push({ accountId: a.id, balanceCents: bal })
    if (!a.includeNetWorth) continue
    const role = accountRole(a)
    if (role === 'LIABILITY') {
      liabilities += bal
      continue
    }
    assets += bal
    if (role === 'LIQUID') liquid += bal
    else if (role === 'INVESTMENT') investments += bal
    else savings += bal
  }
  return {
    date,
    netWorthCents: assets + liabilities,
    assetsCents: assets,
    liabilitiesCents: liabilities,
    liquidCents: liquid,
    savingsCents: savings,
    investmentsCents: investments,
    byAccount
  }
}

/** Liquidez: suma de cuentas marcadas como líquidas (aunque no cuenten para patrimonio). */
export function liquidityAt(ctx: Ctx, date: ISODate): number {
  let total = 0
  for (const a of ctx.accounts) {
    if (!a.includeLiquidity || a.type === 'LIABILITY') continue
    total += accountBalance(ctx, a.id, date)
  }
  return total
}

/** Naturaleza efectiva de un gasto: la marcada, la del gasto enlazado, recurrente = fijo, o la de la categoría. */
export function effectiveNature(ctx: Ctx, t: Transaction): Nature {
  if (t.nature) return t.nature
  if (t.type === 'REFUND' && t.linkedTxId) {
    const orig = ctx.txById.get(t.linkedTxId)
    if (orig && orig.id !== t.id) return effectiveNature(ctx, orig)
  }
  if (t.recurringId) return 'FIXED'
  const cat = t.categoryId ? ctx.categoryById.get(t.categoryId) : undefined
  return cat?.defaultNature ?? 'VARIABLE'
}

export const NO_GROUP = '__none'

export interface MonthSummary {
  month: MonthKey
  incomeCents: number
  /** Gastos netos (negativos) por grupo de categoría. Clave NO_GROUP = sin categoría. */
  expensesByGroup: Record<string, number>
  expensesByCategory: Record<string, number>
  totalExpensesCents: number
  netCashFlowCents: number
  toSavingsCents: number
  toInvestmentsCents: number
  savingsRate: number | null
  fixedCents: number
  variableCents: number
  extraordinaryCents: number
  /** Tasa de ahorro sin contar gastos extraordinarios. */
  savingsRateOrdinary: number | null
  txCount: number
}

function emptySummary(month: MonthKey): MonthSummary {
  return {
    month,
    incomeCents: 0,
    expensesByGroup: {},
    expensesByCategory: {},
    totalExpensesCents: 0,
    netCashFlowCents: 0,
    toSavingsCents: 0,
    toInvestmentsCents: 0,
    savingsRate: null,
    fixedCents: 0,
    variableCents: 0,
    extraordinaryCents: 0,
    savingsRateOrdinary: null,
    txCount: 0
  }
}

/**
 * Resumen mensual con criterio de caja (fecha del apunte).
 * - Ingresos: tipo INCOME.
 * - Gastos: EXPENSE + REFUND (los reembolsos restan de su categoría).
 * - Transferencias, compras/ventas de inversión y ajustes NO son ingreso ni gasto.
 * - A ahorro / a inversión: entradas netas por transferencia en cuentas de ahorro / inversión.
 */
export function monthSummaries(ctx: Ctx, months: MonthKey[]): Map<MonthKey, MonthSummary> {
  const set = new Set(months)
  const out = new Map<MonthKey, MonthSummary>()
  for (const m of months) out.set(m, emptySummary(m))
  for (const t of ctx.counted) {
    const m = monthOf(t.date)
    if (!set.has(m)) continue
    const s = out.get(m)!
    s.txCount++
    const acc = ctx.accountById.get(t.accountId)!
    const role = accountRole(acc)
    switch (t.type) {
      case 'INCOME':
        s.incomeCents += t.amountCents
        break
      case 'EXPENSE':
      case 'REFUND': {
        const cat = t.categoryId ? ctx.categoryById.get(t.categoryId) : undefined
        const gid = cat?.groupId ?? NO_GROUP
        s.expensesByGroup[gid] = (s.expensesByGroup[gid] ?? 0) + t.amountCents
        const cid = cat?.id ?? NO_GROUP
        s.expensesByCategory[cid] = (s.expensesByCategory[cid] ?? 0) + t.amountCents
        s.totalExpensesCents += t.amountCents
        const nature = effectiveNature(ctx, t)
        if (nature === 'FIXED') s.fixedCents += t.amountCents
        else if (nature === 'EXTRAORDINARY') s.extraordinaryCents += t.amountCents
        else s.variableCents += t.amountCents
        break
      }
      case 'TRANSFER':
        if (role === 'SAVINGS') s.toSavingsCents += t.amountCents
        else if (role === 'INVESTMENT') s.toInvestmentsCents += t.amountCents
        break
      case 'INVESTMENT_BUY':
      case 'INVESTMENT_SELL':
        // Compra/venta desde una cuenta que no es de inversión: aportación/retirada de inversión
        if (role !== 'INVESTMENT') s.toInvestmentsCents -= t.amountCents
        break
      case 'ADJUSTMENT':
        break
    }
  }
  for (const s of out.values()) {
    s.netCashFlowCents = s.incomeCents + s.totalExpensesCents
    s.savingsRate = s.incomeCents > 0 ? s.netCashFlowCents / s.incomeCents : null
    s.savingsRateOrdinary =
      s.incomeCents > 0 ? (s.netCashFlowCents - s.extraordinaryCents) / s.incomeCents : null
  }
  return out
}

export function monthSummary(ctx: Ctx, month: MonthKey): MonthSummary {
  return monthSummaries(ctx, [month]).get(month)!
}

/** Lista de meses desde el inicio del seguimiento (o primer movimiento) hasta el mes actual. */
export function trackedMonths(ctx: Ctx, maxMonths = 120): MonthKey[] {
  let first = monthOf(ctx.settings.trackingStart)
  const firstTx = ctx.counted[0]
  if (firstTx && monthOf(firstTx.date) < first) first = monthOf(firstTx.date)
  const last = monthOf(ctx.today)
  const out: MonthKey[] = []
  let m = first
  while (m <= last && out.length < maxMonths) {
    out.push(m)
    m = addMonthsToMonth(m, 1)
  }
  return out
}

export interface NetWorthPoint extends PositionSummary {
  month: MonthKey
  changeCents: number | null
}

/** Evolución del patrimonio a fin de cada mes (el mes en curso, a hoy). No inventa meses futuros. */
export function netWorthSeries(ctx: Ctx, months?: MonthKey[]): NetWorthPoint[] {
  const ms = months ?? trackedMonths(ctx)
  const out: NetWorthPoint[] = []
  let prev: number | null = null
  for (const m of ms) {
    const end = monthEnd(m)
    const date = end > ctx.today ? ctx.today : end
    const p = positionAt(ctx, date)
    out.push({ ...p, month: m, changeCents: prev === null ? null : p.netWorthCents - prev })
    prev = p.netWorthCents
  }
  return out
}
