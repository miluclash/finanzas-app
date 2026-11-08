// Seguimiento del plan de inversión: reparto de la próxima aportación, ejecuciones mensuales
// frente a lo previsto y comprobación de las reglas del plan (sin vender, sin compras manuales,
// límites de satélites, tesis escritas, colchón, revisiones).
import { addMonths, addMonthsToMonth, daysInMonth, diffDays, makeDate, monthOf, parts } from '../dates'
import type { ISODate, InvestmentPlanConfig, MonthKey } from '../types'
import type { Ctx } from './ctx'
import { accountCashBalance } from './ledger'
import { dec, eurToCents, portfolioSummary, type PortfolioSummary } from './investments'

export const DEFAULT_PLAN: InvestmentPlanConfig = {
  enabled: false,
  startDate: '2026-11-02',
  endDate: '2027-05-13',
  monthlyCents: 20000,
  executionDay: 16,
  coreBlockId: null,
  satelliteBlockId: null,
  maxSatellites: 3,
  brokerAccountId: null,
  cushionAccountId: null,
  cushionCents: 25700,
  firstReviewDate: '2027-05-13',
  reviewEveryMonths: 6,
  theses: {}
}

export type RuleStatus = 'ok' | 'warn' | 'error' | 'info'

export interface PlanRule {
  id: string
  label: string
  status: RuleStatus
  detail: string
}

export interface PlanSplitRow {
  blockId: string
  blockName: string
  targetPct: number
  amountCents: number
  instrumentId: string | null
  instrumentName: string | null
  note: string | null
}

export interface PlanExecutionMonth {
  month: MonthKey
  expectedDate: ISODate
  plannedCents: number
  boughtCents: number
  buys: number
  manualBuys: number
  status: 'ok' | 'short' | 'missing' | 'pending' | 'extra'
}

export interface PlanReport {
  config: InvestmentPlanConfig
  configured: boolean
  setupIssues: string[]
  nextExecution: ISODate | null
  split: PlanSplitRow[]
  brokerCashCents: number
  executions: PlanExecutionMonth[]
  rules: PlanRule[]
  contributedSinceStartCents: number
  boughtSinceStartCents: number
  remainingExecutions: number
  projectedEndCents: number | null
  nextReview: ISODate
  satellites: Array<{
    instrumentId: string
    name: string
    weight: number | null
    maxPct: number
    valueCents: number
    hasThesis: boolean
    thesisReview: ISODate | null
    receivesMoney: boolean
  }>
}

const pct = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n / 100 : null
}
const fmtPct = (w: number) => `${(w * 100).toFixed(1).replace('.', ',')} %`
const fmtEur = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`

function executionDateIn(m: MonthKey, day: number): ISODate {
  const { y, m: mm } = parts(`${m}-01`)
  return makeDate(y, mm, Math.min(day, daysInMonth(y, mm)))
}

/** Próxima fecha de ejecución (hoy incluido) dentro del plan. */
export function nextExecutionDate(cfg: InvestmentPlanConfig, today: ISODate): ISODate | null {
  const from = today > cfg.startDate ? today : cfg.startDate
  let m = monthOf(from)
  for (let i = 0; i < 3; i++) {
    const d = executionDateIn(m, cfg.executionDay)
    if (d >= from && d >= cfg.startDate) return cfg.endDate && d > cfg.endDate ? null : d
    m = addMonthsToMonth(m, 1)
  }
  return null
}

function nextReviewDate(cfg: InvestmentPlanConfig, today: ISODate): ISODate {
  let d = cfg.firstReviewDate
  let guard = 0
  // La revisión vencida se mantiene hasta 30 días para que se vea
  while (diffDays(today, d) > 30 && guard++ < 100) d = addMonths(d, Math.max(1, cfg.reviewEveryMonths))
  return d
}

/** Reparte una aportación entre bloques según el plan y las reglas de satélites. */
export function splitContribution(ctx: Ctx, cfg: InvestmentPlanConfig, amountCents: number, summary: PortfolioSummary): PlanSplitRow[] {
  const blocks = [...ctx.blocks].sort((a, b) => a.sortOrder - b.sortOrder)
  if (!blocks.length || amountCents <= 0) return []
  const core = cfg.coreBlockId ?? blocks[0].id
  const satBlockRow = summary.byBlock.find((b) => b.key === cfg.satelliteBlockId)
  const satOverMax =
    !!satBlockRow && satBlockRow.maxPct != null && satBlockRow.weight != null && satBlockRow.weight > satBlockRow.maxPct
  const eligibleSats = satelliteStatus(ctx, cfg, summary).filter((s) => s.receivesMoney)
  const rows: PlanSplitRow[] = blocks.map((b) => {
    const t = pct(b.targetPct) ?? 0
    const instruments = ctx.instruments.filter((i) => i.active && i.blockId === b.id)
    const first = instruments[0] ?? null
    return {
      blockId: b.id,
      blockName: b.name,
      targetPct: t,
      amountCents: Math.floor((amountCents * t) / 100) * 100, // euros enteros
      instrumentId: first?.id ?? null,
      instrumentName: first?.name ?? null,
      note: instruments.length > 1 ? `${instruments.length} activos en el bloque` : instruments.length ? null : 'Sin activo asignado'
    }
  })
  const coreRow = rows.find((r) => r.blockId === core) ?? rows[0]
  const satRow = rows.find((r) => r.blockId === cfg.satelliteBlockId)
  if (satRow && satRow.amountCents > 0) {
    let reason: string | null = null
    if (satOverMax) reason = `Satélites por encima de su máximo (${fmtPct(satBlockRow!.weight!)}): su parte va al núcleo`
    else if (!eligibleSats.length) reason = 'Ningún satélite con tesis y bajo su límite: su parte va al núcleo'
    if (reason) {
      coreRow.amountCents += satRow.amountCents
      satRow.amountCents = 0
      satRow.instrumentId = null
      satRow.instrumentName = null
      satRow.note = reason
    } else {
      const pick = [...eligibleSats].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))[0]
      satRow.instrumentId = pick.instrumentId
      satRow.instrumentName = pick.name
      satRow.note = eligibleSats.length > 1 ? 'El satélite con menos peso entre los que tienen tesis' : null
    }
  }
  // Bloques sin activo: al núcleo
  for (const r of rows) {
    if (r !== coreRow && r.amountCents > 0 && !r.instrumentId && r !== satRow) {
      coreRow.amountCents += r.amountCents
      r.note = 'Sin activo asignado: su parte va al núcleo'
      r.amountCents = 0
    }
  }
  const sum = rows.reduce((s, r) => s + r.amountCents, 0)
  coreRow.amountCents += amountCents - sum // el redondeo va al núcleo
  return rows
}

function satelliteStatus(ctx: Ctx, cfg: InvestmentPlanConfig, summary: PortfolioSummary): PlanReport['satellites'] {
  if (!cfg.satelliteBlockId) return []
  const limitDefault = ctx.settings.concentrationAlertPct / 100
  return ctx.instruments
    .filter((i) => i.blockId === cfg.satelliteBlockId)
    .map((i) => {
      const h = summary.holdings.filter((x) => x.instrumentId === i.id)
      const value = h.reduce((s, x) => s + x.marketValueCents, 0)
      const weight = summary.totalValueCents ? value / summary.totalValueCents : null
      const maxPct = pct(i.maxWeightPct) ?? limitDefault
      const th = cfg.theses[i.id]
      const hasThesis = !!th && th.text.trim().length > 0
      return {
        instrumentId: i.id,
        name: i.name,
        weight,
        maxPct,
        valueCents: value,
        hasThesis,
        thesisReview: th?.reviewDate ?? null,
        receivesMoney: i.active && hasThesis && (weight ?? 0) < maxPct
      }
    })
    .sort((a, b) => b.valueCents - a.valueCents)
}

export function planReport(ctx: Ctx, cfgIn: InvestmentPlanConfig | null | undefined): PlanReport {
  const cfg: InvestmentPlanConfig = { ...DEFAULT_PLAN, ...(cfgIn ?? {}), theses: cfgIn?.theses ?? {} }
  const today = ctx.today
  const summary = portfolioSummary(ctx)
  const setupIssues: string[] = []
  if (!ctx.blocks.length) setupIssues.push('Crea los bloques (World 70 %, Emergentes 10 %, Oro 10 %, Satélites 10 % máx. 20 %) en «Activos y reparto objetivo».')
  if (!cfg.coreBlockId) setupIssues.push('Elige cuál es el bloque núcleo.')
  if (!cfg.satelliteBlockId) setupIssues.push('Elige cuál es el bloque de satélites.')
  if (!cfg.brokerAccountId) setupIssues.push('Elige la cuenta del bróker (Trade Republic).')
  const broker = cfg.brokerAccountId ?? null

  // ---- Ejecuciones mes a mes ----
  const opsInPlan = ctx.ops.filter(
    (o) => o.date >= cfg.startDate && o.date <= today && (!broker || o.accountId === broker) && (!cfg.endDate || o.date <= cfg.endDate)
  )
  const executions: PlanExecutionMonth[] = []
  let m = monthOf(cfg.startDate)
  const lastMonth = monthOf(cfg.endDate && cfg.endDate < today ? cfg.endDate : today)
  let boughtSince = 0
  while (m <= lastMonth && executions.length < 120) {
    const first = m === monthOf(cfg.startDate)
    const expected = first ? (executionDateIn(m, cfg.executionDay) < cfg.startDate ? cfg.startDate : executionDateIn(m, cfg.executionDay)) : executionDateIn(m, cfg.executionDay)
    const buys = opsInPlan.filter((o) => o.type === 'BUY' && monthOf(o.date) === m)
    const bought = buys.reduce((s, o) => s + eurToCents(dec(o.quantity).mul(dec(o.price))), 0)
    boughtSince += bought
    const manual = buys.filter((o) => o.feeCents > 0).length
    let status: PlanExecutionMonth['status']
    if (expected > today) status = bought > 0 ? 'extra' : 'pending'
    else if (bought === 0) status = 'missing'
    else if (bought < cfg.monthlyCents * 0.95) status = 'short'
    else status = 'ok'
    executions.push({ month: m, expectedDate: expected, plannedCents: cfg.monthlyCents, boughtCents: bought, buys: buys.length, manualBuys: manual, status })
    m = addMonthsToMonth(m, 1)
  }

  // ---- Próxima aportación ----
  const next = nextExecutionDate(cfg, today)
  const brokerCash = broker ? accountCashBalance(ctx, broker) : summary.cashCents
  const nextAmount = Math.max(cfg.monthlyCents, Math.floor(brokerCash / 100) * 100)
  const split = next ? splitContribution(ctx, cfg, nextAmount, summary) : []
  const sats = satelliteStatus(ctx, cfg, summary)

  // ---- Reglas ----
  const rules: PlanRule[] = []
  const sells = opsInPlan.filter((o) => o.type === 'SELL')
  rules.push({
    id: 'no-sell',
    label: 'No se vende',
    status: sells.length ? 'error' : 'ok',
    detail: sells.length ? `${sells.length} venta(s) desde el ${cfg.startDate}. Los desvíos se corrigen con dinero nuevo.` : 'Ninguna venta desde el inicio del plan.'
  })
  const manual = opsInPlan.filter((o) => o.type === 'BUY' && o.feeCents > 0)
  rules.push({
    id: 'no-manual',
    label: 'Solo planes de inversión (sin compras manuales)',
    status: manual.length ? 'warn' : 'ok',
    detail: manual.length
      ? `${manual.length} compra(s) con comisión: ${fmtEur(manual.reduce((s, o) => s + o.feeCents, 0))} pagados.`
      : 'Todas las compras sin comisión.'
  })
  const card = opsInPlan.filter((o) => o.type === 'FEE' && /tarjeta/i.test(o.notes ?? ''))
  rules.push({
    id: 'no-card',
    label: 'Dinero por transferencia, no con tarjeta',
    status: card.length ? 'warn' : 'ok',
    detail: card.length ? `${card.length} recarga(s) con tarjeta: ${fmtEur(card.reduce((s, o) => s + (o.amountCents ?? 0), 0))} de comisión.` : 'Sin recargas con tarjeta.'
  })
  const satBlock = summary.byBlock.find((b) => b.key === cfg.satelliteBlockId)
  if (satBlock) {
    const max = satBlock.maxPct ?? 0.2
    const over = satBlock.weight != null && satBlock.weight > max
    rules.push({
      id: 'sat-total',
      label: `Satélites juntos ≤ ${Math.round(max * 100)} %`,
      status: over ? 'warn' : 'ok',
      detail: `Pesan ${fmtPct(satBlock.weight ?? 0)}.${over ? ' No reciben dinero hasta bajar del máximo (sin vender).' : ''}`
    })
  }
  const overSats = sats.filter((x) => x.weight != null && x.weight > x.maxPct)
  if (sats.length)
    rules.push({
      id: 'sat-each',
      label: 'Cada satélite ≤ su límite',
      status: overSats.length ? 'warn' : 'ok',
      detail: overSats.length ? overSats.map((x) => `${x.name} ${fmtPct(x.weight!)} (máx. ${Math.round(x.maxPct * 100)} %)`).join(' · ') : 'Todos dentro de su límite.'
    })
  const held = sats.filter((x) => x.valueCents > 0)
  if (cfg.satelliteBlockId)
    rules.push({
      id: 'sat-count',
      label: `Como mucho ${cfg.maxSatellites} satélites`,
      status: held.length > cfg.maxSatellites ? 'warn' : 'ok',
      detail: `${held.length} con posición.`
    })
  const satIds = new Set(sats.map((x) => x.instrumentId))
  const boughtNoThesis = [
    ...new Set(opsInPlan.filter((o) => o.type === 'BUY' && o.instrumentId && satIds.has(o.instrumentId) && !sats.find((x) => x.instrumentId === o.instrumentId)?.hasThesis).map((o) => o.instrumentId!))
  ]
  rules.push({
    id: 'thesis',
    label: 'Ningún satélite recibe dinero sin tesis',
    status: boughtNoThesis.length ? 'error' : 'ok',
    detail: boughtNoThesis.length
      ? `Compras sin tesis: ${boughtNoThesis.map((id) => ctx.instrumentById.get(id)?.name ?? id).join(', ')}.`
      : `${sats.filter((x) => x.hasThesis).length} de ${sats.length} satélites con tesis escrita.`
  })
  const thesisDue = sats.filter((x) => x.hasThesis && x.thesisReview && x.thesisReview <= today)
  if (thesisDue.length)
    rules.push({ id: 'thesis-review', label: 'Revisión de tesis', status: 'warn', detail: `Toca revisar: ${thesisDue.map((x) => x.name).join(', ')}.` })
  if (cfg.cushionAccountId) {
    const bal = accountCashBalance(ctx, cfg.cushionAccountId)
    rules.push({
      id: 'cushion',
      label: `Colchón ≥ ${fmtEur(cfg.cushionCents)} fuera de la cartera`,
      status: bal >= cfg.cushionCents ? 'ok' : 'error',
      detail: `Saldo de ${ctx.accountById.get(cfg.cushionAccountId)?.name ?? 'la cuenta'}: ${fmtEur(bal)}.`
    })
  }
  if (next) {
    const enough = brokerCash >= cfg.monthlyCents
    rules.push({
      id: 'cash',
      label: 'Efectivo para la próxima ejecución',
      status: enough ? 'ok' : 'warn',
      detail: `${fmtEur(brokerCash)} en el bróker para el ${next}${enough ? '.' : `: transfiere al menos ${fmtEur(cfg.monthlyCents - brokerCash)} desde el banco antes de esa fecha.`}`
    })
  }
  const missed = executions.filter((e) => e.status === 'missing' || e.status === 'short')
  rules.push({
    id: 'executions',
    label: 'Aportación mensual ejecutada',
    status: missed.length ? 'warn' : 'ok',
    detail: missed.length ? `Meses sin completar: ${missed.map((e) => e.month).join(', ')}.` : 'Al día.'
  })
  const review = nextReviewDate(cfg, today)
  rules.push({
    id: 'review',
    label: 'Revisión completa',
    status: review <= today ? 'warn' : 'info',
    detail: review <= today ? `Pendiente desde el ${review}: pesos, límites y tesis.` : `Próxima: ${review} (después cada ${cfg.reviewEveryMonths} meses).`
  })
  const block = summary.byBlock.filter((b) => b.targetPct != null && b.deviation != null && Math.abs(b.deviation) > 0.05)
  if (block.length)
    rules.push({
      id: 'drift',
      label: 'Desvío de bloques > 5 puntos',
      status: 'info',
      detail: `${block.map((b) => `${b.label} ${b.deviation! > 0 ? '+' : ''}${(b.deviation! * 100).toFixed(1).replace('.', ',')}`).join(' · ')}. Se corrige con aportaciones, sin vender.`
    })

  // ---- Proyección solo con aportaciones ----
  let remaining = 0
  if (cfg.endDate) {
    let d = next
    while (d && d <= cfg.endDate && remaining < 120) {
      remaining++
      d = executionDateIn(addMonthsToMonth(monthOf(d), 1), cfg.executionDay)
    }
  }
  const contributedSince = ctx.counted
    .filter((t) => t.date >= cfg.startDate && t.accountId === broker && t.type === 'TRANSFER')
    .reduce((s, t) => s + t.amountCents, 0)

  return {
    config: cfg,
    configured: cfg.enabled && setupIssues.length === 0,
    setupIssues,
    nextExecution: next,
    split,
    brokerCashCents: brokerCash,
    executions,
    rules,
    contributedSinceStartCents: contributedSince,
    boughtSinceStartCents: boughtSince,
    remainingExecutions: remaining,
    projectedEndCents: cfg.endDate ? summary.totalWithCashCents + Math.max(0, remaining * cfg.monthlyCents - Math.max(0, brokerCash)) : null,
    nextReview: review,
    satellites: sats
  }
}
