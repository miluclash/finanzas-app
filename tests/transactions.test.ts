import { describe, expect, it } from 'vitest'
import { accountBalance, monthSummary } from '../src/shared/domain/ledger'
import { budgetReport } from '../src/shared/domain/budgets'
import { setBudget } from '../src/main/services/planning'
import {
  deleteTransaction,
  dismissDuplicate,
  listTransactions,
  reviewQueue,
  saveTransaction,
  saveTransfer,
  setStatus,
  validateDraft
} from '../src/main/services/transactions'
import { account, cat, memoryApp, transfer, tx } from './helpers'

describe('movimientos (integración)', () => {
  it('alta, búsqueda, edición y recálculo de saldos, presupuestos y flujo', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 20000 })
    const food = cat(s, 'Alimentación')
    setBudget(s, { month: '2026-10', categoryId: food, amountCents: 10000 })
    const t = tx(s, { accountId: a.id, amountCents: -2500, description: 'Mercadona', categoryId: food, date: '2026-10-05' })
    expect(listTransactions(s, { search: 'mercad' }).rows.map((r) => r.id)).toEqual([t.id])
    expect(accountBalance(s.ctx(), a.id)).toBe(17500)
    expect(budgetReport(s.ctx(), '2026-10').lines.find((l) => l.categoryId === food)?.spentCents).toBe(2500)
    // editar el importe recalcula todo
    saveTransaction(s, { ...t, amountCents: -4000, newSubcategoryName: 'Supermercado' })
    expect(accountBalance(s.ctx(), a.id)).toBe(16000)
    expect(budgetReport(s.ctx(), '2026-10').lines.find((l) => l.categoryId === food)?.spentCents).toBe(4000)
    expect(monthSummary(s.ctx(), '2026-10').netCashFlowCents).toBe(-4000)
    expect(s.snap().subcategories.some((x) => x.name === 'Supermercado' && x.categoryId === food)).toBe(true)
    // la auditoría registra alta y cambio
    const log = s.db.all<{ action: string }>("SELECT action FROM audit_log WHERE entity = 'transactions' AND entity_id = ?", [t.id])
    expect(log.map((l) => l.action)).toEqual(['create', 'update'])
  })

  it('rechaza signos y categorías incoherentes', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente' })
    expect(() =>
      saveTransaction(s, { accountId: a.id, date: '2026-10-01', description: 'X', amountCents: 500, type: 'EXPENSE', categoryId: cat(s, 'Alimentación') })
    ).toThrow(/restar dinero/)
    expect(() =>
      saveTransaction(s, { accountId: a.id, date: '2026-10-01', description: 'X', amountCents: 500, type: 'INCOME', categoryId: cat(s, 'Alimentación') })
    ).toThrow(/categoría de gastos/)
    expect(() => saveTransaction(s, { accountId: a.id, date: '2026-10-01', description: 'X', amountCents: -500, type: 'EXPENSE' })).toThrow(/categoría/)
  })

  it('transferencias: dos apuntes que se editan, anulan y borran juntos', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 50000 })
    const h = account(s, { name: 'Hucha', type: 'SAVINGS', includeLiquidity: false })
    const r = transfer(s, a.id, h.id, 10000)
    saveTransfer(s, { transferId: r.out.transferId, date: '2026-10-02', fromAccountId: a.id, toAccountId: h.id, amountCents: 12000, description: 'Traspaso' })
    expect(accountBalance(s.ctx(), h.id)).toBe(12000)
    expect(accountBalance(s.ctx(), a.id)).toBe(38000)
    setStatus(s, [r.in.id], 'CANCELLED')
    expect(accountBalance(s.ctx(), a.id)).toBe(50000)
    expect(s.ctx().transactions.filter((t) => t.transferId === r.out.transferId).every((t) => t.status === 'CANCELLED')).toBe(true)
    expect(deleteTransaction(s, r.out.id)).toBe(2)
    expect(s.ctx().transactions.length).toBe(0)
  })

  it('detecta posibles duplicados sin bloquearlos y permite descartarlos', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 50000 })
    const edu = cat(s, 'Formación')
    const t1 = tx(s, { accountId: a.id, amountCents: -3750, description: 'Cursos certificado IBM (Coursera)', categoryId: edu, date: '2026-09-26' })
    const check = validateDraft(s, {
      id: null,
      date: '2026-09-28',
      accountId: a.id,
      description: 'Cursos Certificado IBM (Coursera)',
      amountCents: -3750,
      type: 'EXPENSE',
      categoryId: edu,
      subcategoryId: null,
      goalId: null,
      recurringId: null,
      linkedTxId: null,
      status: 'CONFIRMED',
      transferId: null
    })
    expect(check.errors).toEqual([])
    expect(check.warnings.some((w) => w.code === 'POSSIBLE_DUPLICATE')).toBe(true)
    const t2 = tx(s, { accountId: a.id, amountCents: -3750, description: 'Cursos Certificado IBM (Coursera)', categoryId: edu, date: '2026-09-28' })
    expect(reviewQueue(s).duplicates.length).toBe(1)
    dismissDuplicate(s, t1.id, t2.id)
    expect(reviewQueue(s).duplicates.length).toBe(0)
    // mismo importe pero distinta categoría y día: no es duplicado
    tx(s, { accountId: a.id, amountCents: -3750, description: 'Otra cosa', categoryId: cat(s, 'Ropa'), date: '2026-09-27' })
    expect(reviewQueue(s).duplicates.length).toBe(0)
  })

  it('los movimientos pendientes aparecen en la bandeja de revisión', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 50000 })
    const t = tx(s, { accountId: a.id, amountCents: -1000, status: 'PENDING_REVIEW' })
    expect(reviewQueue(s).pending.map((x) => x.id)).toEqual([t.id])
    setStatus(s, [t.id], 'CONFIRMED')
    expect(reviewQueue(s).pending.length).toBe(0)
  })
})
