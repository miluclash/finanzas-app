// Cómo se combinan varios puntos de una métrica en uno (totales, reagrupado por año, apilado y
// comparación con el periodo anterior), según su `aggregation`:
// - `sum`: suma.
// - `last`: el valor de la clave más alta (el último periodo). Entre claves de una dimensión (p. ej.
//   saldo por cuenta) no hay "último": cada clave ya es el último valor de lo suyo, así que el total
//   es la suma (ver `seriesTotal`).
// - `max`: el máximo.
// - `ratio`: Σ numerador / Σ denominador (0 si el denominador es 0). Nunca un promedio de tasas.
import type { MetricAggregation, MetricBucket } from '../metrics-types'

export interface AggPoint {
  key: string
  value: number
  num?: number
  den?: number
}

export interface AggResult {
  value: number
  num?: number
  den?: number
}

/** Orden de claves: numérico si las dos son números enteros (ids), si no, como texto. */
export function compareKeys(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b)
  return a < b ? -1 : a > b ? 1 : 0
}

export class RatioWithoutPartsError extends Error {
  constructor(key: string) {
    super(`Un punto de una métrica de proporción no trae numerador y denominador (clave ${key}).`)
    this.name = 'RatioWithoutPartsError'
  }
}

/** Combina puntos con la agregación de la métrica. null si no hay ningún punto. */
export function combine(points: readonly AggPoint[], aggregation: MetricAggregation): AggResult | null {
  if (points.length === 0) return null
  switch (aggregation) {
    case 'sum':
      return { value: points.reduce((a, p) => a + p.value, 0) }
    case 'max':
      return { value: Math.max(...points.map((p) => p.value)) }
    case 'last': {
      let best = points[0]
      for (const p of points) if (compareKeys(p.key, best.key) >= 0) best = p
      return { value: best.value }
    }
    case 'ratio': {
      let num = 0
      let den = 0
      for (const p of points) {
        if (typeof p.num !== 'number' || typeof p.den !== 'number') throw new RatioWithoutPartsError(p.key)
        num += p.num
        den += p.den
      }
      return { value: den === 0 ? 0 : num / den, num, den }
    }
  }
}

/**
 * Total de una serie a lo largo del eje. En un eje de tiempo, `last` es el último periodo; en un eje
 * de dimensión, `last` suma (cada clave es un saldo distinto).
 */
export function seriesTotal(points: readonly AggPoint[], aggregation: MetricAggregation, axis: 'time' | 'dimension'): number | null {
  const agg = axis === 'dimension' && aggregation === 'last' ? 'sum' : aggregation
  return combine(points, agg)?.value ?? null
}

/**
 * Reagrupa puntos con otra clave (p. ej. de mes a año: `k => k.slice(0, 4)`), por clave nueva y
 * valor de división, con la agregación de la métrica. Conserva los rótulos y ordena por clave.
 */
export function regroup(buckets: readonly MetricBucket[], keyOf: (key: string) => string, aggregation: MetricAggregation): MetricBucket[] {
  const groups = new Map<string, { key: string; label?: string; split?: string; splitLabel?: string; points: AggPoint[] }>()
  for (const b of buckets) {
    const key = keyOf(b.key)
    const id = `${key}\u0000${b.split ?? ''}`
    let g = groups.get(id)
    if (!g) {
      g = { key, label: key === b.key ? b.label : undefined, split: b.split, splitLabel: b.splitLabel, points: [] }
      groups.set(id, g)
    }
    // La clave original se conserva para que `last` sepa cuál es el último periodo.
    g.points.push({ key: b.key, value: b.value, num: b.num, den: b.den })
  }
  const out: MetricBucket[] = []
  for (const g of groups.values()) {
    const r = combine(g.points, aggregation)!
    const b: MetricBucket = { key: g.key, value: r.value }
    if (g.label !== undefined) b.label = g.label
    if (g.split !== undefined) b.split = g.split
    if (g.splitLabel !== undefined) b.splitLabel = g.splitLabel
    if (r.num !== undefined) {
      b.num = r.num
      b.den = r.den
    }
    out.push(b)
  }
  return out.sort((a, b) => compareKeys(a.key, b.key))
}
