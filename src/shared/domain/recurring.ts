// Recurrentes: fechas previstas, equivalente mensual y emparejamiento con movimientos reales.
// Un cargo previsto nunca crea un movimiento real: solo se empareja con los que tú registras.
import { addDays, addMonths, diffDays, parts } from '../dates'
import type { ISODate, RecurringRule, Transaction } from '../types'
import type { Ctx } from './ctx'

const STEP_MONTHS: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }

/** Margen (días) para considerar que un movimiento corresponde a una fecha prevista. */
export function matchWindowDays(rule: RecurringRule): number {
  switch (rule.frequency) {
    case 'WEEKLY':
      return 3
    case 'MONTHLY':
      return 12
    case 'QUARTERLY':
      return 30
    case 'YEARLY':
      return 60
    case 'ONE_OFF':
      return 31
  }
}

/** Importe con signo según el tipo (desde el punto de vista de la cuenta de origen). */
export function signedAmount(rule: RecurringRule): number {
  return rule.kind === 'INCOME' ? Math.abs(rule.amountCents) : -Math.abs(rule.amountCents)
}

export function monthlyEquivalent(rule: RecurringRule): number {
  if (!rule.active) return 0
  const a = signedAmount(rule)
  switch (rule.frequency) {
    case 'WEEKLY':
      return Math.round((a * 52) / 12)
    case 'MONTHLY':
      return a
    case 'QUARTERLY':
      return Math.round(a / 3)
    case 'YEARLY':
      return Math.round(a / 12)
    case 'ONE_OFF':
      return 0
  }
}

/** Fechas previstas de la regla entre `from` y `to` (incluidas). Sin fecha ancla => []. */
export function occurrences(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  if (!rule.startDate) return []
  const out: ISODate[] = []
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to
  if (rule.frequency === 'ONE_OFF') {
    if (rule.startDate >= from && rule.startDate <= end) out.push(rule.startDate)
    return out
  }
  if (rule.frequency === 'WEEKLY') {
    let d = rule.startDate
    // saltar rápido hasta from
    if (d < from) {
      const weeks = Math.floor(diffDays(from, d) / 7)
      d = addDays(d, weeks * 7)
    }
    let guard = 0
    while (d <= end && guard++ < 1000) {
      if (d >= from) out.push(d)
      d = addDays(d, 7)
    }
    return out
  }
  const step = STEP_MONTHS[rule.frequency]
  const anchorDay = parts(rule.startDate).d
  let k = 0
  let d = rule.startDate
  let guard = 0
  while (d <= end && guard++ < 1200) {
    if (d >= from) out.push(d)
    k++
    d = addMonths(rule.startDate, k * step, anchorDay)
  }
  return out
}

/** Movimientos que pueden corresponder a la regla: enlazados explícitamente o, si no hay enlace, que encajan. */
export function candidateTxs(ctx: Ctx, rule: RecurringRule): Transaction[] {
  const explicit: Transaction[] = []
  const soft: Transaction[] = []
  const lo = rule.minCents ?? Math.round(Math.abs(rule.amountCents) * 0.85)
  const hi = rule.maxCents ?? Math.round(Math.abs(rule.amountCents) * 1.15)
  for (const t of ctx.counted) {
    if (t.recurringId === rule.id) {
      explicit.push(t)
      continue
    }
    if (t.recurringId) continue
    if (t.accountId !== rule.accountId) continue
    const abs = Math.abs(t.amountCents)
    if (rule.kind === 'INCOME' && t.type === 'INCOME' && t.categoryId && t.categoryId === rule.categoryId && abs >= lo && abs <= hi)
      soft.push(t)
    else if (rule.kind === 'EXPENSE' && t.type === 'EXPENSE' && t.categoryId && t.categoryId === rule.categoryId && abs >= lo && abs <= hi)
      soft.push(t)
    else if (rule.kind === 'TRANSFER' && t.type === 'TRANSFER' && t.amountCents < 0 && abs >= lo && abs <= hi) {
      const other = ctx.counted.find((o) => o.transferId === t.transferId && o.id !== t.id)
      if (other && other.accountId === rule.toAccountId) soft.push(t)
    }
  }
  return [...explicit, ...soft]
}

export interface OccurrenceStatus {
  date: ISODate
  matchedTxId: string | null
  matchedDate: ISODate | null
}

/** Empareja cada fecha prevista con el movimiento más cercano dentro del margen (cada movimiento, una sola vez). */
export function matchOccurrences(ctx: Ctx, rule: RecurringRule, from: ISODate, to: ISODate): OccurrenceStatus[] {
  const w = matchWindowDays(rule)
  const occ = occurrences(rule, addDays(from, -w), addDays(to, w))
  const txs = candidateTxs(ctx, rule)
  const used = new Set<string>()
  const result: OccurrenceStatus[] = []
  for (const d of occ) {
    let best: Transaction | null = null
    let bestDist = Infinity
    for (const t of txs) {
      if (used.has(t.id)) continue
      const dist = Math.abs(diffDays(t.date, d))
      if (dist <= w && dist < bestDist) {
        best = t
        bestDist = dist
      }
    }
    if (best) used.add(best.id)
    result.push({ date: d, matchedTxId: best?.id ?? null, matchedDate: best?.date ?? null })
  }
  return result.filter((r) => r.date >= from && r.date <= to)
}

export interface RuleStatus {
  ruleId: string
  monthlyEquivalentCents: number
  nextDate: ISODate | null
  /** Fechas ya pasadas sin movimiento que las cubra (dentro de los últimos 60 días). */
  overdue: ISODate[]
  lastMatchedDate: ISODate | null
  finished: boolean
}

export function ruleStatus(ctx: Ctx, rule: RecurringRule): RuleStatus {
  const today = ctx.today
  const from = addDays(today, -60)
  const to = addDays(today, 400)
  const st = rule.startDate ? matchOccurrences(ctx, rule, from < rule.startDate ? rule.startDate : from, to) : []
  const w = matchWindowDays(rule)
  const overdue = st.filter((o) => !o.matchedTxId && o.date < today && diffDays(today, o.date) > Math.min(w, 5)).map((o) => o.date)
  const next = st.find((o) => !o.matchedTxId && o.date >= addDays(today, -Math.min(w, 5)))
  const matched = st.filter((o) => o.matchedDate).map((o) => o.matchedDate!)
  const lastTx = candidateTxs(ctx, rule)
    .map((t) => t.date)
    .sort()
    .pop()
  const finished =
    !rule.active ||
    (rule.endDate !== null && rule.endDate < today) ||
    (rule.frequency === 'ONE_OFF' && !!rule.startDate && st.length > 0 && st.every((o) => o.matchedTxId))
  return {
    ruleId: rule.id,
    monthlyEquivalentCents: monthlyEquivalent(rule),
    nextDate: finished ? null : next?.date ?? null,
    overdue: finished ? [] : overdue,
    lastMatchedDate: matched.length ? matched[matched.length - 1] : lastTx ?? null,
    finished
  }
}

/** Ocurrencias previstas y aún no cubiertas en un rango (para disponible y previsión). */
export function pendingOccurrences(ctx: Ctx, rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  if (!rule.active) return []
  return matchOccurrences(ctx, rule, from, to)
    .filter((o) => !o.matchedTxId)
    .map((o) => o.date)
}

/** Sugerencia de regla recurrente para un movimiento nuevo (misma cuenta, categoría e importe parecido). */
export function suggestRule(ctx: Ctx, t: Pick<Transaction, 'accountId' | 'categoryId' | 'amountCents' | 'type'>): RecurringRule | null {
  const abs = Math.abs(t.amountCents)
  const matches = ctx.recurring.filter((r) => {
    if (!r.active || r.accountId !== t.accountId) return false
    if (r.categoryId !== t.categoryId) return false
    if (r.kind === 'INCOME' && t.type !== 'INCOME') return false
    if (r.kind === 'EXPENSE' && t.type !== 'EXPENSE') return false
    if (r.kind === 'TRANSFER') return false
    const lo = r.minCents ?? Math.round(Math.abs(r.amountCents) * 0.8)
    const hi = r.maxCents ?? Math.round(Math.abs(r.amountCents) * 1.2)
    return abs >= lo && abs <= hi
  })
  return matches.length === 1 ? matches[0] : null
}
