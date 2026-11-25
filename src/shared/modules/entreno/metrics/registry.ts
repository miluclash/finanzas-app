// Registro de métricas de Entreno para el constructor de gráficos (F5) y la IA local (F6).
// Cada métrica: id estable, nombre en español, unidad, agrupaciones y filtros admitidos y una
// función que devuelve una serie `{ key, value }[]` (solo claves con datos, ordenadas).
// Estas son las de `entreno:metrics.compute` (ids sin prefijo, resultados de siempre). Para el
// constructor de gráficos se publican con el contrato del núcleo en `chart.ts` (`entreno.<id>`).
import type { WorkoutKind } from '../types'
import { type CountedSet, type MetricsContext, setE1rm, isBodyweight } from './context'
import { adherenceWeekly } from './plan'
import type { ISODate, WorkoutFact } from './types'
import {
  type Bucket,
  type Grouping,
  type SetFilter,
  bodyweightVolume,
  effectiveSetsMap,
  filterSets,
  groupKey,
  loadVolume,
  maxBy,
  sortBuckets,
  sumBy,
  workoutStats
} from './volume'
import { dateOf, inRange, minutesBetween, monthKeyOf, weekKeyOf, weekKeysBetween } from './weeks'

export type MetricFilterKey = 'from' | 'to' | 'exerciseId' | 'groupId' | 'kind'

export interface MetricQuery extends Pick<SetFilter, 'from' | 'to' | 'exerciseId' | 'groupId'> {
  groupBy: Grouping
  kind?: WorkoutKind | null
}

export interface EntrenoMetricDef {
  id: string
  name: string
  unit: string
  groupings: readonly Grouping[]
  filters: readonly MetricFilterKey[]
  compute: (ctx: MetricsContext, q: MetricQuery) => Bucket[]
}

const TIME: Grouping[] = ['week', 'month', 'day']
const ALL_FILTERS: MetricFilterKey[] = ['from', 'to', 'exerciseId', 'groupId', 'kind']

export function workoutKey(ctx: MetricsContext, w: WorkoutFact, by: Grouping): string | null {
  const d = dateOf(w.startTime)
  switch (by) {
    case 'workout':
      return String(w.id)
    case 'week':
      return weekKeyOf(d, ctx.settings.weekStartsOn)
    case 'month':
      return monthKeyOf(d)
    case 'year':
      return monthKeyOf(d).slice(0, 4)
    case 'day':
      return d
    case 'kind':
      return w.kind
    default:
      return null
  }
}

function filteredWorkouts(ctx: MetricsContext, q: MetricQuery, kind?: WorkoutKind): WorkoutFact[] {
  const k = kind ?? q.kind
  return ctx.workouts.filter((w) => inRange(dateOf(w.startTime), q.from, q.to) && (k == null || w.kind === k))
}

function avgBy(sets: CountedSet[], by: Grouping, value: (s: CountedSet) => number | null): Bucket[] {
  const acc = new Map<string, { sum: number; n: number }>()
  for (const s of sets) {
    const k = groupKey(s, by)
    const v = value(s)
    if (k == null || v == null) continue
    const a = acc.get(k) ?? { sum: 0, n: 0 }
    a.sum += v
    a.n++
    acc.set(k, a)
  }
  return sortBuckets(new Map([...acc].map(([k, a]) => [k, a.sum / a.n])))
}

function countWorkouts(ctx: MetricsContext, ws: WorkoutFact[], by: Grouping, value: (w: WorkoutFact) => number = () => 1): Bucket[] {
  const acc = new Map<string, number>()
  for (const w of ws) {
    const k = workoutKey(ctx, w, by)
    if (k != null) acc.set(k, (acc.get(k) ?? 0) + value(w))
  }
  return sortBuckets(acc)
}

/** Series efectivas: por grupo (en el periodo) o por tiempo (del grupo filtrado o de todos sumados). */
function effectiveSets(ctx: MetricsContext, q: MetricQuery): Bucket[] {
  const sets = filterSets(ctx, { from: q.from, to: q.to, kind: q.kind })
  if (q.groupBy === 'muscleGroup') {
    const m = effectiveSetsMap(ctx, sets)
    return sortBuckets(new Map([...m].filter(([g]) => q.groupId == null || g === q.groupId).map(([g, v]) => [String(g), v])))
  }
  const per = new Map<string, CountedSet[]>()
  for (const s of sets) {
    const k = groupKey(s, q.groupBy)
    if (k == null) continue
    const l = per.get(k)
    if (l) l.push(s)
    else per.set(k, [s])
  }
  const acc = new Map<string, number>()
  for (const [k, l] of per) {
    const m = effectiveSetsMap(ctx, l)
    const v = q.groupId != null ? (m.get(q.groupId) ?? 0) : [...m.values()].reduce((a, x) => a + x, 0)
    if (v > 0) acc.set(k, v)
  }
  return sortBuckets(acc)
}

/** Días distintos con el grupo como principal, por periodo o por grupo. */
function groupFrequencyMetric(ctx: MetricsContext, q: MetricQuery): Bucket[] {
  const sets = filterSets(ctx, { from: q.from, to: q.to, kind: q.kind, groupId: q.groupId }).filter((s) => s.exercise?.primaryGroupId != null)
  const acc = new Map<string, Set<string>>()
  for (const s of sets) {
    const k = groupKey(s, q.groupBy)
    if (k == null) continue
    const set = acc.get(k) ?? new Set()
    set.add(q.groupBy === 'muscleGroup' || q.groupId != null ? s.date : `${s.exercise!.primaryGroupId}|${s.date}`)
    acc.set(k, set)
  }
  return sortBuckets(new Map([...acc].map(([k, v]) => [k, v.size])))
}

export const ENTRENO_METRICS: readonly EntrenoMetricDef[] = [
  {
    id: 'volumen-carga',
    name: 'Volumen de carga',
    unit: 'kg',
    groupings: ['workout', 'exercise', 'muscleGroup', 'week', 'month', 'day', 'kind'],
    filters: ALL_FILTERS,
    compute: (ctx, q) => loadVolume(ctx, q.groupBy, q)
  },
  {
    id: 'volumen-peso-corporal',
    name: 'Volumen con peso corporal',
    unit: 'reps',
    groupings: ['workout', 'exercise', 'muscleGroup', 'week', 'month', 'day', 'kind'],
    filters: ALL_FILTERS,
    compute: (ctx, q) => bodyweightVolume(ctx, q.groupBy, q)
  },
  {
    id: 'series',
    name: 'Series',
    unit: 'series',
    groupings: ['workout', 'exercise', 'muscleGroup', 'week', 'month', 'day', 'kind'],
    filters: ALL_FILTERS,
    compute: (ctx, q) => sumBy(filterSets(ctx, q), q.groupBy, () => 1)
  },
  {
    id: 'series-efectivas',
    name: 'Series efectivas por grupo muscular',
    unit: 'series',
    groupings: ['muscleGroup', 'week', 'month'],
    filters: ['from', 'to', 'groupId', 'kind'],
    compute: effectiveSets
  },
  {
    id: 'e1rm',
    name: 'e1RM (mejor serie)',
    unit: 'kg',
    groupings: ['workout', 'exercise', 'week', 'month', 'day'],
    filters: ['from', 'to', 'exerciseId', 'groupId', 'kind'],
    compute: (ctx, q) => maxBy(filterSets(ctx, q), q.groupBy, (s) => setE1rm(s, ctx.settings))
  },
  {
    id: 'peso-maximo',
    name: 'Peso máximo',
    unit: 'kg',
    groupings: ['workout', 'exercise', 'week', 'month', 'day'],
    filters: ['from', 'to', 'exerciseId', 'groupId', 'kind'],
    compute: (ctx, q) => maxBy(filterSets(ctx, q), q.groupBy, (s) => (isBodyweight(s) || !(s.weightKg! > 0) ? null : s.weightKg))
  },
  {
    id: 'sesiones',
    name: 'Sesiones',
    unit: 'sesiones',
    groupings: [...TIME, 'kind'],
    filters: ['from', 'to', 'kind'],
    compute: (ctx, q) => countWorkouts(ctx, filteredWorkouts(ctx, q), q.groupBy)
  },
  {
    id: 'frecuencia-grupo',
    name: 'Frecuencia por grupo muscular',
    unit: 'días',
    groupings: ['week', 'month', 'muscleGroup'],
    filters: ['from', 'to', 'groupId', 'kind'],
    compute: groupFrequencyMetric
  },
  {
    id: 'duracion',
    name: 'Duración',
    unit: 'min',
    groupings: ['workout', ...TIME, 'kind'],
    filters: ['from', 'to', 'kind'],
    compute: (ctx, q) =>
      countWorkouts(
        ctx,
        filteredWorkouts(ctx, q).filter((w) => minutesBetween(w.startTime, w.endTime) != null),
        q.groupBy,
        (w) => minutesBetween(w.startTime, w.endTime)!
      )
  },
  {
    id: 'densidad',
    name: 'Densidad',
    unit: 'kg/min',
    groupings: ['workout', ...TIME, 'kind'],
    filters: ['from', 'to', 'kind'],
    compute: (ctx, q) => {
      const acc = new Map<string, { kg: number; min: number }>()
      for (const st of workoutStats(ctx, q)) {
        if (st.minutes == null || st.minutes <= 0) continue
        const k = workoutKey(ctx, ctx.workoutById.get(st.workoutId)!, q.groupBy)
        if (k == null) continue
        const a = acc.get(k) ?? { kg: 0, min: 0 }
        a.kg += st.loadKg
        a.min += st.minutes
        acc.set(k, a)
      }
      return sortBuckets(new Map([...acc].map(([k, a]) => [k, a.kg / a.min])))
    }
  },
  {
    id: 'rpe-medio',
    name: 'RPE medio',
    unit: 'RPE',
    groupings: ['workout', 'exercise', 'muscleGroup', 'week', 'month', 'day'],
    filters: ALL_FILTERS,
    compute: (ctx, q) => avgBy(filterSets(ctx, q), q.groupBy, (s) => s.rpe)
  },
  {
    id: 'carga-interna',
    name: 'Carga interna (series × RPE)',
    unit: 'series·RPE',
    groupings: ['workout', ...TIME, 'kind'],
    filters: ALL_FILTERS,
    compute: (ctx, q) => sumBy(filterSets(ctx, q).filter((s) => s.rpe != null), q.groupBy, (s) => s.rpe!)
  },
  {
    id: 'natacion-metros',
    name: 'Metros nadados',
    unit: 'm',
    groupings: ['workout', 'exercise', ...TIME],
    filters: ['from', 'to', 'exerciseId'],
    compute: (ctx, q) =>
      sumBy(
        filterSets(ctx, { ...q, kind: 'SWIM' }).filter((s) => s.distanceKm != null),
        q.groupBy,
        (s) => s.distanceKm! * 1000
      )
  },
  {
    id: 'carrera-distancia',
    name: 'Distancia de carrera',
    unit: 'km',
    groupings: ['workout', ...TIME],
    filters: ['from', 'to'],
    compute: (ctx, q) =>
      sumBy(
        filterSets(ctx, { ...q, kind: 'RUN' }).filter((s) => s.distanceKm != null),
        q.groupBy,
        (s) => s.distanceKm!
      )
  },
  {
    id: 'adherencia',
    name: 'Adherencia al plan',
    unit: '%',
    groupings: ['week'],
    filters: ['from', 'to'],
    compute: (ctx, q) => {
      // Sin fechas: de la primera a la última sesión. Semanas sin nada previsto no salen.
      const from: ISODate | undefined = q.from ?? ctx.workouts[0]?.startTime.slice(0, 10)
      const to: ISODate | undefined = q.to ?? ctx.workouts[ctx.workouts.length - 1]?.startTime.slice(0, 10)
      if (!from || !to) return []
      return adherenceWeekly(ctx, weekKeysBetween(from, to, ctx.settings.weekStartsOn))
        .filter((a) => a.pct != null)
        .map((a) => ({ key: a.weekStart, value: a.pct! * 100 }))
    }
  }
]

export function getEntrenoMetric(id: string): EntrenoMetricDef | undefined {
  return ENTRENO_METRICS.find((m) => m.id === id)
}

/** Calcula una métrica; error si la agrupación no está admitida. */
export function computeMetric(ctx: MetricsContext, id: string, q: MetricQuery): Bucket[] {
  const m = getEntrenoMetric(id)
  if (!m) throw new Error(`Métrica desconocida: ${id}`)
  if (!m.groupings.includes(q.groupBy)) throw new Error(`La métrica ${id} no se puede agrupar por ${q.groupBy}`)
  return m.compute(ctx, q)
}
