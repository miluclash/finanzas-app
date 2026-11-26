// Revisión de F5: puntos `ratio` con denominador 0 (la tasa de ahorro de un mes sin ingresos) y series
// de referencia (el presupuesto). Datos del dorado sintético, inventados. Hoy = 25/11/2026.
import { beforeAll, describe, expect, it } from 'vitest'
import { AppState } from '../../src/main/modules/finanzas/state'
import { combine, seriesTotal } from '../../src/shared/core/charts'
import type { ChartSpec } from '../../src/shared/core/metrics-types'
import { entrenoApp, type EntrenoApp } from '../entreno/helpers'
import { buildSyntheticApp } from '../golden/synthetic'

const HOY = '2026-11-25'
let app: EntrenoApp

beforeAll(async () => {
  app = await entrenoApp()
  app.ctx.todayOverride = HOY
  buildSyntheticApp(AppState.for(app.ctx))
  app.ctx.todayOverride = HOY
}, 120_000)

const data = (spec: ChartSpec) => {
  const r = app.h['core:charts.data'](spec)
  if (!r.ok) throw new Error(r.issues[0].message)
  return r.data
}
const tasa = (over: Partial<ChartSpec>): ChartSpec => ({
  version: 1,
  type: 'line',
  series: [{ metricId: 'finanzas.tasa-ahorro' }],
  groupBy: 'month',
  range: { kind: 'absolute', from: '2026-01-01', to: '2026-12-31' },
  ...over
})

describe('ratio con denominador 0', () => {
  it('el mes con movimientos y sin ingresos sale vacío, pero cuenta en el año (Σnum/Σden)', () => {
    const meses = app.h['finanzas:monthly.summaries'](12, '2026-11').filter((m) => m.txCount > 0 && m.month.startsWith('2026'))
    const sinIngresos = meses.filter((m) => m.incomeCents === 0)
    expect(sinIngresos.length).toBeGreaterThan(0)
    const num = meses.reduce((a, m) => a + m.netCashFlowCents, 0)
    const den = meses.reduce((a, m) => a + m.incomeCents, 0)

    const d = data(tasa({}))
    const porMes = new Map(d.points.map((p) => [p.key, p.values.s0]))
    for (const m of sinIngresos) expect(porMes.get(m.month)).toBeNull()
    for (const m of meses.filter((x) => x.incomeCents > 0)) expect(porMes.get(m.month)).toBeCloseTo(m.netCashFlowCents / m.incomeCents, 12)
    const fila = d.table.rows.find((r) => r.key === sinIngresos[0].month)!
    expect(fila.cells[0]).toBeNull()
    // El total y el año derivado sí suman su numerador y su denominador.
    expect(d.series[0].total).toBeCloseTo(num / den, 12)
    const anual = data(tasa({ groupBy: 'year' }))
    expect(anual.points[0].values.s0).toBeCloseTo(num / den, 12)
    expect(num / den).toBeCloseTo(0.198, 3)
  })

  it('si Σden es 0, el total es null (nunca 0 %)', () => {
    expect(seriesTotal([{ key: 'a', value: 0, num: -500, den: 0 }], 'ratio', 'time')).toBeNull()
    expect(combine([{ key: 'a', value: 0, num: -500, den: 0 }], 'ratio')).toEqual({ value: 0, num: -500, den: 0 })
    expect(seriesTotal([{ key: 'a', value: 0, num: -500, den: 0 }, { key: 'b', value: 0.5, num: 1000, den: 2000 }], 'ratio', 'time')).toBe(0.25)
  })
})

describe('series de referencia', () => {
  it('el presupuesto se publica como referencia y llega marcado al gráfico (también su periodo anterior)', () => {
    const metas = app.h['core:metrics.list']()
    expect(metas.find((m) => m.id === 'finanzas.presupuesto')?.presentation).toBe('reference')
    expect(metas.filter((m) => m.presentation === 'reference').map((m) => m.id)).toEqual(['finanzas.presupuesto'])
    const d = data({
      version: 1,
      type: 'bar',
      series: [{ metricId: 'finanzas.presupuesto' }, { metricId: 'finanzas.gastos' }],
      groupBy: 'month',
      range: { kind: 'last', unit: 'month', count: 3 },
      comparePrevious: true
    })
    expect(d.series.map((s) => [s.id, !!s.reference, s.previous])).toEqual([
      ['s0', true, false],
      ['s1', false, false],
      ['p0', true, true],
      ['p1', false, true]
    ])
  })
})
