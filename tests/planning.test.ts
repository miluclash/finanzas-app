import { describe, expect, it } from 'vitest'
import { availableCash } from '../src/shared/domain/available'
import { budgetReport } from '../src/shared/domain/budgets'
import { forecast } from '../src/shared/domain/forecast'
import { goalProgress } from '../src/shared/domain/goals'
import { occurrences, ruleStatus } from '../src/shared/domain/recurring'
import { copyBudgets, saveAllocation, saveGoal, saveRecurring, setBudget } from '../src/main/services/planning'
import { saveTransaction } from '../src/main/services/transactions'
import type { RecurringRule } from '../src/shared/types'
import { account, cat, memoryApp, transfer, tx } from './helpers'

const baseRule: RecurringRule = {
  id: 'R',
  concept: 'Gimnasio',
  kind: 'EXPENSE',
  amountCents: 3995,
  frequency: 'MONTHLY',
  startDate: '2026-01-31',
  endDate: null,
  categoryId: null,
  accountId: 'A',
  toAccountId: null,
  essential: false,
  active: true,
  minCents: null,
  maxCents: null,
  notes: null,
  createdAt: '',
  updatedAt: ''
}

describe('recurrentes', () => {
  it('genera fechas mensuales respetando el día ancla y el fin de mes', () => {
    expect(occurrences(baseRule, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(occurrences({ ...baseRule, frequency: 'QUARTERLY', startDate: '2026-01-15' }, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15'
    ])
    expect(occurrences({ ...baseRule, endDate: '2026-02-28' }, '2026-01-01', '2026-12-31')).toEqual(['2026-01-31', '2026-02-28'])
  })

  it('empareja el cargo real con la fecha prevista y avanza la próxima fecha', async () => {
    const s = await memoryApp('2026-10-11')
    const a = account(s, { name: 'Corriente', openingBalanceCents: 50000 })
    const gym = cat(s, 'Gimnasio')
    const r = saveRecurring(s, {
      concept: 'Gimnasio',
      kind: 'EXPENSE',
      amountCents: 3995,
      frequency: 'MONTHLY',
      startDate: '2026-10-03',
      accountId: a.id,
      categoryId: gym
    })
    // sin registrar: el cargo del 03/10 aparece como pendiente de registrar
    expect(ruleStatus(s.ctx(), r).overdue).toEqual(['2026-10-03'])
    expect(availableCash(s.ctx()).pendingCents).toBe(3995)
    // pagado un día antes, sin enlazar: lo reconoce igual
    tx(s, { accountId: a.id, amountCents: -3995, categoryId: gym, date: '2026-10-02' })
    expect(ruleStatus(s.ctx(), r).nextDate).toBe('2026-11-03')
    expect(ruleStatus(s.ctx(), r).overdue).toEqual([])
    // no se cuenta como pendiente en el disponible
    expect(availableCash(s.ctx()).pendingCents).toBe(0)
  })

  it('un cobro único queda terminado al registrarse', async () => {
    const s = await memoryApp('2026-10-11')
    const a = account(s, { name: 'Corriente' })
    const prac = cat(s, 'Prácticas')
    const r = saveRecurring(s, { concept: 'Parcial', kind: 'INCOME', amountCents: 17341, frequency: 'ONE_OFF', startDate: '2026-10-05', accountId: a.id, categoryId: prac })
    tx(s, { accountId: a.id, amountCents: 14872, categoryId: prac, date: '2026-10-09' })
    expect(ruleStatus(s.ctx(), r).finished).toBe(true)
  })
})

describe('objetivos', () => {
  it('con hucha vinculada el progreso es su saldo (sin doble conteo)', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 100000 })
    const h = account(s, { name: 'Hucha C1', type: 'SAVINGS', includeLiquidity: false })
    const g = saveGoal(s, { name: 'C1', type: 'REQUIRED', priority: 'HIGH', targetCents: 25100, linkedAccountId: h.id })
    transfer(s, a.id, h.id, 25000, '2026-09-10')
    const p = goalProgress(s.ctx(), g)
    expect(p.currentCents).toBe(25000)
    expect(p.remainingCents).toBe(100)
    expect(p.reservedFromAvailableCents).toBe(0)
    expect(() => saveAllocation(s, { goalId: g.id, date: '2026-10-01', amountCents: 100, accountId: a.id })).toThrow(/hucha vinculada/)
  })

  it('las reservas en la cuenta corriente restan del disponible y los gastos del objetivo las consumen', async () => {
    const s = await memoryApp('2026-10-11')
    const a = account(s, { name: 'Corriente', openingBalanceCents: 60000 })
    const g = saveGoal(s, { name: 'HYROX', type: 'PLANNED', priority: 'MEDIUM', targetCents: 13900, deadline: '2027-03-20' })
    saveAllocation(s, { goalId: g.id, date: '2026-10-05', amountCents: 5000, accountId: a.id })
    expect(availableCash(s.ctx()).availableCents).toBe(55000)
    expect(goalProgress(s.ctx(), g).currentCents).toBe(5000)
    saveTransaction(s, { accountId: a.id, date: '2026-10-08', description: 'Inscripción', amountCents: -3000, type: 'EXPENSE', categoryId: cat(s, 'Aficiones'), goalId: g.id })
    // la reserva baja a 20 € y el saldo a 570 €: disponible 550 €
    expect(availableCash(s.ctx()).reservationsCents).toBe(2000)
    expect(availableCash(s.ctx()).availableCents).toBe(55000)
    expect(goalProgress(s.ctx(), g).monthlyNeededCents).toBe(Math.ceil(8900 / 5))
  })
})

describe('presupuestos', () => {
  it('son por mes y se copian sin pisar los existentes', async () => {
    const s = await memoryApp('2026-10-11')
    const food = cat(s, 'Alimentación')
    const fun = cat(s, 'Salir fuera')
    setBudget(s, { month: '2026-09', categoryId: food, amountCents: 10000 })
    setBudget(s, { month: '2026-09', categoryId: fun, amountCents: 5000 })
    setBudget(s, { month: '2026-10', categoryId: fun, amountCents: 8000 })
    expect(copyBudgets(s, '2026-09', '2026-10')).toBe(1)
    const oct = budgetReport(s.ctx(), '2026-10')
    expect(oct.totalBudgetCents).toBe(18000)
    const sep = budgetReport(s.ctx(), '2026-09')
    expect(sep.totalBudgetCents).toBe(15000)
  })

  it('avisa al superar el presupuesto', async () => {
    const s = await memoryApp('2026-10-31')
    const a = account(s, { name: 'Corriente', openingBalanceCents: 50000 })
    const food = cat(s, 'Alimentación')
    setBudget(s, { month: '2026-10', categoryId: food, amountCents: 1000 })
    tx(s, { accountId: a.id, amountCents: -1500, categoryId: food, date: '2026-10-10' })
    const l = budgetReport(s.ctx(), '2026-10').lines.find((x) => x.categoryId === food)!
    expect(l.state).toBe('OVER')
    expect(l.remainingCents).toBe(-500)
  })
})

describe('previsión', () => {
  it('cuenta ingresos y cargos futuros, resta aportaciones a inversión y no repite lo ya registrado', async () => {
    const s = await memoryApp('2026-10-11')
    const a = account(s, { name: 'Corriente', openingBalanceCents: 60000 })
    const broker = account(s, { name: 'Bróker', type: 'INVESTMENT', includeLiquidity: false })
    saveRecurring(s, { concept: 'Nómina', kind: 'INCOME', amountCents: 54500, frequency: 'MONTHLY', startDate: '2026-11-02', endDate: '2027-05-07', accountId: a.id, categoryId: cat(s, 'Prácticas') })
    saveRecurring(s, { concept: 'Gimnasio', kind: 'EXPENSE', amountCents: 3995, frequency: 'MONTHLY', startDate: '2026-10-03', accountId: a.id, categoryId: cat(s, 'Gimnasio') })
    saveRecurring(s, { concept: 'Plan inversión', kind: 'TRANSFER', amountCents: 20000, frequency: 'MONTHLY', startDate: '2026-10-16', accountId: a.id, toAccountId: broker.id })
    tx(s, { accountId: a.id, amountCents: -3995, categoryId: cat(s, 'Gimnasio'), date: '2026-10-02' })
    const sc = s.ctx().scenarios.find((x) => x.name === 'Base')!
    const f = forecast(s.ctx(), { ...sc, variableMonthlyCents: 0 })
    // octubre: el gimnasio ya está pagado; queda el plan de inversión
    expect(f.rows[0].fixedCents).toBe(0)
    expect(f.rows[0].transfersCents).toBe(-20000)
    expect(f.rows[1].incomeCents).toBe(54500)
    expect(f.rows[1].netCents).toBe(54500 - 3995 - 20000)
    // la nómina termina en mayo
    expect(f.rows.find((r) => r.month === '2027-06')!.incomeCents).toBe(0)
    expect(f.startCashCents).toBe(56005)
    const cons = forecast(s.ctx(), { ...sc, incomeFactor: '0.9', expenseFactor: '1', variableMonthlyCents: 0 })
    expect(cons.rows[1].incomeCents).toBe(49050)
  })
})
