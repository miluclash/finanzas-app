// Agregaciones (`last` y `ratio` nunca se suman ni se promedian) y el motor `buildChartData` con
// métricas de prueba: eje, año derivado, división, "Otros", periodo anterior, objetivo, dispersión
// y tabla. Datos inventados.
import { describe, expect, it } from 'vitest'
import {
  ChartSpecError,
  MAX_SPLITS,
  buildChartData,
  combine,
  regroup,
  seriesTotal,
  timeKeyOf,
  type MetricFetcher
} from '../../src/shared/core/charts'
import type { ChartSpec, MetricBucket, MetricMeta, MetricQuery, TimeGrouping } from '../../src/shared/core/metrics-types'

describe('agregaciones', () => {
  const pts = [
    { key: '2026-01', value: 10, num: 1, den: 1 },
    { key: '2026-03', value: 30, num: 1, den: 3 },
    { key: '2026-02', value: 20, num: 0, den: 0 }
  ]

  it('sum suma, max toma el máximo', () => {
    expect(combine(pts, 'sum')).toEqual({ value: 60 })
    expect(combine(pts, 'max')).toEqual({ value: 30 })
    expect(combine([], 'sum')).toBeNull()
  })

  it('last: el valor de la clave más alta, nunca la suma', () => {
    expect(combine(pts, 'last')).toEqual({ value: 30 })
    expect(combine([{ key: '9', value: 1 }, { key: '10', value: 2 }], 'last')).toEqual({ value: 2 })
  })

  it('ratio: Σnum/Σden, ni suma ni promedio de tasas', () => {
    const tasas = [
      { key: 'a', value: 1, num: 1, den: 1 },
      { key: 'b', value: 1 / 3, num: 1, den: 3 }
    ]
    const r = combine(tasas, 'ratio')!
    expect(r).toEqual({ value: 0.5, num: 2, den: 4 })
    expect(r.value).not.toBeCloseTo((1 + 1 / 3) / 2, 5) // promedio
    expect(r.value).not.toBeCloseTo(1 + 1 / 3, 5) // suma
    expect(combine([{ key: 'a', value: 0, num: 0, den: 0 }], 'ratio')).toEqual({ value: 0, num: 0, den: 0 })
    expect(() => combine([{ key: 'a', value: 0.5 }], 'ratio')).toThrow(/numerador y denominador/)
  })

  it('totales: en dimensiones, last suma (saldos de cuentas distintas)', () => {
    const cuentas = [
      { key: '1', value: 100 },
      { key: '2', value: 50 }
    ]
    expect(seriesTotal(cuentas, 'last', 'dimension')).toBe(150)
    expect(seriesTotal(cuentas, 'last', 'time')).toBe(50)
    expect(seriesTotal([], 'sum', 'time')).toBeNull()
  })

  it('reagrupar meses en años con cada agregación', () => {
    const meses: MetricBucket[] = [
      { key: '2025-11', value: 5, num: 1, den: 2 },
      { key: '2025-12', value: 7, num: 3, den: 4 },
      { key: '2026-01', value: 1, num: 1, den: 4 }
    ]
    const y = (k: string) => k.slice(0, 4)
    expect(regroup(meses, y, 'last').map((b) => [b.key, b.value])).toEqual([['2025', 7], ['2026', 1]])
    expect(regroup(meses, y, 'sum').map((b) => [b.key, b.value])).toEqual([['2025', 12], ['2026', 1]])
    expect(regroup(meses, y, 'max').map((b) => [b.key, b.value])).toEqual([['2025', 7], ['2026', 1]])
    expect(regroup(meses, y, 'ratio')).toEqual([
      { key: '2025', value: 4 / 6, num: 4, den: 6 },
      { key: '2026', value: 0.25, num: 1, den: 4 }
    ])
  })
})

// ---------------------------------------------------------------------------------------------------
// Métricas de prueba: puntos diarios que el "módulo" agrupa como le piden.
// ---------------------------------------------------------------------------------------------------

interface Fila {
  date: string
  value: number
  num?: number
  den?: number
  split?: string
}

const meta = (id: string, over: Partial<MetricMeta> = {}): MetricMeta => ({
  id,
  module: 'prueba',
  name: id,
  unit: 'eur_cents',
  aggregation: 'sum',
  groupings: ['day', 'week', 'month'],
  splits: ['category'],
  filters: ['categoryId'],
  ...over
})

function fetcher(datos: Record<string, Fila[]>, metas: MetricMeta[], log: MetricQuery[] = []): MetricFetcher {
  return (id, q) => {
    log.push(q)
    const m = metas.find((x) => x.id === id)!
    if (!m.groupings.includes(q.groupBy)) throw new Error(`no admite ${q.groupBy}`)
    const filas = (datos[id] ?? []).filter((f) => f.date >= q.from && f.date <= q.to && (q.filters?.categoryId == null || f.split === q.filters.categoryId))
    const b: MetricBucket[] = filas.map((f) => ({
      key: timeKeyOf(f.date, q.groupBy as TimeGrouping),
      value: f.value,
      ...(f.num !== undefined ? { num: f.num, den: f.den } : {}),
      ...(q.splitBy && f.split ? { split: f.split, splitLabel: `Cat ${f.split}` } : {})
    }))
    return regroup(b, (k) => k, m.aggregation)
  }
}

const METAS = [
  meta('gasto'),
  meta('presupuesto'),
  meta('patrimonio', { aggregation: 'last', splits: [], filters: [] }),
  meta('tasa', { aggregation: 'ratio', unit: 'pct', splits: [], filters: [] }),
  meta('e1rm', { aggregation: 'max', unit: 'kg', groupings: ['week', 'exercise'], splits: [], filters: [] })
]

const HOY = '2026-11-25'

describe('buildChartData', () => {
  it('saldos (last) por mes: hueco = null, total = último, comparación alineada por posición', () => {
    const f = fetcher(
      {
        patrimonio: [
          { date: '2026-09-30', value: 1000 },
          { date: '2026-11-20', value: 1300 },
          { date: '2026-06-30', value: 800 },
          { date: '2026-08-31', value: 900 }
        ]
      },
      METAS
    )
    const spec: ChartSpec = { version: 1, type: 'line', series: [{ metricId: 'patrimonio' }], groupBy: 'month', range: { kind: 'last', unit: 'month', count: 3 }, comparePrevious: true, target: 1500 }
    const d = buildChartData(spec, METAS, f, HOY)
    expect(d.range).toEqual({ from: '2026-09-01', to: HOY })
    expect(d.previous).toEqual({ from: '2026-06-01', to: '2026-08-25' })
    expect(d.points.map((p) => [p.key, p.values.s0, p.prevKey, p.values.p0])).toEqual([
      ['2026-09', 1000, '2026-06', 800],
      ['2026-10', null, '2026-07', null],
      // La comparación del mes en curso se corta el 25: el saldo del 31/8 no entra.
      ['2026-11', 1300, '2026-08', null]
    ])
    expect(d.points.map((p) => p.label)).toEqual(['sep', 'oct', 'nov'])
    expect(d.points[0].prevLabel).toBe('jun')
    expect(d.points[0].longLabel).toBe('septiembre 2026')
    expect(d.series.map((s) => [s.id, s.total, s.previous, s.stackId])).toEqual([
      ['s0', 1300, false, 'actual'],
      ['p0', 800, true, 'anterior']
    ])
    expect(d.series[1]).toMatchObject({ of: 's0', label: 'patrimonio · periodo anterior' })
    expect(d.target).toBe(1500)
    expect(d.unit).toBe('eur_cents')
    expect(d.axis).toBe('time')
    expect(d.table.columns.map((c) => c.id)).toEqual(['s0', 'p0'])
    expect(d.table.totals).toEqual([1300, 800])
    expect(d.empty).toBe(false)
  })

  it('tasa (ratio) por año derivada de meses: Σnum/Σden en cada año y en el total', () => {
    const log: MetricQuery[] = []
    const f = fetcher(
      {
        tasa: [
          { date: '2025-03-10', value: 1, num: 1, den: 1 },
          { date: '2025-04-10', value: 1 / 3, num: 1, den: 3 },
          { date: '2026-01-10', value: 0.5, num: 2, den: 4 }
        ]
      },
      METAS,
      log
    )
    const d = buildChartData({ version: 1, type: 'bar', series: [{ metricId: 'tasa' }], groupBy: 'year', range: { kind: 'last', unit: 'year', count: 2 } }, METAS, f, HOY)
    expect(log[0].groupBy).toBe('month')
    expect(d.points.map((p) => [p.key, p.values.s0])).toEqual([
      ['2025', 0.5],
      ['2026', 0.5]
    ])
    expect(d.series[0].total).toBeCloseTo(4 / 8, 10)
  })

  it('barras apiladas por categoría: una serie por valor, huecos a 0 y totales sumados', () => {
    const f = fetcher(
      {
        gasto: [
          { date: '2026-10-03', value: 100, split: 'a' },
          { date: '2026-10-20', value: 50, split: 'a' },
          { date: '2026-11-02', value: 70, split: 'b' }
        ]
      },
      METAS
    )
    const d = buildChartData(
      { version: 1, type: 'stacked', series: [{ metricId: 'gasto' }], groupBy: 'month', splitBy: 'category', range: { kind: 'last', unit: 'month', count: 2 } },
      METAS,
      f,
      HOY
    )
    expect(d.series.map((s) => [s.id, s.label, s.split, s.total])).toEqual([
      ['s0_0', 'Cat a', 'a', 150],
      ['s0_1', 'Cat b', 'b', 70]
    ])
    expect(d.points.map((p) => p.values)).toEqual([
      { s0_0: 150, s0_1: 0 },
      { s0_0: 0, s0_1: 70 }
    ])
    expect(d.splitBy).toBe('category')
  })

  it('más de 12 valores: en sum, los pequeños se juntan en "Otros"', () => {
    const filas: Fila[] = Array.from({ length: 15 }, (_, i) => ({ date: '2026-11-10', value: 100 - i, split: String(i + 1) }))
    const d = buildChartData(
      { version: 1, type: 'stacked', series: [{ metricId: 'gasto' }], groupBy: 'month', splitBy: 'category', range: { kind: 'this', unit: 'month' } },
      METAS,
      fetcher({ gasto: filas }, METAS),
      HOY
    )
    expect(d.series).toHaveLength(MAX_SPLITS)
    const otros = d.series[MAX_SPLITS - 1]
    expect(otros).toMatchObject({ label: 'Otros', split: null, total: 89 + 88 + 87 + 86 })
    expect(d.notes[0]).toMatch(/Otros/)
    expect(d.series.reduce((a, s) => a + (s.total ?? 0), 0)).toBe(filas.reduce((a, x) => a + x.value, 0))
  })

  it('presupuesto y gasto como dos series; dispersión por clave común', () => {
    const datos = {
      gasto: [
        { date: '2026-09-05', value: 300 },
        { date: '2026-10-05', value: 500 }
      ],
      presupuesto: [
        { date: '2026-10-01', value: 400 },
        { date: '2026-11-01', value: 400 }
      ]
    }
    const series = [{ metricId: 'presupuesto' }, { metricId: 'gasto', label: 'Gastado' }]
    const d = buildChartData({ version: 1, type: 'bar', series, groupBy: 'month', range: { kind: 'last', unit: 'month', count: 3 } }, METAS, fetcher(datos, METAS), HOY)
    expect(d.series.map((s) => [s.id, s.label, s.total])).toEqual([
      ['s0', 'presupuesto', 800],
      ['s1', 'Gastado', 800]
    ])
    expect(d.points.map((p) => [p.values.s0, p.values.s1])).toEqual([[0, 300], [400, 500], [400, 0]])
    const sc = buildChartData({ version: 1, type: 'scatter', series, groupBy: 'month', range: { kind: 'last', unit: 'month', count: 3 }, comparePrevious: true }, METAS, fetcher(datos, METAS), HOY)
    expect(sc.previous).toBeNull()
    expect(sc.scatter!.points).toEqual([{ key: '2026-10', label: 'oct', longLabel: 'octubre 2026', x: 400, y: 500 }])
    expect(sc.scatter!.x.id).toBe('s0')
  })

  it('máximo por semana: semanas sin dato = null, total = máximo', () => {
    const f = fetcher({ e1rm: [{ date: '2026-11-03', value: 100 }, { date: '2026-11-04', value: 105 }, { date: '2026-11-24', value: 102 }] }, METAS)
    const d = buildChartData({ version: 1, type: 'line', series: [{ metricId: 'e1rm' }], groupBy: 'week', range: { kind: 'last', unit: 'week', count: 4 } }, METAS, f, HOY)
    expect(d.points.map((p) => [p.key, p.values.s0])).toEqual([
      ['2026-11-02', 105],
      ['2026-11-09', null],
      ['2026-11-16', null],
      ['2026-11-23', 102]
    ])
    expect(d.series[0].total).toBe(105)
  })

  it('sin datos: empty; especificación inválida: ChartSpecError con los avisos', () => {
    const d = buildChartData({ version: 1, type: 'line', series: [{ metricId: 'gasto' }], groupBy: 'day', range: { kind: 'this', unit: 'week' } }, METAS, fetcher({}, METAS), HOY)
    expect(d.empty).toBe(true)
    expect(d.points.map((p) => p.values.s0)).toEqual([0, 0, 0])
    expect(() =>
      buildChartData({ version: 1, type: 'stacked', series: [{ metricId: 'patrimonio' }], groupBy: 'month', range: { kind: 'this', unit: 'year' } }, METAS, fetcher({}, METAS), HOY)
    ).toThrow(ChartSpecError)
  })
})

describe('buildChartData: revisión de F5', () => {
  // Como los flujos de Finanzas: solo por meses (cuentan el mes entero).
  const MES = [...METAS, meta('flujo', { module: 'finanzas', groupings: ['month', 'category'] })]
  const flujo: Fila[] = [
    { date: '2026-10-05', value: 100 },
    { date: '2026-10-30', value: 50 },
    { date: '2026-11-03', value: 70 },
    { date: '2026-11-28', value: 30 }
  ]

  it('métricas solo por meses: el anterior son meses completos y se avisa si el actual va a medias', () => {
    const spec: ChartSpec = { version: 1, type: 'bar', series: [{ metricId: 'flujo' }], groupBy: 'month', range: { kind: 'this', unit: 'month' }, comparePrevious: true }
    const d = buildChartData(spec, MES, fetcher({ flujo }, MES), '2026-11-26')
    expect(d.previous).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(d.previousFullMonths).toBe(true)
    expect(d.points[0].values).toEqual({ s0: 70, p0: 150 })
    expect(d.notes).toContain('Finanzas calcula por meses completos: el mes en curso se compara con el mes anterior entero.')
    // A fin de mes no hace falta avisar.
    const fin = buildChartData(spec, MES, fetcher({ flujo }, MES), '2026-11-30')
    expect(fin.previous).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(fin.notes).toEqual([])
    // Con métricas que admiten días, el anterior se corta a la misma altura.
    const dia = buildChartData({ ...spec, series: [{ metricId: 'gasto' }] }, MES, fetcher({ gasto: flujo }, MES), '2026-11-26')
    expect(dia.previous).toEqual({ from: '2026-10-01', to: '2026-10-26' })
    expect(dia.previousFullMonths).toBe(false)
    expect(dia.points[0].values).toEqual({ s0: 70, p0: 100 })
  })

  it('periodos futuros de un rango con fechas fijas: sin dato es null, no 0', () => {
    const d = buildChartData(
      { version: 1, type: 'bar', series: [{ metricId: 'gasto' }], groupBy: 'month', range: { kind: 'absolute', from: '2026-10-01', to: '2027-01-31' } },
      METAS,
      fetcher({ gasto: [{ date: '2026-10-05', value: 100 }] }, METAS),
      '2026-11-26'
    )
    expect(d.points.map((p) => [p.key, p.values.s0])).toEqual([
      ['2026-10', 100],
      ['2026-11', 0],
      ['2026-12', null],
      ['2027-01', null]
    ])
  })

  it('un valor de la división que solo está en el periodo anterior también sale', () => {
    const d = buildChartData(
      { version: 1, type: 'stacked', series: [{ metricId: 'gasto' }], groupBy: 'month', splitBy: 'category', range: { kind: 'this', unit: 'month' }, comparePrevious: true },
      METAS,
      fetcher({ gasto: [{ date: '2026-11-02', value: 40, split: 'a' }, { date: '2026-10-02', value: 25, split: 'z' }] }, METAS),
      '2026-11-26'
    )
    const z = d.series.find((s) => s.split === 'z' && !s.previous)!
    const zAnt = d.series.find((s) => s.split === 'z' && s.previous)!
    expect(z.total).toBeNull()
    expect(zAnt.total).toBe(25)
    expect(d.points[0].values[z.id]).toBe(0)
    expect(d.points[0].values[zAnt.id]).toBe(25)
  })

  it('empty tiene en cuenta el periodo anterior', () => {
    const spec: ChartSpec = { version: 1, type: 'bar', series: [{ metricId: 'gasto' }], groupBy: 'month', range: { kind: 'this', unit: 'month' }, comparePrevious: true }
    const f = fetcher({ gasto: [{ date: '2026-10-02', value: 25 }] }, METAS)
    expect(buildChartData(spec, METAS, f, '2026-11-26').empty).toBe(false)
    expect(buildChartData({ ...spec, comparePrevious: false }, METAS, f, '2026-11-26').empty).toBe(true)
  })
})
