// Inversiones: bloques de reparto, activos, operaciones (con sus apuntes de efectivo) y precios.
import { cashEffects, computeHoldings, investmentSeries, portfolioSummary } from '@shared/domain/investments'
import { addMonthsToMonth, monthOf } from '@shared/dates'
import { BlockInput, InstrumentInput, OpInput, PriceInput } from '@shared/schemas'
import type { Account, AllocationBlock, Instrument, InvestmentOp, Price, Transaction } from '@shared/types'
import { audit } from '../db/store'
import { entityToRow, insertRow, nextId, rowToEntity, selectById, updateRow } from '../db/tables'
import { deleteEntity, friendlySqlError, parseInput, saveEntity } from './crud'
import { UserError, type AppState } from './state'

export function investmentsOverview(s: AppState) {
  const ctx = s.ctx()
  const summary = portfolioSummary(ctx)
  const firstOp = ctx.ops[0]
  let from = monthOf(ctx.settings.trackingStart)
  if (firstOp && monthOf(firstOp.date) < from) from = monthOf(firstOp.date)
  // como mucho 36 meses de historia
  const minFrom = addMonthsToMonth(monthOf(ctx.today), -35)
  if (from < minFrom) from = minFrom
  return { summary, series: ctx.ops.length || summary.cashCents ? investmentSeries(ctx, from) : [] }
}

export function saveBlock(s: AppState, input: BlockInput): AllocationBlock {
  const d = parseInput(BlockInput, input)
  const t = Number(d.targetPct)
  if (t < 0 || t > 100) throw new UserError('El porcentaje objetivo debe estar entre 0 y 100.')
  if (d.maxPct !== null && (Number(d.maxPct) < 0 || Number(d.maxPct) > 100)) throw new UserError('El máximo debe estar entre 0 y 100.')
  return saveEntity<AllocationBlock>(
    s,
    'allocation_blocks',
    d.id,
    (ex, id) => ({ id, name: d.name, targetPct: d.targetPct, maxPct: d.maxPct, notes: d.notes, sortOrder: d.sortOrder ?? ex?.sortOrder ?? 0 }),
    (b) => b.name
  )
}

export function deleteBlock(s: AppState, id: string): void {
  deleteEntity(s, 'allocation_blocks', id)
}

export function saveInstrument(s: AppState, input: InstrumentInput): Instrument {
  const d = parseInput(InstrumentInput, input)
  return saveEntity<Instrument>(
    s,
    'instruments',
    d.id,
    (ex, id, now) => ({
      id,
      name: d.name,
      ticker: d.ticker,
      isin: d.isin ? d.isin.toUpperCase() : null,
      assetClass: d.assetClass,
      currency: d.currency.toUpperCase(),
      region: d.region,
      sector: d.sector,
      blockId: d.blockId,
      maxWeightPct: d.maxWeightPct,
      accountId: d.accountId,
      active: d.active,
      notes: d.notes,
      createdAt: ex?.createdAt ?? now,
      updatedAt: now
    }),
    (i) => i.name
  )
}

export function deleteInstrument(s: AppState, id: string): void {
  const n = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM investment_ops WHERE instrument_id = ?', [id])!.n
  if (n) throw new UserError(`El activo tiene ${n} operaciones. Bórralas antes o márcalo como inactivo.`)
  deleteEntity(s, 'instruments', id)
}

/** Regenera los apuntes de efectivo de una operación (se borran y se crean de nuevo). */
function syncCashTransactions(s: AppState, op: InvestmentOp): void {
  s.db.run('DELETE FROM transactions WHERE investment_op_id = ?', [op.id])
  if (!op.affectsCash) return
  // Antes de la apertura de la cuenta el efectivo ya está dentro del saldo inicial: no se generan apuntes
  const acc = selectById<Account>(s.db, 'accounts', op.accountId)
  if (acc && op.date < acc.openingDate) return
  const settings = s.snap().settings
  const inst = op.instrumentId ? selectById<Instrument>(s.db, 'instruments', op.instrumentId) : null
  const now = s.now()
  for (const eff of cashEffects(op, inst?.name ?? '')) {
    const categoryId =
      eff.role === 'FEE' ? settings.investmentFeeCategoryId : eff.role === 'INCOME' ? settings.investmentIncomeCategoryId : null
    if ((eff.role === 'FEE' || eff.role === 'INCOME') && !categoryId)
      throw new UserError(
        'Configura en Ajustes las categorías para comisiones y rendimientos de inversión antes de registrar esta operación.'
      )
    const tx: Transaction = {
      id: nextId(s.db, 'transactions'),
      date: op.date,
      accountId: op.accountId,
      description: eff.description,
      amountCents: eff.amountCents,
      currency: 'EUR',
      type: eff.type,
      categoryId,
      subcategoryId: null,
      merchant: null,
      recurringId: null,
      goalId: null,
      transferId: null,
      linkedTxId: null,
      investmentOpId: op.id,
      status: 'CONFIRMED',
      nature: null,
      source: 'Inversiones',
      notes: op.notes,
      createdAt: now,
      updatedAt: now
    }
    insertRow(s.db, 'transactions', entityToRow('transactions', tx as unknown as Record<string, unknown>))
  }
}

export function saveOp(s: AppState, input: OpInput): InvestmentOp {
  const d = parseInput(OpInput, input)
  const ctx = s.ctx()
  const acc = ctx.accountById.get(d.accountId)
  if (!acc) throw new UserError('La cuenta no existe.')
  if (d.instrumentId && !ctx.instrumentById.get(d.instrumentId)) throw new UserError('El activo no existe.')
  try {
    return s.db.tx(() => {
      const existing = d.id ? selectById<InvestmentOp>(s.db, 'investment_ops', d.id) : null
      if (d.id && !existing) throw new UserError('La operación no existe.')
      const now = s.now()
      const op: InvestmentOp = {
        id: existing?.id ?? nextId(s.db, 'investment_ops'),
        date: d.date,
        accountId: d.accountId,
        instrumentId: d.instrumentId,
        type: d.type,
        quantity: d.type === 'BUY' || d.type === 'SELL' ? d.quantity : null,
        price: d.type === 'BUY' || d.type === 'SELL' ? d.price : null,
        amountCents: d.type === 'DIVIDEND' || d.type === 'INTEREST' || d.type === 'FEE' ? d.amountCents : null,
        feeCents: d.feeCents,
        taxCents: d.taxCents,
        splitRatio: d.type === 'SPLIT' ? d.splitRatio : null,
        affectsCash: d.affectsCash,
        notes: d.notes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
      const row = entityToRow('investment_ops', op as unknown as Record<string, unknown>)
      if (existing) {
        updateRow(s.db, 'investment_ops', op.id, row)
        audit(s.db, 'investment_ops', op.id, 'update', `${op.type} ${op.instrumentId ?? ''}`, existing, op)
      } else {
        insertRow(s.db, 'investment_ops', row)
        audit(s.db, 'investment_ops', op.id, 'create', `${op.type} ${op.instrumentId ?? ''}`, null, op)
      }
      // Comprobar que una venta no deja unidades negativas
      if (op.type === 'SELL' && op.instrumentId) {
        const all = s.db
          .all('SELECT * FROM investment_ops WHERE instrument_id = ? AND account_id = ?', [op.instrumentId, op.accountId])
          .map((r) => rowToEntity<InvestmentOp>('investment_ops', r))
        const h = computeHoldings(all, [], ctx.settings.costMethod, '9999-12-31')
        if (h.some((x) => x.errors.length)) throw new UserError('La venta supera las unidades que tenías en esa fecha.')
      }
      syncCashTransactions(s, op)
      return selectById<InvestmentOp>(s.db, 'investment_ops', op.id)!
    })
  } catch (e) {
    if (e instanceof UserError) throw e
    friendlySqlError(e)
  }
}

export function deleteOp(s: AppState, id: string): void {
  s.db.tx(() => {
    s.db.run('DELETE FROM transactions WHERE investment_op_id = ?', [id])
    deleteEntity(s, 'investment_ops', id, `Operación ${id}`)
  })
}

export function savePrice(s: AppState, input: PriceInput): Price {
  const d = parseInput(PriceInput, input)
  const ex = s.db.get<{ id: string }>('SELECT id FROM prices WHERE instrument_id = ? AND date = ?', [d.instrumentId, d.date])
  const id = d.id ?? ex?.id ?? null
  return saveEntity<Price>(
    s,
    'prices',
    id,
    (_e, newId) => ({ id: newId, instrumentId: d.instrumentId, date: d.date, price: d.price, notes: d.notes }),
    (p) => `Precio ${p.instrumentId} ${p.date}`
  )
}

export function deletePrice(s: AppState, id: string): void {
  deleteEntity(s, 'prices', id, `Precio ${id}`)
}
