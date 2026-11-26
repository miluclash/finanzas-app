// Métricas de Finanzas: cada cifra tiene que ser idéntica a la de la función de la que sale.
import { beforeAll, describe, expect, it } from 'vitest'
import { FINANZAS_METRICS, finanzasMetricOptions } from '../src/main/modules/finanzas/metrics'
import { investmentsOverview } from '../src/main/modules/finanzas/investments'
import type { AppState } from '../src/main/modules/finanzas/state'
import type { MetricBucket, MetricQuery } from '../src/shared/core/metrics-types'
import { addMonthsToMonth, monthEnd, monthOf } from '../src/shared/dates'
import { budgetReport } from '../src/shared/modules/finanzas/budgets'
import { liquidityAt, monthSummaries, netWorthSeries, positionAt, trackedMonths } from '../src/shared/modules/finanzas/ledger'
import { buildSyntheticApp } from './golden/synthetic'
import { memoryApp } from './helpers'

let s: AppState
beforeAll(async () => {
  s = await memoryApp('2026-11-25')
  buildSyntheticApp(s)
}, 120_000)

const metric = (id: string) => FINANZAS_METRICS.find((m) => m.id === `finanzas.${id}`)!
const run = (id: string, q: Partial<MetricQuery> = {}): MetricBucket[] =>
  metric(id).compute(s.core, { from: '2026-01-01', to: '2026-12-31', groupBy: 'month', ...q })
const byKey = (b: MetricBucket[]) => new Map(b.map((x) => [x.key, x]))

describe('catálogo', () => {
  it('ids, módulo y unidades', () => {
    expect(FINANZAS_METRICS.length).toBe(14)
    for (const m of FINANZAS_METRICS) {
      expect(m.id.startsWith('finanzas.')).toBe(true)
      expect(m.module).toBe('finanzas')
      expect(['eur_cents', 'pct']).toContain(m.unit)
    }
    expect(new Set(FINANZAS_METRICS.map((m) => m.id)).size).toBe(14)
  })
})

describe('flujos = monthly.summaries', () => {
  const months = () => trackedMonths(s.ctx())
  const cases: Array<[string, (x: ReturnType<typeof monthSummaries> extends Map<string, infer S> ? S : never) => number]> = [
    ['ingresos', (x) => x.incomeCents],
    ['gastos', (x) => -x.totalExpensesCents],
    ['flujo-neto', (x) => x.netCashFlowCents],
    ['aportacion-ahorro', (x) => x.toSavingsCents],
    ['aportacion-inversiones', (x) => x.toInvestmentsCents]
  ]
  for (const [id, pick] of cases) {
    it(`${id}: mes a mes y por año`, () => {
      const ms = months()
      const sums = monthSummaries(s.ctx(), ms)
      const q = { from: `${ms[0]}-01`, to: monthEnd(ms[ms.length - 1]) }
      const got = byKey(run(id, q))
      const years = new Map<string, number>()
      for (const m of ms) {
        const x = sums.get(m)!
        if (x.txCount === 0) {
          expect(got.has(m)).toBe(false)
          continue
        }
        expect(got.get(m)!.value).toBe(pick(x))
        years.set(m.slice(0, 4), (years.get(m.slice(0, 4)) ?? 0) + pick(x))
      }
      const y = byKey(run(id, { ...q, groupBy: 'year' }))
      for (const [k, v] of years) expect(y.get(k)!.value).toBe(v)
      expect(Number.isInteger([...got.values()][0].value)).toBe(true)
    })
  }
  it('hay datos reales en la base sintética', () => {
    expect(run('ingresos').length).toBeGreaterThan(2)
    expect(run('gastos').some((b) => b.value > 0)).toBe(true)
  })
})

describe('gasto por categoría', () => {
  const q = { from: '2026-01-01', to: '2026-12-31' }
  it('sumado = gastos; por categoría y grupo coincide con el resumen', () => {
    const all = run('gasto-categoria', q)
    expect(all.length).toBe(run('gastos', q).length)
    for (const b of all) expect(b.value).toBe(byKey(run('gastos', q)).get(b.key)!.value)
    const sums = monthSummaries(s.ctx(), [...new Set(run('gastos', q).map((b) => b.key))])
    const byCat = run('gasto-categoria', { ...q, groupBy: 'category' })
    for (const b of byCat) {
      let t = 0
      for (const x of sums.values()) t -= x.expensesByCategory[b.key] ?? 0
      expect(b.value).toBe(t)
      expect(b.label).toBeTruthy()
    }
    const byGroup = run('gasto-categoria', { ...q, groupBy: 'categoryGroup' })
    expect(byGroup.reduce((a, b) => a + b.value, 0)).toBe(byCat.reduce((a, b) => a + b.value, 0))
  })
  it('split por categoría y filtros', () => {
    const split = run('gasto-categoria', { ...q, splitBy: 'category' })
    const catId = split[0].split!
    const filtered = run('gasto-categoria', { ...q, filters: { categoryId: catId } })
    const fromSplit = split.filter((b) => b.split === catId)
    expect(filtered.map((b) => [b.key, b.value])).toEqual(fromSplit.map((b) => [b.key, b.value]))
    const gid = s.ctx().categoryById.get(catId)!.groupId
    const g = run('gasto-categoria', { ...q, groupBy: 'categoryGroup', filters: { categoryGroup: gid } })
    expect(g.map((b) => b.key)).toEqual([gid])
    expect(run('gasto-categoria', { ...q, filters: { categoryId: 'no-existe' } })).toEqual([])
  })
})

describe('tasas de ahorro', () => {
  it('num/den da exactamente savingsRate y savingsRateOrdinary', () => {
    const ms = trackedMonths(s.ctx())
    const sums = monthSummaries(s.ctx(), ms)
    const q = { from: `${ms[0]}-01`, to: monthEnd(ms[ms.length - 1]) }
    for (const [id, key] of [
      ['tasa-ahorro', 'savingsRate'],
      ['tasa-ahorro-sin-extra', 'savingsRateOrdinary']
    ] as const) {
      const got = byKey(run(id, q))
      let checked = 0
      for (const m of ms) {
        const x = sums.get(m)!
        if (x.txCount === 0) continue
        const b = got.get(m)!
        if (x[key] === null) {
          // sin ingresos: punto con den = 0 y value = 0 (el motor lo dibuja como «—»)
          expect(b.den).toBe(0)
          expect(b.value).toBe(0)
          continue
        }
        expect(b.value).toBe(x[key])
        expect(b.num! / b.den!).toBe(x[key])
        checked++
        expect(Number.isInteger(b.num!) && Number.isInteger(b.den!)).toBe(true)
      }
      expect(checked).toBeGreaterThan(1)
      // año: Σnum / Σden, nunca la media de las tasas
      const y = run(id, { ...q, groupBy: 'year' })
      for (const b of y) {
        const inYear = ms.filter((m) => m.startsWith(b.key) && sums.get(m)!.txCount > 0)
        const den = inYear.reduce((a, m) => a + sums.get(m)!.incomeCents, 0)
        const num = inYear.reduce((a, m) => a + (id === 'tasa-ahorro' ? sums.get(m)!.netCashFlowCents : sums.get(m)!.netCashFlowCents - sums.get(m)!.extraordinaryCents), 0)
        expect(b.num).toBe(num)
        expect(b.den).toBe(den)
        expect(b.value).toBe(den ? num / den : 0)
      }
    }
  })
})

describe('saldos', () => {
  const ms = () => trackedMonths(s.ctx())
  const full = () => ({ from: `${ms()[0]}-01`, to: '2026-12-31' })
  it('patrimonio = networth.series y liquidez = liquidityAt', () => {
    const series = netWorthSeries(s.ctx())
    const got = byKey(run('patrimonio', full()))
    expect(got.size).toBe(series.length)
    for (const p of series) expect(got.get(p.month)!.value).toBe(p.netWorthCents)
    const liq = byKey(run('liquidez', full()))
    for (const p of series) expect(liq.get(p.month)!.value).toBe(liquidityAt(s.ctx(), p.date))
    const y = byKey(run('patrimonio', { ...full(), groupBy: 'year' }))
    for (const yr of new Set(series.map((p) => p.month.slice(0, 4))))
      expect(y.get(yr)!.value).toBe(series.filter((p) => p.month.startsWith(yr)).pop()!.netWorthCents)
  })
  it('saldo-cuenta: por cuenta, filtro, split y por dimensión', () => {
    const ctx = s.ctx()
    const series = netWorthSeries(ctx)
    const split = run('saldo-cuenta', { ...full(), splitBy: 'account' })
    for (const p of series) for (const a of p.byAccount) {
      const b = split.find((x) => x.key === p.month && x.split === a.accountId)!
      expect(b.value).toBe(a.balanceCents)
      expect(b.splitLabel).toBe(ctx.accountById.get(a.accountId)!.name)
    }
    const acc = series[series.length - 1].byAccount[0]
    const f = run('saldo-cuenta', { ...full(), filters: { accountId: acc.accountId } })
    expect(f[f.length - 1].value).toBe(acc.balanceCents)
    // sin split: suma de las cuentas del mes
    const total = byKey(run('saldo-cuenta', full()))
    for (const p of series) expect(total.get(p.month)!.value).toBe(p.byAccount.reduce((a, x) => a + x.balanceCents, 0))
    // por cuenta: saldo al final del rango
    const byAcc = byKey(run('saldo-cuenta', { ...full(), groupBy: 'account' }))
    const lastPos = series[series.length - 1]
    for (const a of lastPos.byAccount) expect(byAcc.get(a.accountId)!.value).toBe(a.balanceCents)
  })
  it('valor-inversiones = inv.overview.series', () => {
    const ov = investmentsOverview(s)
    expect(ov.series.length).toBeGreaterThan(1)
    const got = byKey(run('valor-inversiones', { from: `${ov.series[0].month}-01`, to: '2026-12-31' }))
    for (const p of ov.series) expect(got.get(p.month)!.value).toBe(p.valueCents)
    const y = byKey(run('valor-inversiones', { from: `${ov.series[0].month}-01`, to: '2026-12-31', groupBy: 'year' }))
    expect(y.get('2026')!.value).toBe(ov.series[ov.series.length - 1].valueCents)
  })
  it('mes parcial: el saldo es el de `to`', () => {
    const b = run('patrimonio', { from: '2026-10-01', to: '2026-10-15' })
    expect(b.length).toBe(1)
    expect(b[0].value).toBe(positionAt(s.ctx(), '2026-10-15').netWorthCents)
  })
  it('no inventa meses futuros', () => {
    const b = run('patrimonio', { from: '2026-10-01', to: '2027-06-30' })
    expect(b.map((x) => x.key)).toEqual(['2026-10', '2026-11'])
    expect(b[1].value).toBe(positionAt(s.ctx(), '2026-11-25').netWorthCents)
  })
})

describe('presupuestos', () => {
  const months = ['2026-08', '2026-09', '2026-10', '2026-11']
  const q = { from: '2026-08-01', to: '2026-11-30' }
  it('presupuesto y gasto presupuestado = budgets.report', () => {
    const p = byKey(run('presupuesto', q))
    const g = byKey(run('gasto-presupuestado', q))
    let seen = 0
    for (const m of months) {
      const r = budgetReport(s.ctx(), m)
      if (!r.lines.some((l) => l.budgetCents !== null)) {
        expect(p.has(m)).toBe(false)
        continue
      }
      seen++
      expect(p.get(m)!.value).toBe(r.totalBudgetCents)
      expect(g.get(m)!.value).toBe(r.totalSpentBudgetedCents)
    }
    expect(seen).toBeGreaterThan(0)
    const y = run('presupuesto', { ...q, groupBy: 'year' })[0]
    expect(y.value).toBe(months.reduce((a, m) => a + budgetReport(s.ctx(), m).totalBudgetCents, 0))
  })
  it('por categoría, split y filtros', () => {
    const r = budgetReport(s.ctx(), '2026-10')
    const line = r.lines.find((l) => l.budgetCents !== null)!
    const byCat = byKey(run('presupuesto', { from: '2026-10-01', to: '2026-10-31', groupBy: 'category' }))
    expect(byCat.get(line.categoryId)!.value).toBe(line.budgetCents)
    const f = run('gasto-presupuestado', { from: '2026-10-01', to: '2026-10-31', filters: { categoryId: line.categoryId } })
    expect(f.map((b) => b.value)).toEqual([line.spentCents])
    const sp = run('presupuesto', { from: '2026-10-01', to: '2026-10-31', splitBy: 'categoryGroup' })
    expect(sp.reduce((a, b) => a + b.value, 0)).toBe(r.totalBudgetCents)
  })
})

describe('casos límite', () => {
  it('rango vacío o al revés', () => {
    for (const m of FINANZAS_METRICS) {
      expect(m.compute(s.core, { from: '2026-05-01', to: '2026-04-01', groupBy: 'month' })).toEqual([])
      expect(m.compute(s.core, { from: '2020-01-01', to: '2020-03-31', groupBy: 'month' }).every((b) => Number.isFinite(b.value))).toBe(true)
    }
    expect(run('ingresos', { from: '2020-01-01', to: '2020-03-31' })).toEqual([])
    expect(run('patrimonio', { from: '2020-01-01', to: '2020-03-31' })).toEqual([])
  })
  it('mes parcial en flujos: cuenta el mes entero', () => {
    const full = run('gastos', { from: '2026-10-01', to: '2026-10-31' })
    const part = run('gastos', { from: '2026-10-10', to: '2026-10-12' })
    expect(part).toEqual(full)
  })
  it('agrupación no admitida', () => {
    expect(run('ingresos', { groupBy: 'category' })).toEqual([])
    expect(addMonthsToMonth(monthOf('2026-11-25'), 0)).toBe('2026-11')
  })
})

describe('opciones', () => {
  it('cuentas, categorías y grupos', () => {
    const ctx = s.ctx()
    const acc = finanzasMetricOptions(s.core, 'account')
    expect(acc.length).toBe(ctx.accounts.length)
    expect(acc.filter((a) => a.inactive).length).toBe(ctx.accounts.filter((a) => !a.active).length)
    const cats = finanzasMetricOptions(s.core, 'category')
    expect(cats.length).toBe(ctx.categories.length + 1)
    expect(cats[0].group).toBeTruthy()
    expect(finanzasMetricOptions(s.core, 'categoryGroup').length).toBe(ctx.groups.length + 1)
    expect(finanzasMetricOptions(s.core, 'exercise')).toEqual([])
  })
})
