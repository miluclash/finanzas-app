// Alta, edición, anulación y consulta de movimientos (incluidas transferencias de dos apuntes).
import { categoryKind } from '@shared/domain/ctx'
import { effectiveNature } from '@shared/domain/ledger'
import { suggestRule } from '@shared/domain/recurring'
import { allDuplicatePairs, transactionIssues, validateTransaction, type TxDraft, type ValidationResult } from '@shared/domain/validation'
import { monthOf } from '@shared/dates'
import { firstError, TransferInput, TxFilter, TxInput } from '@shared/schemas'
import type { Transaction, TxStatus } from '@shared/types'
import { audit, setSettings } from '../db/store'
import { entityToRow, insertRow, nextId, nextSequence, selectById, updateRow } from '../db/tables'
import { UserError, type AppState } from './state'

export interface TxRow extends Transaction {
  errors: string[]
  warnings: string[]
}

export interface TxListResult {
  rows: TxRow[]
  total: number
  incomeCents: number
  expenseCents: number
  netCents: number
}

function parse<T>(schema: { parse: (v: unknown) => T }, v: unknown): T {
  try {
    return schema.parse(v)
  } catch (e) {
    throw new UserError(firstError(e))
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function listTransactions(s: AppState, filterIn: TxFilter = {}): TxListResult {
  const f = parse(TxFilter, filterIn)
  const ctx = s.ctx()
  const q = f.search ? norm(f.search) : ''
  let rows = ctx.transactions.filter((t) => {
    if (!f.includeCancelled && t.status === 'CANCELLED' && f.status !== 'CANCELLED') return false
    if (f.status && t.status !== f.status) return false
    if (f.accountId && t.accountId !== f.accountId) return false
    if (f.categoryId) {
      if (f.categoryId === '__none') {
        if (t.categoryId) return false
      } else if (t.categoryId !== f.categoryId) return false
    }
    if (f.groupId) {
      const c = t.categoryId ? ctx.categoryById.get(t.categoryId) : undefined
      if (!c || c.groupId !== f.groupId) return false
    }
    if (f.type && t.type !== f.type) return false
    if (f.types && f.types.length && !f.types.includes(t.type)) return false
    if (f.month && monthOf(t.date) !== f.month) return false
    if (f.from && t.date < f.from) return false
    if (f.to && t.date > f.to) return false
    if (f.goalId && t.goalId !== f.goalId) return false
    if (f.recurringId && t.recurringId !== f.recurringId) return false
    if (f.transferId && t.transferId !== f.transferId) return false
    if (f.nature && (t.type === 'EXPENSE' || t.type === 'REFUND') && effectiveNature(ctx, t) !== f.nature) return false
    if (f.nature && t.type !== 'EXPENSE' && t.type !== 'REFUND') return false
    if (q) {
      const cat = t.categoryId ? ctx.categoryById.get(t.categoryId)?.name ?? '' : ''
      const sub = t.subcategoryId ? ctx.subcategoryById.get(t.subcategoryId)?.name ?? '' : ''
      const hay = norm(
        [t.id, t.description, t.merchant ?? '', t.notes ?? '', cat, sub, (Math.abs(t.amountCents) / 100).toFixed(2).replace('.', ',')].join(' ')
      )
      if (!hay.includes(q)) return false
    }
    return true
  })
  const withIssues: TxRow[] = rows.map((t) => {
    const v = transactionIssues(ctx, t)
    return { ...t, errors: v.errors.map((i) => i.message), warnings: v.warnings.map((i) => i.message) }
  })
  let out = f.onlyIssues ? withIssues.filter((r) => r.errors.length || r.warnings.length) : withIssues
  const dir = f.dir === 'asc' ? 1 : -1
  const key = f.sort ?? 'date'
  out.sort((a, b) => {
    let c = 0
    if (key === 'amount') c = a.amountCents - b.amountCents
    else if (key === 'description') c = a.description.localeCompare(b.description, 'es')
    else if (key === 'account') c = (ctx.accountById.get(a.accountId)?.name ?? '').localeCompare(ctx.accountById.get(b.accountId)?.name ?? '', 'es')
    else if (key === 'category')
      c = (a.categoryId ? ctx.categoryById.get(a.categoryId)?.name ?? '' : '').localeCompare(
        b.categoryId ? ctx.categoryById.get(b.categoryId)?.name ?? '' : '',
        'es'
      )
    if (c === 0) c = a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1
    return c * dir
  })
  let income = 0
  let expense = 0
  for (const t of out) {
    if (t.status === 'CANCELLED') continue
    if (t.type === 'INCOME') income += t.amountCents
    if (t.type === 'EXPENSE' || t.type === 'REFUND') expense += t.amountCents
  }
  const total = out.length
  if (f.offset || f.limit) out = out.slice(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? out.length))
  rows = out
  return { rows: out, total, incomeCents: income, expenseCents: expense, netCents: income + expense }
}

export function getTransaction(s: AppState, id: string) {
  const ctx = s.ctx()
  const t = ctx.txById.get(id)
  if (!t) throw new UserError('El movimiento no existe.')
  const pair = t.transferId ? ctx.transactions.find((o) => o.transferId === t.transferId && o.id !== t.id) ?? null : null
  const refunds = ctx.transactions.filter((o) => o.linkedTxId === t.id)
  const linked = t.linkedTxId ? ctx.txById.get(t.linkedTxId) ?? null : null
  return { tx: t, issues: transactionIssues(ctx, t), pair, refunds, linked }
}

export interface DraftCheck extends ValidationResult {
  suggestedRuleId: string | null
}

export function validateDraft(s: AppState, draft: TxDraft): DraftCheck {
  const ctx = s.ctx()
  const res = validateTransaction(ctx, draft)
  const rule = draft.recurringId ? null : suggestRule(ctx, draft)
  return { ...res, suggestedRuleId: rule?.id ?? null }
}

function ensureSubcategory(s: AppState, categoryId: string, name: string): string {
  const existing = s.db.get<{ id: string }>('SELECT id FROM subcategories WHERE category_id = ? AND name = ? COLLATE NOCASE', [
    categoryId,
    name.trim()
  ])
  if (existing) return existing.id
  const id = nextId(s.db, 'subcategories')
  insertRow(s.db, 'subcategories', { id, category_id: categoryId, name: name.trim(), active: 1 })
  audit(s.db, 'subcategories', id, 'create', name.trim(), null, { categoryId, name })
  return id
}

export function saveTransaction(s: AppState, input: TxInput): Transaction {
  const data = parse(TxInput, input)
  const ctx = s.ctx()
  const existing = data.id ? ctx.txById.get(data.id) : undefined
  if (data.id && !existing) throw new UserError('El movimiento no existe.')
  if (existing?.type === 'TRANSFER') throw new UserError('Las transferencias se editan desde su formulario.')
  if (existing?.investmentOpId) throw new UserError('Este apunte lo genera una operación de inversión: edítalo desde Inversiones.')
  return s.db.tx(() => {
    let subcategoryId = data.subcategoryId
    let freshSub = false
    if (data.newSubcategoryName && data.categoryId) {
      const before = ctx.subcategories.length
      subcategoryId = ensureSubcategory(s, data.categoryId, data.newSubcategoryName)
      freshSub = !ctx.subcategoryById.has(subcategoryId) && before >= 0
    }
    if (subcategoryId && data.categoryId) {
      const sub = s.db.get<{ category_id: string }>('SELECT category_id FROM subcategories WHERE id = ?', [subcategoryId])
      if (!sub || sub.category_id !== data.categoryId) subcategoryId = null
    }
    // Las transferencias/ajustes/inversiones no llevan categoría de gasto
    const needsCat = data.type === 'INCOME' || data.type === 'EXPENSE' || data.type === 'REFUND'
    const draft: TxDraft = {
      id: existing?.id ?? null,
      date: data.date,
      accountId: data.accountId,
      description: data.description,
      amountCents: data.amountCents,
      type: data.type,
      categoryId: needsCat ? data.categoryId : data.categoryId && categoryKind(ctx, data.categoryId) ? data.categoryId : null,
      subcategoryId: needsCat ? subcategoryId : null,
      goalId: data.goalId,
      recurringId: data.recurringId,
      linkedTxId: data.linkedTxId,
      status: data.status,
      transferId: null
    }
    const v = validateTransaction(ctx, freshSub ? { ...draft, subcategoryId: null } : draft)
    if (v.errors.length) throw new UserError(v.errors.map((e) => e.message).join(' '))
    const now = s.now()
    const entity: Transaction = {
      id: existing?.id ?? nextId(s.db, 'transactions'),
      date: data.date,
      accountId: data.accountId,
      description: data.description,
      amountCents: data.amountCents,
      currency: data.currency ?? 'EUR',
      type: data.type,
      categoryId: draft.categoryId,
      subcategoryId: draft.subcategoryId,
      merchant: data.merchant,
      recurringId: data.recurringId,
      goalId: data.goalId,
      transferId: null,
      linkedTxId: data.linkedTxId,
      investmentOpId: null,
      status: data.status,
      nature: data.nature,
      source: data.source ?? existing?.source ?? 'Manual',
      notes: data.notes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    const row = entityToRow('transactions', entity as unknown as Record<string, unknown>)
    if (existing) {
      updateRow(s.db, 'transactions', entity.id, row)
      audit(s.db, 'transactions', entity.id, 'update', entity.description, existing, entity)
    } else {
      insertRow(s.db, 'transactions', row)
      audit(s.db, 'transactions', entity.id, 'create', entity.description, null, entity)
      setSettings(s.db, { lastAccountId: entity.accountId, lastCategoryId: entity.categoryId })
    }
    return selectById<Transaction>(s.db, 'transactions', entity.id)!
  })
}

function nextTransferId(s: AppState): string {
  const rows = s.db.all<{ transfer_id: string }>("SELECT DISTINCT transfer_id FROM transactions WHERE transfer_id LIKE 'TR%'")
  let max = 0
  for (const r of rows) {
    const n = Number(r.transfer_id.slice(2))
    if (Number.isInteger(n) && n > max) max = n
  }
  const seq = s.db.get<{ next_value: number }>("SELECT next_value FROM sequences WHERE name = 'transfer'")
  if (!seq || seq.next_value <= max)
    s.db.run(
      "INSERT INTO sequences (name, next_value) VALUES ('transfer', ?) ON CONFLICT(name) DO UPDATE SET next_value = excluded.next_value",
      [max + 1]
    )
  return nextSequence(s.db, 'transfer', 'TR', 3)
}

export function saveTransfer(s: AppState, input: TransferInput): { out: Transaction; in: Transaction } {
  const data = parse(TransferInput, input)
  const ctx = s.ctx()
  if (data.fromAccountId === data.toAccountId) throw new UserError('Elige dos cuentas distintas.')
  const from = ctx.accountById.get(data.fromAccountId)
  const to = ctx.accountById.get(data.toAccountId)
  if (!from || !to) throw new UserError('Alguna de las cuentas no existe.')
  const legs = data.transferId ? ctx.transactions.filter((t) => t.transferId === data.transferId) : []
  if (data.transferId && legs.length === 0) throw new UserError('La transferencia no existe.')
  return s.db.tx(() => {
    const now = s.now()
    const transferId = data.transferId ?? nextTransferId(s)
    const outOld = legs.find((t) => t.amountCents < 0)
    const inOld = legs.find((t) => t.amountCents > 0)
    const mk = (old: Transaction | undefined, accountId: string, amount: number, isOut: boolean): Transaction => ({
      id: old?.id ?? nextId(s.db, 'transactions'),
      date: data.date,
      accountId,
      description: data.description,
      amountCents: amount,
      currency: 'EUR',
      type: 'TRANSFER',
      categoryId: null,
      subcategoryId: null,
      merchant: null,
      recurringId: isOut ? data.recurringId : null,
      goalId: data.goalId,
      transferId,
      linkedTxId: null,
      investmentOpId: null,
      status: data.status,
      nature: null,
      source: data.source ?? old?.source ?? 'Manual',
      notes: data.notes,
      createdAt: old?.createdAt ?? now,
      updatedAt: now
    })
    const outTx = mk(outOld, data.fromAccountId, -data.amountCents, true)
    const inTx = mk(inOld, data.toAccountId, data.amountCents, false)
    for (const [tx, old] of [
      [outTx, outOld],
      [inTx, inOld]
    ] as Array<[Transaction, Transaction | undefined]>) {
      const row = entityToRow('transactions', tx as unknown as Record<string, unknown>)
      if (old) {
        updateRow(s.db, 'transactions', tx.id, row)
        audit(s.db, 'transactions', tx.id, 'update', `Transferencia ${transferId}`, old, tx)
      } else {
        insertRow(s.db, 'transactions', row)
        audit(s.db, 'transactions', tx.id, 'create', `Transferencia ${transferId}`, null, tx)
      }
    }
    // apuntes sobrantes (si la transferencia tenía más de dos) se anulan
    for (const extra of legs.filter((t) => t.id !== outTx.id && t.id !== inTx.id)) {
      s.db.run("UPDATE transactions SET status = 'CANCELLED', updated_at = ? WHERE id = ?", [now, extra.id])
    }
    return {
      out: selectById<Transaction>(s.db, 'transactions', outTx.id)!,
      in: selectById<Transaction>(s.db, 'transactions', inTx.id)!
    }
  })
}

function expandTransfers(s: AppState, ids: string[]): Transaction[] {
  const ctx = s.ctx()
  const out = new Map<string, Transaction>()
  for (const id of ids) {
    const t = ctx.txById.get(id)
    if (!t) throw new UserError(`El movimiento ${id} no existe.`)
    if (t.investmentOpId) throw new UserError(`${id} lo genera una operación de inversión: gestiónalo desde Inversiones.`)
    out.set(t.id, t)
    if (t.transferId) for (const o of ctx.transactions.filter((x) => x.transferId === t.transferId)) out.set(o.id, o)
  }
  return [...out.values()]
}

export function setStatus(s: AppState, ids: string[], status: TxStatus): number {
  const txs = expandTransfers(s, ids)
  s.db.tx(() => {
    const now = s.now()
    for (const t of txs) {
      if (t.status === status) continue
      s.db.run('UPDATE transactions SET status = ?, updated_at = ? WHERE id = ?', [status, now, t.id])
      audit(s.db, 'transactions', t.id, status === 'CANCELLED' ? 'cancel' : 'status', `${t.status} → ${status}`, { status: t.status }, { status })
    }
  })
  return txs.length
}

export function deleteTransaction(s: AppState, id: string): number {
  const txs = expandTransfers(s, [id])
  s.db.tx(() => {
    for (const t of txs) {
      s.db.run('DELETE FROM transactions WHERE id = ?', [t.id])
      audit(s.db, 'transactions', t.id, 'delete', t.description, t, null)
    }
  })
  return txs.length
}

export function dismissDuplicate(s: AppState, a: string, b: string): void {
  const [x, y] = a < b ? [a, b] : [b, a]
  s.db.tx(() => {
    s.db.run('INSERT OR IGNORE INTO duplicate_dismissals (tx_a, tx_b, created_at) VALUES (?, ?, ?)', [x, y, s.now()])
    audit(s.db, 'transactions', x, 'not_duplicate', `No es duplicado de ${y}`, null, null)
  })
}

export function reviewQueue(s: AppState) {
  const ctx = s.ctx()
  const toRow = (t: Transaction): TxRow => {
    const v = transactionIssues(ctx, t)
    return { ...t, errors: v.errors.map((i) => i.message), warnings: v.warnings.map((i) => i.message) }
  }
  const pending = ctx.transactions.filter((t) => t.status === 'PENDING_REVIEW').map(toRow)
  const issues = ctx.transactions
    .filter((t) => t.status !== 'CANCELLED' && t.status !== 'PENDING_REVIEW')
    .map(toRow)
    .filter((r) => r.errors.length || r.warnings.some((w) => !w.startsWith('Posible duplicado')))
  const duplicates = allDuplicatePairs(ctx).map(([a, b]) => [toRow(ctx.txById.get(a)!), toRow(ctx.txById.get(b)!)] as [TxRow, TxRow])
  return { pending, issues, duplicates }
}

export interface HistorySuggestion {
  description: string
  accountId: string
  type: Transaction['type']
  categoryId: string | null
  subcategoryId: string | null
  merchant: string | null
  lastAmountCents: number
  count: number
}

/** Autocompletado: descripciones anteriores parecidas con su cuenta y categoría. */
export function suggestFromHistory(s: AppState, text: string, limit = 8): HistorySuggestion[] {
  const q = norm(text)
  if (q.length < 2) return []
  const ctx = s.ctx()
  const byDesc = new Map<string, HistorySuggestion & { lastDate: string }>()
  for (const t of ctx.transactions) {
    if (t.status === 'CANCELLED' || t.type === 'TRANSFER' || t.investmentOpId) continue
    const d = norm(t.description)
    const m = norm(t.merchant ?? '')
    if (!d.includes(q) && !m.includes(q)) continue
    const key = d
    const prev = byDesc.get(key)
    if (!prev || t.date >= prev.lastDate)
      byDesc.set(key, {
        description: t.description,
        accountId: t.accountId,
        type: t.type,
        categoryId: t.categoryId,
        subcategoryId: t.subcategoryId,
        merchant: t.merchant,
        lastAmountCents: t.amountCents,
        count: (prev?.count ?? 0) + 1,
        lastDate: t.date
      })
    else prev.count++
  }
  return [...byDesc.values()]
    .sort((a, b) => (norm(a.description).startsWith(q) ? 0 : 1) - (norm(b.description).startsWith(q) ? 0 : 1) || b.count - a.count)
    .slice(0, limit)
    .map(({ lastDate: _l, ...rest }) => rest)
}
