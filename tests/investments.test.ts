import { describe, expect, it } from 'vitest'
import { computeHoldings, portfolioSummary } from '../src/shared/domain/investments'
import { accountBalance, monthSummary, positionAt } from '../src/shared/domain/ledger'
import { deleteOp, saveBlock, saveInstrument, saveOp, savePrice } from '../src/main/services/investments'
import type { InvestmentOp } from '../src/shared/types'
import { account, memoryApp, transfer } from './helpers'

function op(p: Partial<InvestmentOp>): InvestmentOp {
  return {
    id: p.id ?? Math.random().toString(36),
    date: '2026-01-01',
    accountId: 'B',
    instrumentId: 'I',
    type: 'BUY',
    quantity: null,
    price: null,
    amountCents: null,
    feeCents: 0,
    taxCents: 0,
    splitRatio: null,
    affectsCash: true,
    notes: null,
    createdAt: p.date ?? '2026-01-01',
    updatedAt: '',
    ...p
  }
}

describe('posiciones', () => {
  const ops = [
    op({ id: '1', date: '2026-01-01', type: 'BUY', quantity: '10', price: '10' }),
    op({ id: '2', date: '2026-02-01', type: 'BUY', quantity: '10', price: '20' }),
    op({ id: '3', date: '2026-03-01', type: 'SELL', quantity: '5', price: '30' })
  ]
  it('precio medio ponderado', () => {
    const [h] = computeHoldings(ops, [], 'AVERAGE', '2026-12-31')
    expect(h.units).toBe('15')
    expect(h.costBasisCents).toBe(22500) // 300 € − 5 × 15 €
    expect(h.realizedCents).toBe(7500) // 150 € − 75 €
  })
  it('FIFO', () => {
    const [h] = computeHoldings(ops, [], 'FIFO', '2026-12-31')
    expect(h.costBasisCents).toBe(25000) // quedan 5×10 + 10×20
    expect(h.realizedCents).toBe(10000) // 150 € − 50 €
  })
  it('split y valoración con precio manual', () => {
    const list = [op({ id: '1', type: 'BUY', quantity: '2', price: '100' }), op({ id: '2', date: '2026-06-01', type: 'SPLIT', splitRatio: '10' })]
    const [h] = computeHoldings(list, [{ id: 'p', instrumentId: 'I', date: '2026-07-01', price: '12', notes: null }], 'AVERAGE', '2026-12-31')
    expect(h.units).toBe('20')
    expect(h.avgCost).toBe('10')
    expect(h.marketValueCents).toBe(24000)
    expect(h.unrealizedCents).toBe(4000)
  })
  it('una venta mayor que las unidades se marca como error', () => {
    const [h] = computeHoldings([op({ id: '1', type: 'BUY', quantity: '1', price: '10' }), op({ id: '2', date: '2026-02-01', type: 'SELL', quantity: '2', price: '10' })], [], 'AVERAGE', '2026-12-31')
    expect(h.errors.length).toBe(1)
  })
})

describe('inversiones (integración)', () => {
  it('comprar no es gasto, la comisión sí; aportado y rentabilidad van por separado', async () => {
    const s = await memoryApp('2026-10-20')
    const a = account(s, { name: 'Corriente', openingBalanceCents: 100000 })
    const b = account(s, { name: 'Bróker', type: 'INVESTMENT', includeLiquidity: false, openingDate: '2026-10-01', openingBalanceCents: 155, initialContributionsCents: 32017 })
    const blk = saveBlock(s, { name: 'Núcleo', targetPct: '80', maxPct: null })
    const i = saveInstrument(s, { name: 'MSCI World', isin: 'ie00bj0kdq92', assetClass: 'ETF', blockId: blk.id, accountId: b.id })
    // posición previa a la apertura: cuenta para unidades pero no mueve efectivo
    saveOp(s, { date: '2026-03-01', accountId: b.id, instrumentId: i.id, type: 'BUY', quantity: '1.5', price: '113.36', feeCents: 100 })
    // aportación y compra después de la apertura
    transfer(s, a.id, b.id, 31300, '2026-10-16')
    const buy = saveOp(s, { date: '2026-10-16', accountId: b.id, instrumentId: i.id, type: 'BUY', quantity: '2', price: '141', feeCents: 0 })
    savePrice(s, { instrumentId: i.id, date: '2026-10-20', price: '142.5' })
    const ctx = s.ctx()
    expect(i.isin).toBe('IE00BJ0KDQ92')
    const m = monthSummary(ctx, '2026-10')
    expect(m.totalExpensesCents).toBe(0)
    expect(m.toInvestmentsCents).toBe(31300)
    // efectivo del bróker: 1,55 + 313 − 282 = 32,55 €
    const sum = portfolioSummary(ctx)
    expect(sum.cashCents).toBe(3255)
    expect(sum.holdings[0].units).toBe('3.5')
    expect(sum.totalValueCents).toBe(49875) // 3,5 × 142,5
    expect(sum.contributedCents).toBe(32017 + 31300)
    expect(sum.gainCents).toBe(49875 + 3255 - 63317)
    expect(accountBalance(ctx, b.id)).toBe(3255 + 49875)
    expect(positionAt(ctx, '2026-10-20').investmentsCents).toBe(3255 + 49875)
    // borrar la operación borra sus apuntes de efectivo
    deleteOp(s, buy.id)
    expect(s.ctx().transactions.some((t) => t.investmentOpId === buy.id)).toBe(false)
  })

  it('dividendos netos como ingreso y comisiones como gasto', async () => {
    const s = await memoryApp('2026-10-20')
    const b = account(s, { name: 'Bróker', type: 'INVESTMENT', includeLiquidity: false, openingDate: '2026-01-01' })
    const i = saveInstrument(s, { name: 'Chevron', assetClass: 'STOCK', accountId: b.id })
    saveOp(s, { date: '2026-09-10', accountId: b.id, instrumentId: i.id, type: 'DIVIDEND', amountCents: 81, taxCents: 24 })
    saveOp(s, { date: '2026-09-11', accountId: b.id, instrumentId: null, type: 'FEE', amountCents: 100 })
    const m = monthSummary(s.ctx(), '2026-09')
    expect(m.incomeCents).toBe(57)
    expect(m.totalExpensesCents).toBe(-100)
    expect(() => saveOp(s, { date: '2026-09-12', accountId: b.id, instrumentId: i.id, type: 'SELL', quantity: '1', price: '10' })).toThrow(/supera/)
  })
})
