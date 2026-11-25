// Motor de gráficos: de una especificación válida a los datos que dibuja la interfaz. Puro: las
// métricas llegan por `fetch` (en la app, `core:metrics.compute`) y la fecha de hoy por `now`.
//
// - Eje x: en agrupaciones de tiempo, todas las claves del rango (también las vacías); en
//   dimensiones, las claves con datos en el orden en que llegan.
// - Valores que faltan: 0 en métricas `sum` (no hay gasto = 0 €) y null en las demás (no hay saldo
//   ni marca ese periodo).
// - Año derivado: si la métrica no admite `year` pero sí `month`, se pide por meses y se reagrupa.
// - División (`splitBy`): una serie por valor. Si hay más de `MAX_SPLITS`, en métricas `sum` los de
//   menor total se juntan en "Otros"; en las demás se dejan los que más puntos tienen y se avisa.
// - Periodo anterior: cada serie tiene la suya (`p…`), alineada por posición en el eje de tiempo
//   (semana 1 con semana 1) y por clave en dimensiones. Cada punto lleva el rótulo de su pareja.
// - Totales con la agregación de cada métrica (`seriesTotal`): `last` y `ratio` nunca se suman.
// - Dispersión: pares x/y por clave común de las dos series. Tabla: los mismos números.
import type { ISODate } from '../../types'
import type { ChartSpec, ChartValidationIssue, MetricBucket, MetricMeta, MetricQuery, TimeGrouping } from '../metrics-types'
import { regroup, seriesTotal } from './aggregate'
import { isTimeGrouping, timeKeyLabel, timeKeyLongLabel } from './labels'
import { previousRangeFor, resolveRange, timeKeys, type DateRange } from './range'
import type { ChartData, ChartDataPoint, ChartDataSeries, ChartScatter } from './types'
import { nativeGrouping, parseSpec } from './validate'

export type MetricFetcher = (metricId: string, query: MetricQuery) => MetricBucket[]

/** Máximo de series por división (con "Otros" incluida). */
export const MAX_SPLITS = 12

export class ChartSpecError extends Error {
  constructor(readonly issues: ChartValidationIssue[]) {
    super(issues[0]?.message ?? 'Gráfico no válido.')
    this.name = 'ChartSpecError'
  }
}

interface Line {
  id: string
  prevId: string
  label: string
  seriesIndex: number
  meta: MetricMeta
  split?: string | null
  cur: MetricBucket[]
  prev: MetricBucket[]
}

const OTHERS = 'Otros'

function axisLabels(keys: string[], g: TimeGrouping): { label: string; longLabel: string }[] {
  const withYear = keys.length > 1 && keys[0].slice(0, 4) !== keys[keys.length - 1].slice(0, 4)
  return keys.map((k) => ({ label: timeKeyLabel(k, g, withYear), longLabel: timeKeyLongLabel(k, g) }))
}

/** Agrupa los puntos por valor de división, en orden de aparición. */
function bySplit(buckets: MetricBucket[]): Map<string, MetricBucket[]> {
  const m = new Map<string, MetricBucket[]>()
  for (const b of buckets) {
    const k = b.split ?? ''
    const l = m.get(k)
    if (l) l.push(b)
    else m.set(k, [b])
  }
  return m
}

export function buildChartData(input: ChartSpec, metas: readonly MetricMeta[], fetch: MetricFetcher, now: ISODate): ChartData {
  const parsed = parseSpec(input, metas)
  if (!parsed.ok) throw new ChartSpecError(parsed.issues)
  const spec = parsed.spec
  const byId = new Map(metas.map((m) => [m.id, m]))
  const g = spec.groupBy
  const time = isTimeGrouping(g)
  const axis = time ? 'time' : 'dimension'
  const scatter = spec.type === 'scatter'
  const range = resolveRange(spec.range, now)
  const prevRange = spec.comparePrevious && !scatter ? previousRangeFor(spec.range, now) : null
  const curKeys = time ? timeKeys(range.from, range.to, g) : null
  const prevKeys = time && prevRange ? timeKeys(prevRange.from, prevRange.to, g) : null
  const notes: string[] = []

  const load = (i: number, r: DateRange, keys: string[] | null): MetricBucket[] => {
    const s = spec.series[i]
    const meta = byId.get(s.metricId)!
    const native = nativeGrouping(meta, g)
    const q: MetricQuery = { from: r.from, to: r.to, groupBy: native }
    if (spec.splitBy) q.splitBy = spec.splitBy
    if (s.filters && Object.keys(s.filters).length) q.filters = { ...s.filters }
    const raw = fetch(meta.id, q)
    // Reagrupar también junta claves repetidas (con la agregación de la métrica).
    const out = regroup(raw, native === g ? (k) => k : (k) => k.slice(0, 4), meta.aggregation)
    if (!keys) return out
    const inAxis = new Set(keys)
    return out.filter((b) => inAxis.has(b.key))
  }

  // Rótulos de las series: el propio o el nombre de la métrica (numerado si se repite).
  const baseLabels = spec.series.map((s) => s.label || byId.get(s.metricId)!.name)
  const labels = baseLabels.map((l, i) => (baseLabels.filter((x) => x === l).length > 1 && !spec.series[i].label ? `${l} (${i + 1})` : l))

  const lines: Line[] = []
  spec.series.forEach((_, i) => {
    const meta = byId.get(spec.series[i].metricId)!
    const cur = load(i, range, curKeys)
    const prev = prevRange ? load(i, prevRange, prevKeys) : []
    if (!spec.splitBy) {
      lines.push({ id: `s${i}`, prevId: `p${i}`, label: labels[i], seriesIndex: i, meta, cur, prev })
      return
    }
    const curBy = bySplit(cur)
    const prevBy = bySplit(prev)
    const splitLabel = new Map<string, string>()
    for (const b of [...cur, ...prev]) if (b.splitLabel && !splitLabel.has(b.split ?? '')) splitLabel.set(b.split ?? '', b.splitLabel)
    let values = [...curBy.keys()]
    let others: string[] = []
    if (values.length > MAX_SPLITS) {
      if (meta.aggregation === 'sum') {
        const tot = (v: string) => Math.abs(seriesTotal(curBy.get(v)!, 'sum', axis) ?? 0)
        const ranked = [...values].sort((a, b) => tot(b) - tot(a))
        const keep = new Set(ranked.slice(0, MAX_SPLITS - 1))
        others = values.filter((v) => !keep.has(v))
        values = values.filter((v) => keep.has(v))
        notes.push(`Hay ${others.length + values.length} valores; los ${others.length} más pequeños se juntan en «${OTHERS}».`)
      } else {
        const ranked = [...values].sort((a, b) => curBy.get(b)!.length - curBy.get(a)!.length)
        const keep = new Set(ranked.slice(0, MAX_SPLITS))
        notes.push(`Se muestran los ${MAX_SPLITS} valores con más datos de ${values.length}.`)
        values = values.filter((v) => keep.has(v))
      }
    }
    values.forEach((v, j) =>
      lines.push({
        id: `s${i}_${j}`,
        prevId: `p${i}_${j}`,
        label: splitLabel.get(v) ?? (v || '—'),
        seriesIndex: i,
        meta,
        split: v,
        cur: curBy.get(v)!,
        prev: prevBy.get(v) ?? []
      })
    )
    if (others.length) {
      const merge = (by: Map<string, MetricBucket[]>) =>
        regroup(
          others.flatMap((v) => (by.get(v) ?? []).map(({ split: _s, splitLabel: _l, ...b }) => b)),
          (k) => k,
          'sum'
        )
      const j = values.length
      lines.push({ id: `s${i}_${j}`, prevId: `p${i}_${j}`, label: OTHERS, seriesIndex: i, meta, split: null, cur: merge(curBy), prev: merge(prevBy) })
    }
  })

  // Eje x.
  let keys: string[]
  let pointLabels: { label: string; longLabel: string }[]
  let prevLabels: { label: string; longLabel: string }[] = []
  if (time) {
    keys = curKeys!
    pointLabels = axisLabels(keys, g)
    if (prevKeys) prevLabels = axisLabels(prevKeys, g)
  } else {
    const seen = new Map<string, string | undefined>()
    for (const l of lines) for (const b of l.cur) if (!seen.has(b.key) || (!seen.get(b.key) && b.label)) seen.set(b.key, b.label)
    for (const l of lines) for (const b of l.prev) if (!seen.has(b.key) || (!seen.get(b.key) && b.label)) seen.set(b.key, b.label)
    keys = [...seen.keys()]
    pointLabels = keys.map((k) => ({ label: seen.get(k) ?? k, longLabel: seen.get(k) ?? k }))
  }

  const fill = (l: Line) => (l.meta.aggregation === 'sum' ? 0 : null)
  const series: ChartDataSeries[] = []
  for (const l of lines) {
    const base = { seriesIndex: l.seriesIndex, metricId: l.meta.id, aggregation: l.meta.aggregation, ...(l.split !== undefined ? { split: l.split } : {}) }
    series.push({ ...base, id: l.id, label: l.label, previous: false, stackId: 'actual', total: seriesTotal(l.cur, l.meta.aggregation, axis) })
  }
  if (prevRange)
    for (const l of lines) {
      const base = { seriesIndex: l.seriesIndex, metricId: l.meta.id, aggregation: l.meta.aggregation, ...(l.split !== undefined ? { split: l.split } : {}) }
      series.push({ ...base, id: l.prevId, label: `${l.label} · periodo anterior`, previous: true, of: l.id, stackId: 'anterior', total: seriesTotal(l.prev, l.meta.aggregation, axis) })
    }

  const curMaps = lines.map((l) => new Map(l.cur.map((b) => [b.key, b.value])))
  const prevMaps = lines.map((l) => new Map(l.prev.map((b) => [b.key, b.value])))
  const points: ChartDataPoint[] = keys.map((key, idx) => {
    const prevKey = !prevRange ? null : time ? (prevKeys![idx] ?? null) : key
    const values: Record<string, number | null> = {}
    lines.forEach((l, li) => {
      values[l.id] = curMaps[li].get(key) ?? fill(l)
      if (prevRange) values[l.prevId] = prevKey == null ? null : (prevMaps[li].get(prevKey) ?? fill(l))
    })
    const pl = prevKey == null ? null : time ? prevLabels[idx] : pointLabels[idx]
    return {
      key,
      label: pointLabels[idx].label,
      longLabel: pointLabels[idx].longLabel,
      prevKey,
      prevLabel: pl?.label ?? null,
      prevLongLabel: pl?.longLabel ?? null,
      values
    }
  })

  let scatterData: ChartScatter | null = null
  if (scatter) {
    const [a, b] = [curMaps[0], curMaps[1]]
    scatterData = {
      x: series[0],
      y: series[1],
      points: keys.flatMap((key, idx) =>
        a.has(key) && b.has(key) ? [{ key, label: pointLabels[idx].label, longLabel: pointLabels[idx].longLabel, x: a.get(key)!, y: b.get(key)! }] : []
      )
    }
  }

  const unit = byId.get(spec.series[0].metricId)!.unit
  return {
    type: spec.type,
    unit,
    groupBy: g,
    splitBy: spec.splitBy ?? null,
    axis,
    range,
    previous: prevRange,
    now,
    series,
    points,
    target: spec.target ?? null,
    scatter: scatterData,
    table: {
      columns: series.map((s) => ({ id: s.id, label: s.label })),
      rows: points.map((p) => ({ key: p.key, label: p.longLabel, cells: series.map((s) => p.values[s.id] ?? null) })),
      totals: series.map((s) => s.total)
    },
    notes,
    empty: lines.every((l) => l.cur.length === 0)
  }
}
