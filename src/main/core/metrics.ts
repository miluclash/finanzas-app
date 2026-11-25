// Métricas del registro (`core:metrics.*`): lista de metadatos, cálculo (lo resuelve el módulo
// dueño) y listas para los filtros. Solo leen; no pasan por la cola.
import { MetricQuerySchema, firstZodMessage } from '@shared/core/charts/schema'
import {
  METRIC_OPTION_KINDS,
  type MetricBucket,
  type MetricMeta,
  type MetricOption,
  type MetricOptionKind,
  type MetricQuery
} from '@shared/core/metrics-types'
import type { CoreContext } from './context'
import { UserError } from './errors'
import type { MetricDef } from './registry'

/** Metadatos de una métrica (lo que viaja a la interfaz, sin la función de cálculo). */
export function metaOf(d: MetricDef): MetricMeta {
  const m: MetricMeta = {
    id: d.id,
    module: d.module,
    name: d.name,
    unit: d.unit,
    aggregation: d.aggregation,
    groupings: [...d.groupings],
    splits: [...d.splits],
    filters: [...d.filters]
  }
  if (d.description) m.description = d.description
  return m
}

function checkBuckets(d: MetricDef, out: unknown): MetricBucket[] {
  if (!Array.isArray(out)) throw new Error(`La métrica ${d.id} no ha devuelto una lista de puntos.`)
  for (const b of out as MetricBucket[]) {
    if (!b || typeof b.key !== 'string' || typeof b.value !== 'number' || !Number.isFinite(b.value))
      throw new Error(`La métrica ${d.id} ha devuelto un punto no válido.`)
    if (d.aggregation === 'ratio' && (typeof b.num !== 'number' || typeof b.den !== 'number' || !Number.isFinite(b.num) || !Number.isFinite(b.den)))
      throw new Error(`La métrica ${d.id} es una proporción y tiene que devolver numerador y denominador (clave ${b.key}).`)
  }
  return out as MetricBucket[]
}

export interface CoreMetricsService {
  list(): MetricMeta[]
  compute(id: string, query: MetricQuery): MetricBucket[]
  options(kind: MetricOptionKind): MetricOption[]
}

export function createCoreMetrics(ctx: CoreContext): CoreMetricsService {
  return {
    list: () => ctx.registry.metrics.map(metaOf),
    compute: (id, query) => {
      const d = typeof id === 'string' ? ctx.registry.metric(id) : undefined
      if (!d) throw new UserError(`Esa métrica no existe (${String(id)}).`)
      const r = MetricQuerySchema.safeParse(query)
      if (!r.success) throw new UserError(firstZodMessage(r.error, 'Consulta de métrica no válida.'))
      const q = r.data
      if (!d.groupings.includes(q.groupBy)) throw new UserError(`«${d.name}» no se puede agrupar así (${q.groupBy}).`)
      if (q.splitBy && !d.splits.includes(q.splitBy)) throw new UserError(`«${d.name}» no se puede dividir así (${q.splitBy}).`)
      for (const [k, v] of Object.entries(q.filters ?? {}))
        if (v !== undefined && !d.filters.includes(k as never)) throw new UserError(`«${d.name}» no admite el filtro ${k}.`)
      return checkBuckets(d, d.compute(ctx, q))
    },
    options: (kind) => {
      if (!METRIC_OPTION_KINDS.includes(kind)) throw new UserError('Esa lista de opciones no existe.')
      const out: MetricOption[] = []
      for (const m of ctx.registry.modules) {
        const r = m.metricOptions?.(ctx, kind)
        if (r) out.push(...r)
      }
      return out
    }
  }
}
