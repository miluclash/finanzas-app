import { describe, expect, it } from 'vitest'
import { availableCash } from '../src/shared/domain/available'
import { accountBalance, monthSummary, positionAt } from '../src/shared/domain/ledger'
import { saveTransaction, setStatus } from '../src/main/services/transactions'
import { account, cat, memoryApp, transfer, tx } from './helpers'

describe('saldos y métricas', () => {
  it('saldo = inicial + movimientos válidos desde la apertura (los anulados y anteriores no cuentan)', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 10000, openingDate: '2026-06-01' })
    tx(s, { accountId: a.id, amountCents: -2500, date: '2026-07-01' })
    const old = tx(s, { accountId: a.id, amountCents: -1000, date: '2026-05-15' }) // antes de la apertura
    const c = tx(s, { accountId: a.id, amountCents: -700, date: '2026-07-02' })
    setStatus(s, [c.id], 'CANCELLED')
    expect(old.id).toBeTruthy()
    expect(accountBalance(s.ctx(), a.id)).toBe(7500)
  })

  it('las transferencias propias no son ingreso ni gasto y cuadran', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 50000 })
    const h = account(s, { name: 'Hucha', type: 'SAVINGS', includeLiquidity: false })
    const r = transfer(s, a.id, h.id, 20000, '2026-10-03')
    expect(r.out.amountCents + r.in.amountCents).toBe(0)
    expect(r.out.transferId).toBe(r.in.transferId)
    const m = monthSummary(s.ctx(), '2026-10')
    expect(m.incomeCents).toBe(0)
    expect(m.totalExpensesCents).toBe(0)
    expect(m.toSavingsCents).toBe(20000)
    const p = positionAt(s.ctx(), '2026-10-11')
    expect(p.netWorthCents).toBe(50000)
    expect(p.liquidCents).toBe(30000)
    expect(p.savingsCents).toBe(20000)
  })

  it('los reembolsos restan de la categoría del gasto y no son ingresos', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 10000 })
    const ocio = cat(s, 'Salir fuera')
    const g = tx(s, { accountId: a.id, amountCents: -1350, categoryId: ocio })
    saveTransaction(s, { accountId: a.id, date: '2026-10-02', description: 'Bizum amigo', amountCents: 500, type: 'REFUND', categoryId: ocio, linkedTxId: g.id })
    const m = monthSummary(s.ctx(), '2026-10')
    expect(m.incomeCents).toBe(0)
    expect(m.expensesByCategory[ocio]).toBe(-850)
    expect(m.totalExpensesCents).toBe(-850)
  })

  it('los ajustes cambian el saldo pero no son ingreso ni gasto', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Savings & Investment', type: 'SAVINGS', includeLiquidity: false, openingBalanceCents: 3810 })
    saveTransaction(s, { accountId: a.id, date: '2026-09-30', description: 'Revalorización', amountCents: -71, type: 'ADJUSTMENT' })
    expect(accountBalance(s.ctx(), a.id)).toBe(3739)
    const m = monthSummary(s.ctx(), '2026-09')
    expect(m.incomeCents).toBe(0)
    expect(m.totalExpensesCents).toBe(0)
  })

  it('tasa de ahorro con y sin gastos extraordinarios', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 0 })
    tx(s, { accountId: a.id, amountCents: 100000, date: '2026-09-04' })
    tx(s, { accountId: a.id, amountCents: -20000, date: '2026-09-05' })
    saveTransaction(s, {
      accountId: a.id,
      date: '2026-09-14',
      description: 'Portátil',
      amountCents: -50000,
      type: 'EXPENSE',
      categoryId: cat(s, 'Otros gastos'),
      nature: 'EXTRAORDINARY'
    })
    const m = monthSummary(s.ctx(), '2026-09')
    expect(m.savingsRate).toBeCloseTo(0.3)
    expect(m.savingsRateOrdinary).toBeCloseTo(0.8)
  })

  it('el disponible descuenta reservas en cuentas líquidas pero no las huchas', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 60000 })
    const h = account(s, { name: 'Hucha C1', type: 'SAVINGS', includeLiquidity: false, openingBalanceCents: 25000 })
    const av = availableCash(s.ctx())
    expect(av.liquidityCents).toBe(60000)
    expect(av.availableCents).toBe(60000)
    expect(positionAt(s.ctx(), '2026-10-11').netWorthCents).toBe(85000)
    expect(h.id).toBeTruthy()
  })
})
