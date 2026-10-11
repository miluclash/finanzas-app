// Validaciones de movimientos (equivalente a la columna Checks del Excel, pero al guardar).
import { diffDays, isISODate } from '../dates'
import { formatEur } from '../money'
import type { Transaction, TxType } from '../types'
import { categoryKind, type Ctx } from './ctx'

export interface Issue {
  code: string
  message: string
  field?: string
}

export interface ValidationResult {
  errors: Issue[]
  warnings: Issue[]
}

export type TxDraft = Pick<
  Transaction,
  | 'date'
  | 'accountId'
  | 'description'
  | 'amountCents'
  | 'type'
  | 'categoryId'
  | 'subcategoryId'
  | 'goalId'
  | 'recurringId'
  | 'linkedTxId'
  | 'status'
  | 'transferId'
> & { id?: string | null }

/** Signo que corresponde a cada tipo: +1 entra, −1 sale, 0 cualquiera. */
export function expectedSign(type: TxType): 1 | -1 | 0 {
  switch (type) {
    case 'INCOME':
    case 'REFUND':
    case 'INVESTMENT_SELL':
      return 1
    case 'EXPENSE':
    case 'INVESTMENT_BUY':
      return -1
    default:
      return 0
  }
}

/** Aplica el signo correcto a un importe introducido en positivo. */
export function applySign(type: TxType, absCents: number, direction?: 1 | -1): number {
  const s = expectedSign(type)
  const abs = Math.abs(absCents)
  if (s === 0) return (direction ?? 1) * abs
  return s * abs
}

export interface DuplicateMatch {
  id: string
  date: string
  description: string
  amountCents: number
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1)
  )
}

/** Parecido entre descripciones (0–1) por palabras en común. */
export function descriptionSimilarity(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / (wa.size + wb.size - inter)
}

type DupCandidate = Pick<Transaction, 'date' | 'description' | 'type' | 'categoryId'>

/** Dos movimientos de la misma cuenta e importe se consideran posible duplicado si además coinciden tipo y
 * categoría, y o bien son del mismo día o bien su descripción es muy parecida. */
function looksDuplicate(a: DupCandidate, b: DupCandidate): boolean {
  if (a.type !== b.type) return false
  if ((a.categoryId ?? null) !== (b.categoryId ?? null)) return false
  if (a.date === b.date) return true
  return descriptionSimilarity(a.description, b.description) >= 0.6
}

/**
 * Posibles duplicados: misma cuenta, mismo importe, ±N días, no anulados (ver looksDuplicate).
 * No bloquea: solo avisa. Se ignoran los pares descartados por el usuario y los enlazados entre sí.
 */
export function findDuplicates(ctx: Ctx, d: TxDraft): DuplicateMatch[] {
  if (d.status === 'CANCELLED' || !isISODate(d.date) || !d.amountCents) return []
  const w = ctx.settings.duplicateWindowDays
  const dismissed = new Set(ctx.dismissedDuplicates.map(([a, b]) => `${a}|${b}`))
  const out: DuplicateMatch[] = []
  for (const t of ctx.transactions) {
    if (t.id === d.id) continue
    if (t.status === 'CANCELLED') continue
    if (t.accountId !== d.accountId || t.amountCents !== d.amountCents) continue
    if (Math.abs(diffDays(t.date, d.date)) > w) continue
    if (d.transferId && t.transferId === d.transferId) continue
    if ((d.linkedTxId && d.linkedTxId === t.id) || (d.id && t.linkedTxId === d.id)) continue
    if (d.id && (dismissed.has(`${d.id}|${t.id}`) || dismissed.has(`${t.id}|${d.id}`))) continue
    if (!looksDuplicate(d, t)) continue
    if (d.type === 'TRANSFER' && d.id) {
      const self = ctx.txById.get(d.id)
      if (self && counterpart(ctx, self) !== counterpart(ctx, t)) continue
    }
    out.push({ id: t.id, date: t.date, description: t.description, amountCents: t.amountCents })
  }
  return out
}

function counterpart(ctx: Ctx, t: Transaction): string | null {
  if (!t.transferId) return null
  return ctx.transactions.find((o) => o.transferId === t.transferId && o.id !== t.id)?.accountId ?? null
}

/** Todos los pares de posibles duplicados del libro (para la bandeja de revisión). */
export function allDuplicatePairs(ctx: Ctx): Array<[string, string]> {
  const w = ctx.settings.duplicateWindowDays
  const dismissed = new Set(ctx.dismissedDuplicates.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)))
  const byKey = new Map<string, Transaction[]>()
  for (const t of ctx.transactions) {
    if (t.status === 'CANCELLED' || t.investmentOpId) continue
    const k = `${t.accountId}|${t.amountCents}`
    const l = byKey.get(k)
    if (l) l.push(t)
    else byKey.set(k, [t])
  }
  const pairs: Array<[string, string]> = []
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => (a.date < b.date ? -1 : 1))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (diffDays(list[j].date, list[i].date) > w) break
        const a = list[i]
        const b = list[j]
        if (a.transferId && a.transferId === b.transferId) continue
        if (a.linkedTxId === b.id || b.linkedTxId === a.id) continue
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
        if (dismissed.has(key)) continue
        if (!looksDuplicate(a, b)) continue
        if (a.type === 'TRANSFER' && counterpart(ctx, a) !== counterpart(ctx, b)) continue
        pairs.push([a.id, b.id])
      }
    }
  }
  return pairs
}

export function validateTransaction(ctx: Ctx, d: TxDraft): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const acc = d.accountId ? ctx.accountById.get(d.accountId) : undefined
  if (!d.accountId) errors.push({ code: 'NO_ACCOUNT', message: 'Elige una cuenta.', field: 'accountId' })
  else if (!acc) errors.push({ code: 'BAD_ACCOUNT', message: 'La cuenta no existe.', field: 'accountId' })
  if (!isISODate(d.date)) errors.push({ code: 'BAD_DATE', message: 'Fecha no válida.', field: 'date' })
  if (!d.description || !d.description.trim())
    errors.push({ code: 'NO_DESCRIPTION', message: 'Escribe una descripción.', field: 'description' })
  if (!Number.isInteger(d.amountCents))
    errors.push({ code: 'BAD_AMOUNT', message: 'Importe no válido.', field: 'amountCents' })
  else if (d.amountCents === 0 && d.type !== 'ADJUSTMENT')
    errors.push({ code: 'ZERO_AMOUNT', message: 'El importe no puede ser 0.', field: 'amountCents' })
  const sign = expectedSign(d.type)
  if (sign !== 0 && d.amountCents !== 0 && Math.sign(d.amountCents) !== sign)
    errors.push({
      code: 'CHECK_SIGN',
      message: sign < 0 ? 'Este tipo de movimiento debe restar dinero (importe negativo).' : 'Este tipo de movimiento debe sumar dinero (importe positivo).',
      field: 'amountCents'
    })
  const needsCategory = d.type === 'INCOME' || d.type === 'EXPENSE' || d.type === 'REFUND'
  if (needsCategory && !d.categoryId)
    errors.push({ code: 'NO_CATEGORY', message: 'Elige una categoría.', field: 'categoryId' })
  if (d.categoryId) {
    const cat = ctx.categoryById.get(d.categoryId)
    if (!cat) errors.push({ code: 'BAD_CATEGORY', message: 'La categoría no existe.', field: 'categoryId' })
    else {
      const kind = categoryKind(ctx, d.categoryId)
      if (d.type === 'INCOME' && kind !== 'INCOME')
        errors.push({ code: 'BAD_CATEGORY_KIND', message: `"${cat.name}" es una categoría de gastos; un ingreso necesita una de ingresos.`, field: 'categoryId' })
      if ((d.type === 'EXPENSE' || d.type === 'REFUND') && kind !== 'EXPENSE')
        errors.push({ code: 'BAD_CATEGORY_KIND', message: `"${cat.name}" es una categoría de ingresos; un gasto o reembolso necesita una de gastos.`, field: 'categoryId' })
      if (!cat.active && !d.id) warnings.push({ code: 'INACTIVE_CATEGORY', message: `La categoría "${cat.name}" está desactivada.` })
    }
  }
  if (d.subcategoryId) {
    const sub = ctx.subcategoryById.get(d.subcategoryId)
    if (!sub || sub.categoryId !== d.categoryId)
      errors.push({ code: 'BAD_SUBCATEGORY', message: 'La subcategoría no pertenece a la categoría elegida.', field: 'subcategoryId' })
  }
  if (d.goalId && !ctx.goals.some((g) => g.id === d.goalId))
    errors.push({ code: 'BAD_GOAL', message: 'El objetivo no existe.', field: 'goalId' })
  if (d.recurringId && !ctx.ruleById.get(d.recurringId))
    errors.push({ code: 'BAD_RECURRING', message: 'La regla recurrente no existe.', field: 'recurringId' })
  if (d.type === 'TRANSFER' && !d.transferId)
    errors.push({ code: 'NO_TRANSFER_ID', message: 'Una transferencia necesita sus dos apuntes vinculados.' })
  if (d.linkedTxId) {
    const orig = ctx.txById.get(d.linkedTxId)
    if (!orig || orig.id === d.id)
      errors.push({ code: 'BAD_LINK', message: 'El movimiento relacionado no existe.', field: 'linkedTxId' })
    else if (d.type === 'REFUND') {
      if (orig.categoryId !== d.categoryId)
        warnings.push({ code: 'REFUND_CATEGORY', message: 'El reembolso no tiene la misma categoría que el gasto original.' })
      if (orig.type === 'EXPENSE' && d.amountCents > Math.abs(orig.amountCents))
        warnings.push({ code: 'REFUND_EXCEEDS', message: `El reembolso supera el gasto original (${formatEur(orig.amountCents)}).` })
    }
  } else if (d.type === 'REFUND')
    warnings.push({ code: 'REFUND_NO_LINK', message: 'Reembolso sin gasto original enlazado.' })
  if (acc && isISODate(d.date)) {
    if (d.date < acc.openingDate)
      warnings.push({ code: 'BEFORE_OPENING_DATE', message: 'Fecha anterior a la apertura de la cuenta: no suma al saldo (ya está dentro del saldo inicial).' })
    if (!acc.active && !d.id) warnings.push({ code: 'INACTIVE_ACCOUNT', message: `La cuenta "${acc.name}" está desactivada.` })
    if (d.date > ctx.today) warnings.push({ code: 'FUTURE_DATE', message: 'La fecha es futura.' })
  }
  if (d.recurringId) {
    const r = ctx.ruleById.get(d.recurringId)
    if (r && r.minCents !== null && r.maxCents !== null) {
      const abs = Math.abs(d.amountCents)
      if (abs < r.minCents || abs > r.maxCents)
        warnings.push({ code: 'RECURRING_RANGE', message: `Importe fuera del rango esperado para "${r.concept}" (${formatEur(r.minCents)}–${formatEur(r.maxCents)}).` })
    }
  }
  if (d.status === 'PENDING_REVIEW') warnings.push({ code: 'PENDING_REVIEW', message: 'Pendiente de revisar.' })
  if (errors.length === 0) {
    const dups = findDuplicates(ctx, d)
    if (dups.length)
      warnings.push({
        code: 'POSSIBLE_DUPLICATE',
        message: `Posible duplicado de ${dups.map((x) => `${x.id} (${x.description})`).join(', ')}.`
      })
  }
  return { errors, warnings }
}

/** Avisos de un movimiento ya guardado (para la vista de revisión). */
export function transactionIssues(ctx: Ctx, t: Transaction): ValidationResult {
  if (t.status === 'CANCELLED') return { errors: [], warnings: [] }
  return validateTransaction(ctx, t)
}
