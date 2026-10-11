// Módulo de inversiones: posiciones, coste, rentabilidad realizada y no realizada, reparto y alertas.
// Cantidades y precios con decimal.js (exactos); los importes finales se redondean a céntimos.
import Decimal from 'decimal.js'
import { addMonthsToMonth, diffDays, monthEnd, monthOf } from '../dates'
import type { AssetClass, CostMethod, ISODate, InvestmentOp, MonthKey, Price } from '../types'
import type { Ctx } from './ctx'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export function dec(v: string | number | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0)
  try {
    return new Decimal(typeof v === 'string' ? v.replace(',', '.') : v)
  } catch {
    return new Decimal(0)
  }
}

export function eurToCents(d: Decimal): number {
  return d.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function centsToEur(c: number): Decimal {
  return new Decimal(c).div(100)
}

export function isValidDecimal(v: string | null | undefined, opts: { positive?: boolean } = {}): boolean {
  if (v === null || v === undefined || v.trim() === '') return false
  try {
    const d = new Decimal(v.trim().replace(',', '.'))
    if (!d.isFinite()) return false
    if (opts.positive && d.lte(0)) return false
    return true
  } catch {
    return false
  }
}

interface Lot {
  qty: Decimal
  price: Decimal
}

export interface Holding {
  key: string
  accountId: string
  instrumentId: string
  units: string
  costBasisCents: number
  avgCost: string | null
  realizedCents: number
  dividendsGrossCents: number
  taxesCents: number
  feesCents: number
  buysCents: number
  sellsCents: number
  lastPrice: string | null
  lastPriceDate: ISODate | null
  priceSource: 'MANUAL' | 'OPERATION' | 'NONE'
  marketValueCents: number
  unrealizedCents: number
  unrealizedPct: number | null
  errors: string[]
}

function sortOps(ops: InvestmentOp[]): InvestmentOp[] {
  return [...ops].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1
  )
}

function lastPriceFor(prices: Price[], asOf: ISODate): Price | null {
  let best: Price | null = null
  for (const p of prices) {
    if (p.date > asOf) continue
    if (!best || p.date > best.date) best = p
  }
  return best
}

/** Calcula las posiciones a una fecha a partir del historial de operaciones. */
export function computeHoldings(
  ops: InvestmentOp[],
  prices: Price[],
  method: CostMethod,
  asOf: ISODate
): Holding[] {
  const pricesByInstr = new Map<string, Price[]>()
  for (const p of prices) {
    const l = pricesByInstr.get(p.instrumentId)
    if (l) l.push(p)
    else pricesByInstr.set(p.instrumentId, [p])
  }
  interface State {
    accountId: string
    instrumentId: string
    units: Decimal
    cost: Decimal
    lots: Lot[]
    realized: Decimal
    dividends: number
    taxes: number
    fees: number
    buys: Decimal
    sells: Decimal
    lastOpPrice: Decimal | null
    lastOpDate: ISODate | null
    errors: string[]
  }
  const states = new Map<string, State>()
  for (const op of sortOps(ops)) {
    if (op.date > asOf) continue
    if (!op.instrumentId) continue // comisiones o intereses de cuenta sin activo
    const key = `${op.accountId}|${op.instrumentId}`
    let s = states.get(key)
    if (!s) {
      s = {
        accountId: op.accountId,
        instrumentId: op.instrumentId,
        units: new Decimal(0),
        cost: new Decimal(0),
        lots: [],
        realized: new Decimal(0),
        dividends: 0,
        taxes: 0,
        fees: 0,
        buys: new Decimal(0),
        sells: new Decimal(0),
        lastOpPrice: null,
        lastOpDate: null,
        errors: []
      }
      states.set(key, s)
    }
    const qty = dec(op.quantity)
    const price = dec(op.price)
    s.fees += op.feeCents
    s.taxes += op.taxCents
    switch (op.type) {
      case 'BUY': {
        const gross = qty.mul(price)
        s.units = s.units.add(qty)
        s.cost = s.cost.add(gross)
        s.buys = s.buys.add(gross)
        s.lots.push({ qty, price })
        s.lastOpPrice = price
        s.lastOpDate = op.date
        break
      }
      case 'SELL': {
        let q = qty
        if (q.gt(s.units)) {
          s.errors.push(`Venta del ${op.date} por más unidades de las que había (${s.units.toString()}).`)
          q = s.units
        }
        const proceeds = q.mul(price)
        let costOut = new Decimal(0)
        if (method === 'AVERAGE' || s.lots.length === 0) {
          costOut = s.units.gt(0) ? s.cost.div(s.units).mul(q) : new Decimal(0)
          // mantener lotes coherentes en proporción
          const factor = s.units.gt(0) ? s.units.sub(q).div(s.units) : new Decimal(0)
          s.lots = s.lots.map((l) => ({ qty: l.qty.mul(factor), price: l.price }))
        } else {
          let remaining = q
          while (remaining.gt(0) && s.lots.length > 0) {
            const lot = s.lots[0]
            const take = Decimal.min(lot.qty, remaining)
            costOut = costOut.add(take.mul(lot.price))
            lot.qty = lot.qty.sub(take)
            remaining = remaining.sub(take)
            if (lot.qty.lte(0)) s.lots.shift()
          }
        }
        s.units = s.units.sub(q)
        s.cost = s.cost.sub(costOut)
        if (s.units.lte(0)) {
          s.units = new Decimal(0)
          s.cost = new Decimal(0)
          s.lots = []
        }
        s.realized = s.realized.add(proceeds.sub(costOut))
        s.sells = s.sells.add(proceeds)
        s.lastOpPrice = price
        s.lastOpDate = op.date
        break
      }
      case 'DIVIDEND':
      case 'INTEREST':
        s.dividends += op.amountCents ?? 0
        break
      case 'FEE':
        s.fees += op.amountCents ?? 0
        break
      case 'SPLIT': {
        const r = dec(op.splitRatio)
        if (r.lte(0)) {
          s.errors.push(`Split del ${op.date} sin proporción válida.`)
          break
        }
        s.units = s.units.mul(r)
        s.lots = s.lots.map((l) => ({ qty: l.qty.mul(r), price: l.price.div(r) }))
        if (s.lastOpPrice) s.lastOpPrice = s.lastOpPrice.div(r)
        break
      }
    }
  }
  const out: Holding[] = []
  for (const [key, s] of states) {
    const manual = lastPriceFor(pricesByInstr.get(s.instrumentId) ?? [], asOf)
    let lastPrice: Decimal | null = null
    let lastPriceDate: ISODate | null = null
    let source: Holding['priceSource'] = 'NONE'
    if (manual && (!s.lastOpDate || manual.date >= s.lastOpDate || !s.lastOpPrice)) {
      lastPrice = dec(manual.price)
      lastPriceDate = manual.date
      source = 'MANUAL'
    } else if (s.lastOpPrice) {
      lastPrice = s.lastOpPrice
      lastPriceDate = s.lastOpDate
      source = 'OPERATION'
    }
    const costCents = eurToCents(s.cost)
    const mv = lastPrice ? eurToCents(s.units.mul(lastPrice)) : costCents
    const unrealized = s.units.gt(0) ? mv - costCents : 0
    out.push({
      key,
      accountId: s.accountId,
      instrumentId: s.instrumentId,
      units: s.units.toString(),
      costBasisCents: costCents,
      avgCost: s.units.gt(0) ? s.cost.div(s.units).toDecimalPlaces(6).toString() : null,
      realizedCents: eurToCents(s.realized),
      dividendsGrossCents: s.dividends,
      taxesCents: s.taxes,
      feesCents: s.fees,
      buysCents: eurToCents(s.buys),
      sellsCents: eurToCents(s.sells),
      lastPrice: lastPrice ? lastPrice.toString() : null,
      lastPriceDate,
      priceSource: source,
      marketValueCents: s.units.gt(0) ? mv : 0,
      unrealizedCents: unrealized,
      unrealizedPct: costCents > 0 && s.units.gt(0) ? unrealized / costCents : null,
      errors: s.errors
    })
  }
  return out
}

const valueCache = new WeakMap<object, Map<string, Map<string, number>>>()

/** Valor de mercado de las posiciones por cuenta a una fecha (cacheado por contexto). */
export function holdingsValueByAccount(ctx: Ctx, asOf: ISODate): Map<string, number> {
  let byDate = valueCache.get(ctx)
  if (!byDate) {
    byDate = new Map()
    valueCache.set(ctx, byDate)
  }
  const hit = byDate.get(asOf)
  if (hit) return hit
  const res = new Map<string, number>()
  if (ctx.ops.length > 0) {
    for (const h of computeHoldings(ctx.ops, ctx.prices, ctx.settings.costMethod, asOf)) {
      res.set(h.accountId, (res.get(h.accountId) ?? 0) + h.marketValueCents)
    }
  }
  byDate.set(asOf, res)
  return res
}

/** Apuntes de efectivo que genera una operación de inversión (si afecta al efectivo). */
export interface CashEffect {
  type: 'INVESTMENT_BUY' | 'INVESTMENT_SELL' | 'EXPENSE' | 'INCOME'
  amountCents: number
  description: string
  role: 'GROSS' | 'FEE' | 'INCOME'
}

export function cashEffects(op: InvestmentOp, instrumentName: string): CashEffect[] {
  const out: CashEffect[] = []
  const name = instrumentName || 'cuenta'
  const gross = eurToCents(dec(op.quantity).mul(dec(op.price)))
  switch (op.type) {
    case 'BUY':
      if (gross > 0) out.push({ type: 'INVESTMENT_BUY', amountCents: -gross, description: `Compra ${name}`, role: 'GROSS' })
      break
    case 'SELL':
      if (gross > 0) out.push({ type: 'INVESTMENT_SELL', amountCents: gross, description: `Venta ${name}`, role: 'GROSS' })
      break
    case 'DIVIDEND':
    case 'INTEREST': {
      const net = (op.amountCents ?? 0) - op.taxCents
      if (net > 0)
        out.push({
          type: 'INCOME',
          amountCents: net,
          description: `${op.type === 'DIVIDEND' ? 'Dividendo' : 'Intereses'} ${name}`,
          role: 'INCOME'
        })
      break
    }
    case 'FEE':
      if ((op.amountCents ?? 0) > 0)
        out.push({ type: 'EXPENSE', amountCents: -(op.amountCents ?? 0), description: `Comisión ${name}`, role: 'FEE' })
      break
    case 'SPLIT':
      break
  }
  if (op.feeCents > 0 && op.type !== 'FEE')
    out.push({ type: 'EXPENSE', amountCents: -op.feeCents, description: `Comisión ${name}`, role: 'FEE' })
  return out
}

export interface HoldingRow extends Holding {
  name: string
  assetClass: AssetClass
  blockId: string | null
  region: string | null
  sector: string | null
  currency: string
  weight: number | null
  maxWeightPct: number | null
}

export interface BreakdownRow {
  key: string
  label: string
  valueCents: number
  weight: number | null
  targetPct?: number | null
  deviation?: number | null
  maxPct?: number | null
}

export interface PortfolioSummary {
  asOf: ISODate
  holdings: HoldingRow[]
  totalValueCents: number
  totalCostCents: number
  unrealizedCents: number
  unrealizedPct: number | null
  realizedCents: number
  dividendsNetCents: number
  taxesCents: number
  feesCents: number
  cashCents: number
  totalWithCashCents: number
  contributedCents: number
  gainCents: number
  gainPct: number | null
  byBlock: BreakdownRow[]
  byClass: BreakdownRow[]
  byRegion: BreakdownRow[]
  bySector: BreakdownRow[]
  byCurrency: BreakdownRow[]
  alerts: Array<{ level: 'warn' | 'error'; text: string }>
}

function breakdown(rows: HoldingRow[], total: number, keyFn: (h: HoldingRow) => string | null, label: (k: string) => string) {
  const m = new Map<string, number>()
  for (const h of rows) {
    if (h.marketValueCents === 0) continue
    const k = keyFn(h) ?? '__none'
    m.set(k, (m.get(k) ?? 0) + h.marketValueCents)
  }
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, label: k === '__none' ? 'Sin datos' : label(k), valueCents: v, weight: total ? v / total : null }))
    .sort((a, b) => b.valueCents - a.valueCents)
}

function pctNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n / 100 : null
}

/** Aportado de tu bolsillo a las cuentas de inversión: aportaciones previas + transferencias netas. */
export function contributedTo(ctx: Ctx, accountIds: Set<string>, asOf: ISODate): number {
  let total = 0
  for (const id of accountIds) {
    const a = ctx.accountById.get(id)
    if (a && a.openingDate <= asOf) total += a.initialContributionsCents
  }
  for (const t of ctx.counted) {
    if (t.date > asOf) break
    if (accountIds.has(t.accountId) && t.type === 'TRANSFER') total += t.amountCents
    else if (!accountIds.has(t.accountId) && (t.type === 'INVESTMENT_BUY' || t.type === 'INVESTMENT_SELL'))
      total -= t.amountCents
  }
  return total
}

export function investmentAccountIds(ctx: Ctx): Set<string> {
  return new Set(
    ctx.accounts
      .filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO' || ctx.ops.some((o) => o.accountId === a.id))
      .map((a) => a.id)
  )
}

export function portfolioSummary(ctx: Ctx, asOf?: ISODate): PortfolioSummary {
  const date = asOf ?? ctx.today
  const raw = computeHoldings(ctx.ops, ctx.prices, ctx.settings.costMethod, date)
  const total = raw.reduce((s, h) => s + h.marketValueCents, 0)
  const holdings: HoldingRow[] = raw.map((h) => {
    const inst = ctx.instrumentById.get(h.instrumentId)
    return {
      ...h,
      name: inst?.name ?? h.instrumentId,
      assetClass: inst?.assetClass ?? 'OTHER',
      blockId: inst?.blockId ?? null,
      region: inst?.region ?? null,
      sector: inst?.sector ?? null,
      currency: inst?.currency ?? 'EUR',
      weight: total ? h.marketValueCents / total : null,
      maxWeightPct: pctNum(inst?.maxWeightPct)
    }
  })
  holdings.sort((a, b) => b.marketValueCents - a.marketValueCents)
  const accIds = investmentAccountIds(ctx)
  let cash = 0
  // efectivo de las cuentas de inversión (sin posiciones)
  for (const id of accIds) {
    const a = ctx.accountById.get(id)
    if (!a || date < a.openingDate) continue
    let c = a.openingBalanceCents
    for (const t of ctx.countedByAccount.get(id) ?? []) {
      if (t.date > date) break
      c += t.amountCents
    }
    cash += c
  }
  // Comisiones/intereses a nivel de cuenta (sin activo)
  let accountLevelFees = 0
  let accountLevelIncome = 0
  for (const op of ctx.ops) {
    if (op.date > date || op.instrumentId) continue
    if (op.type === 'FEE') accountLevelFees += (op.amountCents ?? 0) + op.feeCents
    if (op.type === 'INTEREST' || op.type === 'DIVIDEND') accountLevelIncome += (op.amountCents ?? 0) - op.taxCents
  }
  const cost = holdings.reduce((s, h) => s + h.costBasisCents, 0)
  const unrealized = holdings.reduce((s, h) => s + h.unrealizedCents, 0)
  const realized = holdings.reduce((s, h) => s + h.realizedCents, 0)
  const taxes = holdings.reduce((s, h) => s + h.taxesCents, 0)
  const dividendsNet = holdings.reduce((s, h) => s + h.dividendsGrossCents, 0) - taxes + accountLevelIncome
  const fees = holdings.reduce((s, h) => s + h.feesCents, 0) + accountLevelFees
  const contributed = contributedTo(ctx, accIds, date)
  const totalWithCash = total + cash
  const gain = totalWithCash - contributed

  const blocks = ctx.blocks
  const byBlockMap = new Map<string, number>()
  for (const h of holdings) {
    if (!h.marketValueCents) continue
    const k = h.blockId ?? '__none'
    byBlockMap.set(k, (byBlockMap.get(k) ?? 0) + h.marketValueCents)
  }
  const byBlock: BreakdownRow[] = blocks.map((b) => {
    const v = byBlockMap.get(b.id) ?? 0
    const w = total ? v / total : null
    const target = pctNum(b.targetPct)
    return {
      key: b.id,
      label: b.name,
      valueCents: v,
      weight: w,
      targetPct: target,
      deviation: w !== null && target !== null ? w - target : null,
      maxPct: pctNum(b.maxPct)
    }
  })
  if (byBlockMap.get('__none'))
    byBlock.push({
      key: '__none',
      label: 'Sin bloque asignado',
      valueCents: byBlockMap.get('__none')!,
      weight: total ? byBlockMap.get('__none')! / total : null,
      targetPct: null,
      deviation: null,
      maxPct: null
    })

  const alerts: PortfolioSummary['alerts'] = []
  const concentration = ctx.settings.concentrationAlertPct / 100
  for (const h of holdings) {
    for (const e of h.errors) alerts.push({ level: 'error', text: `${h.name}: ${e}` })
    if (h.weight === null || h.marketValueCents === 0) continue
    const limit = h.maxWeightPct ?? (h.assetClass === 'STOCK' ? concentration : null)
    if (limit !== null && h.weight > limit)
      alerts.push({
        level: 'warn',
        text: `${h.name} pesa ${(h.weight * 100).toFixed(1).replace('.', ',')} % (límite ${(limit * 100).toFixed(0)} %).`
      })
    if (h.priceSource === 'NONE') alerts.push({ level: 'warn', text: `${h.name} no tiene precio: se valora a coste.` })
    else if (h.lastPriceDate && diffDays(date, h.lastPriceDate) > 35)
      alerts.push({ level: 'warn', text: `${h.name}: el último precio es de hace más de 35 días.` })
  }
  for (const b of byBlock) {
    if (b.maxPct !== null && b.maxPct !== undefined && b.weight !== null && b.weight > b.maxPct)
      alerts.push({
        level: 'warn',
        text: `El bloque ${b.label} pesa ${(b.weight * 100).toFixed(1).replace('.', ',')} % (máximo ${(b.maxPct * 100).toFixed(0)} %).`
      })
  }
  const targetSum = blocks.reduce((s, b) => s + (pctNum(b.targetPct) ?? 0), 0)
  if (blocks.length > 0 && Math.abs(targetSum - 1) > 0.0001)
    alerts.push({
      level: 'warn',
      text: `Los porcentajes objetivo de los bloques suman ${(targetSum * 100).toFixed(1).replace('.', ',')} %, no 100 %.`
    })

  const regionLabel = (k: string) => k
  return {
    asOf: date,
    holdings,
    totalValueCents: total,
    totalCostCents: cost,
    unrealizedCents: unrealized,
    unrealizedPct: cost ? unrealized / cost : null,
    realizedCents: realized,
    dividendsNetCents: dividendsNet,
    taxesCents: taxes,
    feesCents: fees,
    cashCents: cash,
    totalWithCashCents: totalWithCash,
    contributedCents: contributed,
    gainCents: gain,
    gainPct: contributed > 0 ? gain / contributed : null,
    byBlock,
    byClass: breakdown(holdings, total, (h) => h.assetClass, (k) => k),
    byRegion: breakdown(holdings, total, (h) => h.region, regionLabel),
    bySector: breakdown(holdings, total, (h) => h.sector, regionLabel),
    byCurrency: breakdown(holdings, total, (h) => h.currency, regionLabel),
    alerts
  }
}

export interface InvestmentPoint {
  month: MonthKey
  valueCents: number
  contributedCents: number
}

/** Evolución mensual del valor invertido (posiciones + efectivo del bróker) frente a lo aportado. */
export function investmentSeries(ctx: Ctx, fromMonth: MonthKey): InvestmentPoint[] {
  const out: InvestmentPoint[] = []
  const last = monthOf(ctx.today)
  let m = fromMonth
  while (m <= last && out.length < 240) {
    const end = monthEnd(m) > ctx.today ? ctx.today : monthEnd(m)
    const p = portfolioSummary(ctx, end)
    out.push({ month: m, valueCents: p.totalWithCashCents, contributedCents: p.contributedCents })
    m = addMonthsToMonth(m, 1)
  }
  return out
}
