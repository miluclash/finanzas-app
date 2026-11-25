// Validación de especificaciones de gráfico: esquema, versión y las cuatro reglas (una
// especificación que rompe cada una), más dispersión, métricas que ya no existen y filtros.
import { describe, expect, it } from 'vitest'
import { admitsGrouping, chartGroupings, incompatibilityReason, parseSpec, upgradeSpec, validateSpec } from '../../src/shared/core/charts'
import type { ChartSpec, MetricMeta } from '../../src/shared/core/metrics-types'

const meta = (id: string, over: Partial<MetricMeta> = {}): MetricMeta => ({
  id,
  module: 'prueba',
  name: `Métrica ${id}`,
  unit: 'kg',
  aggregation: 'sum',
  groupings: ['day', 'week', 'month', 'exercise'],
  splits: ['exercise', 'kind'],
  filters: ['exerciseId', 'kind'],
  ...over
})

const METAS: MetricMeta[] = [
  meta('volumen'),
  meta('e1rm', { aggregation: 'max', splits: ['exercise'] }),
  meta('solo-mes', { groupings: ['month'] }),
  meta('solo-semana', { groupings: ['week'] }),
  meta('gasto', { unit: 'eur_cents', module: 'finanzas' }),
  meta('saldo', { unit: 'eur_cents', aggregation: 'last', splits: [], filters: [] }),
  meta('sin-division', { splits: [] })
]

const base = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  version: 1,
  type: 'line',
  series: [{ metricId: 'volumen' }],
  groupBy: 'week',
  range: { kind: 'last', unit: 'week', count: 12 },
  ...over
})

const rules = (spec: unknown) => validateSpec(spec, METAS).map((i) => i.rule)
const INGLES = /\b(Invalid|Expected|expected|Unrecognized|received|Too (big|small))\b/

describe('especificación válida', () => {
  it('una serie, varias series, apilado con sum, dispersión con dos y tabla', () => {
    expect(validateSpec(base(), METAS)).toEqual([])
    expect(validateSpec(base({ series: [{ metricId: 'volumen' }, { metricId: 'e1rm', filters: { exerciseId: 3 } }] }), METAS)).toEqual([])
    expect(validateSpec(base({ type: 'stacked', splitBy: 'exercise' }), METAS)).toEqual([])
    expect(validateSpec(base({ type: 'scatter', series: [{ metricId: 'volumen' }, { metricId: 'e1rm' }] }), METAS)).toEqual([])
    expect(validateSpec(base({ type: 'table', comparePrevious: true, target: 100 }), METAS)).toEqual([])
    expect(validateSpec(base({ range: { kind: 'absolute', from: '2026-01-01', to: '2026-03-31' } }), METAS)).toEqual([])
  })

  it('parseSpec devuelve la especificación normalizada', () => {
    const r = parseSpec({ ...base(), series: [{ metricId: '  volumen ', label: ' Mi serie ' }] }, METAS)
    expect(r.ok).toBe(true)
    expect(r.spec?.series[0]).toEqual({ metricId: 'volumen', label: 'Mi serie' })
  })
})

describe('las cuatro reglas', () => {
  it('1. agrupación: cada métrica admite la agrupación del gráfico', () => {
    const issues = validateSpec(base({ series: [{ metricId: 'volumen' }, { metricId: 'solo-mes' }] }), METAS)
    expect(issues).toEqual([{ rule: 'grouping', message: '«Métrica solo-mes» no se puede agrupar por semana.', series: 1 }])
    // El año se deriva de los meses; sin meses, no.
    expect(validateSpec(base({ groupBy: 'year', series: [{ metricId: 'solo-mes' }] }), METAS)).toEqual([])
    expect(rules(base({ groupBy: 'year', series: [{ metricId: 'solo-semana' }] }))).toEqual(['grouping'])
    expect(admitsGrouping(METAS[2], 'year')).toBe(true)
    expect(chartGroupings(METAS[0])).toEqual(['day', 'week', 'month', 'year', 'exercise'])
  })

  it('2. unidad: todas las series con la misma', () => {
    const issues = validateSpec(base({ series: [{ metricId: 'volumen' }, { metricId: 'gasto' }] }), METAS)
    expect(issues).toEqual([
      { rule: 'unit', message: 'Todas las series tienen que tener la misma unidad: «Métrica volumen» va en kg y «Métrica gasto» en euros.', series: 1 }
    ])
  })

  it('3. división: solo con una serie, distinta de la agrupación y admitida por la métrica', () => {
    expect(validateSpec(base({ splitBy: 'exercise', series: [{ metricId: 'volumen' }, { metricId: 'e1rm' }] }), METAS)).toEqual([
      { rule: 'split', message: 'Para dividir por ejercicio, el gráfico tiene que tener una sola serie.' }
    ])
    expect(rules(base({ splitBy: 'exercise', series: [{ metricId: 'sin-division' }] }))).toEqual(['split'])
    expect(rules(base({ splitBy: 'exercise', groupBy: 'exercise' }))).toEqual(['split'])
  })

  it('4. apilado: solo métricas que se suman', () => {
    const issues = validateSpec(base({ type: 'stacked', series: [{ metricId: 'gasto' }, { metricId: 'saldo' }], groupBy: 'month' }), METAS)
    expect(issues).toEqual([{ rule: 'stack', message: 'Las barras apiladas solo valen para métricas que se suman, y «Métrica saldo» no se suma.', series: 1 }])
    expect(rules(base({ type: 'stacked', series: [{ metricId: 'e1rm' }] }))).toEqual(['stack'])
  })

  it('dispersión con una o con tres series', () => {
    expect(validateSpec(base({ type: 'scatter' }), METAS)).toEqual([
      { rule: 'scatter', message: 'La dispersión necesita exactamente dos series, una para cada eje (tiene 1).' }
    ])
    expect(rules(base({ type: 'scatter', series: [{ metricId: 'volumen' }, { metricId: 'e1rm' }, { metricId: 'volumen' }] }))).toEqual(['scatter'])
  })

  it('métrica que ya no existe y filtro no admitido', () => {
    expect(validateSpec(base({ series: [{ metricId: 'borrada' }] }), METAS)).toEqual([
      { rule: 'metric', message: 'La serie 1 usa una métrica que ya no existe (borrada). Edita el gráfico para elegir otra.', series: 0 }
    ])
    expect(validateSpec(base({ series: [{ metricId: 'volumen', filters: { accountId: 2 } }] }), METAS)).toEqual([
      { rule: 'filter', message: '«Métrica volumen» no admite el filtro «cuenta».', series: 0 }
    ])
  })
})

describe('esquema y versión', () => {
  it('mensajes en español para cada error de forma', () => {
    const casos: unknown[] = [
      base({ series: [] }),
      base({ series: Array.from({ length: 7 }, () => ({ metricId: 'volumen' })) }),
      base({ target: Number.POSITIVE_INFINITY }),
      base({ target: Number.NaN }),
      base({ range: { kind: 'absolute', from: '2026-03-01', to: '2026-01-01' } }),
      base({ range: { kind: 'absolute', from: '2026-02-30', to: '2026-03-01' } }),
      base({ range: { kind: 'last', unit: 'week', count: 0 } }),
      base({ range: { kind: 'last', unit: 'day', count: 5000 } }),
      { ...base(), type: 'tarta' },
      { ...base(), groupBy: 'hora' },
      { ...base(), formula: 'eval(1)' },
      { ...base(), series: [{ metricId: 'volumen', filters: { cualquiera: 1 } }] },
      { ...base(), series: [{ metricId: 'volumen', filters: { exerciseId: { $gt: 1 } } }] }
    ]
    for (const c of casos) {
      const issues = validateSpec(c, METAS)
      expect(issues.length, JSON.stringify(c)).toBeGreaterThan(0)
      expect(issues[0].rule).toBe('schema')
      for (const i of issues) expect(i.message).not.toMatch(INGLES)
    }
    expect(validateSpec(base({ series: [] }), METAS)[0].message).toBe('El gráfico necesita al menos una serie.')
    expect(validateSpec({ ...base(), formula: 'x' }, METAS)[0].message).toBe('Hay un campo que no existe: «formula».')
  })

  it('configuraciones antiguas o futuras: la versión 1 pasa tal cual, las demás avisan', () => {
    const v1 = base()
    expect(upgradeSpec(v1)).toEqual({ ok: true, spec: v1 })
    const sinVersion = { ...base() } as Partial<ChartSpec>
    delete sinVersion.version
    expect(validateSpec(sinVersion, METAS)).toEqual([{ rule: 'schema', message: 'A la configuración del gráfico le falta la versión.' }])
    expect(validateSpec({ ...base(), version: 2 }, METAS)[0].message).toMatch(/versión más nueva de la app \(v2\)/)
    expect(validateSpec({ ...base(), version: 'uno' }, METAS)[0].message).toMatch(/desconocida/)
    expect(validateSpec(null, METAS)[0].message).toMatch(/dañada/)
    expect(validateSpec([], METAS)[0].rule).toBe('schema')
  })
})

describe('constructor: métricas desactivadas con su razón', () => {
  it('unidad distinta, agrupación y apilado', () => {
    expect(incompatibilityReason(METAS[4], { first: METAS[0] })).toBe('unidad distinta: euros')
    expect(incompatibilityReason(METAS[3], { first: METAS[0], groupBy: 'month' })).toBe('no se agrupa por mes')
    expect(incompatibilityReason(METAS[1], { first: METAS[0], type: 'stacked' })).toBe('no se suma (no se puede apilar)')
    expect(incompatibilityReason(METAS[1], { first: METAS[0], groupBy: 'week', type: 'line' })).toBeNull()
  })
})
