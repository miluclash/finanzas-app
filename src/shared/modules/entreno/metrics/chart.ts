// Métricas de Entreno con el contrato del núcleo (`src/shared/core/metrics-types.ts`) para el
// constructor de gráficos. Envuelven las de `registry.ts` (las de `entreno:metrics.compute`, que no
// cambian) y añaden:
// - ids `entreno.<id>`, unidades canónicas y agregación;
// - agrupación por año (donde hay mes) y rótulos de las claves de dimensión;
// - división (`splitBy`) por ejercicio, grupo muscular o tipo de sesión: una pasada por valor con
//   el filtro correspondiente, así cada parte da exactamente lo mismo que filtrar a mano;
// - numerador y denominador en las proporciones (RPE medio, densidad y adherencia).
//
// Agregaciones: volúmenes, series, sesiones, duración, metros, km y carga interna se suman; e1RM y
// peso máximo, máximo; RPE medio (Σ RPE / series con RPE), densidad (Σ kg / Σ min) y adherencia
// (cumplidas / previstas) son proporciones. Frecuencia por grupo (días distintos entrenando el grupo)
// se SUMA: los periodos no se solapan y un día solo cae en uno, así que sumar los días de cada semana
// da los días del mes o del año (y entre grupos, los días-grupo del total).
//
// Adherencia: unidad `pct` como proporción 0–1 (en `entreno:metrics.compute` sigue en 0–100). Por
// mes o año se juntan las semanas por su lunes. Admite filtro y división por tipo de sesión.
import type {
  DimensionGrouping,
  Grouping as CoreGrouping,
  MetricAggregation,
  MetricBucket,
  MetricDef,
  MetricFilterKey as CoreFilterKey,
  MetricOption,
  MetricOptionKind,
  MetricQuery as CoreQuery,
  MetricUnit
} from '../../../core/metrics-types'
import { WORKOUT_KINDS, type WorkoutKind } from '../types'
import type { MetricsContext } from './context'
import { weekAdherence } from './plan'
import { ENTRENO_METRICS, workoutKey, type EntrenoMetricDef, type MetricQuery } from './registry'
import { type Grouping, filterSets, groupKey, workoutStats } from './volume'
import { dateOf, weekKeysBetween } from './weeks'

export const ENTRENO_METRIC_PREFIX = 'entreno.'

export const KIND_LABELS: Record<WorkoutKind, string> = { GYM: 'Gimnasio', SWIM: 'Natación', HYROX: 'HYROX', RUN: 'Carrera', OTHER: 'Otro' }

type RatioCompute = (ctx: MetricsContext, q: MetricQuery) => MetricBucket[]

interface ChartExtra {
  unit: MetricUnit
  aggregation: MetricAggregation
  /** Cálculo propio (proporciones con numerador y denominador). */
  compute?: RatioCompute
  groupings?: CoreGrouping[]
  filters?: CoreFilterKey[]
}

function sortRatio(acc: Map<string, { num: number; den: number }>): MetricBucket[] {
  const numeric = [...acc.keys()].every((k) => /^\d+$/.test(k))
  return [...acc.entries()]
    .map(([key, a]) => ({ key, value: a.den === 0 ? 0 : a.num / a.den, num: a.num, den: a.den }))
    .sort((a, b) => (numeric ? Number(a.key) - Number(b.key) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

function addTo(acc: Map<string, { num: number; den: number }>, k: string, num: number, den: number): void {
  const a = acc.get(k) ?? { num: 0, den: 0 }
  a.num += num
  a.den += den
  acc.set(k, a)
}

/** RPE medio = Σ RPE / nº de series con RPE (las que no tienen RPE no cuentan). */
const rpeRatio: RatioCompute = (ctx, q) => {
  const acc = new Map<string, { num: number; den: number }>()
  for (const s of filterSets(ctx, q)) {
    const k = groupKey(s, q.groupBy)
    if (k == null || s.rpe == null) continue
    addTo(acc, k, s.rpe, 1)
  }
  return sortRatio(acc)
}

/** Densidad = Σ kg / Σ minutos de las sesiones con duración. */
const densityRatio: RatioCompute = (ctx, q) => {
  const acc = new Map<string, { num: number; den: number }>()
  for (const st of workoutStats(ctx, q)) {
    if (st.minutes == null || st.minutes <= 0) continue
    const k = workoutKey(ctx, ctx.workoutById.get(st.workoutId)!, q.groupBy)
    if (k == null) continue
    addTo(acc, k, st.loadKg, st.minutes)
  }
  return sortRatio(acc)
}

/** Adherencia = sesiones previstas cumplidas / previstas (semanas sin nada previsto no cuentan). */
const adherenceRatio: RatioCompute = (ctx, q) => {
  const from = q.from ?? ctx.workouts[0]?.startTime.slice(0, 10)
  const to = q.to ?? ctx.workouts[ctx.workouts.length - 1]?.startTime.slice(0, 10)
  if (!from || !to) return []
  const acc = new Map<string, { num: number; den: number }>()
  for (const w of weekKeysBetween(from, to, ctx.settings.weekStartsOn)) {
    const a = weekAdherence(ctx, w)
    const part = q.kind ? a.byKind.find((k) => k.kind === q.kind) : a
    if (!part || part.planned <= 0) continue
    const key = q.groupBy === 'year' ? w.slice(0, 4) : q.groupBy === 'month' ? w.slice(0, 7) : w
    addTo(acc, key, part.done, part.planned)
  }
  return sortRatio(acc)
}

const EXTRA: Record<string, ChartExtra> = {
  'volumen-carga': { unit: 'kg', aggregation: 'sum' },
  'volumen-peso-corporal': { unit: 'reps', aggregation: 'sum' },
  series: { unit: 'sets', aggregation: 'sum' },
  'series-efectivas': { unit: 'sets', aggregation: 'sum' },
  e1rm: { unit: 'kg', aggregation: 'max' },
  'peso-maximo': { unit: 'kg', aggregation: 'max' },
  sesiones: { unit: 'sessions', aggregation: 'sum' },
  'frecuencia-grupo': { unit: 'days', aggregation: 'sum' },
  duracion: { unit: 'min', aggregation: 'sum' },
  densidad: { unit: 'kg_per_min', aggregation: 'ratio', compute: densityRatio },
  'rpe-medio': { unit: 'rpe', aggregation: 'ratio', compute: rpeRatio },
  'carga-interna': { unit: 'sets_rpe', aggregation: 'sum' },
  'natacion-metros': { unit: 'm', aggregation: 'sum' },
  'carrera-distancia': { unit: 'km', aggregation: 'sum' },
  adherencia: { unit: 'pct', aggregation: 'ratio', compute: adherenceRatio, groupings: ['week', 'month', 'year'], filters: ['kind'] }
}

/** Dimensión de división → filtro con el que se calcula cada parte. */
const SPLIT_FILTER = { exercise: 'exerciseId', muscleGroup: 'groupId', kind: 'kind' } as const
type SplitDim = keyof typeof SPLIT_FILTER

/** Métrica de Entreno con el contrato del núcleo; `compute` recibe el contexto de métricas. */
export interface EntrenoChartMetric extends Omit<MetricDef<MetricsContext>, 'compute'> {
  /** Id en `entreno:metrics.compute` (sin prefijo). */
  localId: string
  compute(ctx: MetricsContext, q: CoreQuery): MetricBucket[]
}

function positiveId(v: unknown, what: string): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw new Error(`Filtro de ${what} no válido.`)
  return n
}

/** Consulta del núcleo → consulta de `registry.ts`. */
function toLocalQuery(q: CoreQuery): MetricQuery {
  const out: MetricQuery = { groupBy: q.groupBy as Grouping, from: q.from, to: q.to }
  const f = q.filters ?? {}
  if (f.exerciseId !== undefined) out.exerciseId = positiveId(f.exerciseId, 'ejercicio')
  if (f.groupId !== undefined) out.groupId = positiveId(f.groupId, 'grupo muscular')
  if (f.kind !== undefined) {
    if (!(WORKOUT_KINDS as readonly unknown[]).includes(f.kind)) throw new Error('Filtro de tipo de sesión no válido.')
    out.kind = f.kind as WorkoutKind
  }
  return out
}

/** Rótulo de una clave de dimensión. */
export function dimensionLabel(ctx: MetricsContext, g: CoreGrouping, key: string): string | undefined {
  switch (g) {
    case 'exercise':
      return ctx.exerciseById.get(Number(key))?.title
    case 'muscleGroup':
      return ctx.groupById.get(Number(key))?.name
    case 'kind':
      return KIND_LABELS[key as WorkoutKind]
    case 'workout': {
      const w = ctx.workoutById.get(Number(key))
      if (!w) return undefined
      const d = dateOf(w.startTime)
      return `${w.title || 'Sesión'} · ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
    }
    default:
      return undefined
  }
}

/** Valores candidatos de una división en el rango (luego se quitan los que no tienen datos). */
function splitCandidates(ctx: MetricsContext, dim: SplitDim, q: MetricQuery): (number | WorkoutKind)[] {
  const sets = filterSets(ctx, { from: q.from, to: q.to, kind: q.kind })
  if (dim === 'exercise') return [...new Set(sets.map((s) => s.exerciseId))]
  if (dim === 'muscleGroup') {
    const ids = new Set<number>()
    for (const s of sets) {
      if (s.exercise?.primaryGroupId != null) ids.add(s.exercise.primaryGroupId)
      for (const g of s.exercise?.secondaryGroupIds ?? []) ids.add(g)
    }
    return [...ids].sort((a, b) => a - b)
  }
  return [...WORKOUT_KINDS]
}

function keyOrder(a: MetricBucket, b: MetricBucket): number {
  const num = /^\d+$/.test(a.key) && /^\d+$/.test(b.key)
  const c = num ? Number(a.key) - Number(b.key) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  return c
}

function toChartMetric(d: EntrenoMetricDef): EntrenoChartMetric {
  const x = EXTRA[d.id]
  if (!x) throw new Error(`Falta la unidad y la agregación de la métrica ${d.id}.`)
  const groupings: CoreGrouping[] = x.groupings ?? [...d.groupings]
  if (!x.groupings && groupings.includes('month') && !groupings.includes('year')) groupings.splice(groupings.indexOf('month') + 1, 0, 'year')
  const filters: CoreFilterKey[] = x.filters ?? d.filters.filter((f): f is 'exerciseId' | 'groupId' | 'kind' => f !== 'from' && f !== 'to')
  const splits = (Object.keys(SPLIT_FILTER) as SplitDim[]).filter((s) => filters.includes(SPLIT_FILTER[s])) as DimensionGrouping[]
  const run = (ctx: MetricsContext, q: MetricQuery): MetricBucket[] => (x.compute ? x.compute(ctx, q) : d.compute(ctx, q))
  const isDim = (g: CoreGrouping) => g === 'exercise' || g === 'muscleGroup' || g === 'kind' || g === 'workout'
  return {
    id: `${ENTRENO_METRIC_PREFIX}${d.id}`,
    localId: d.id,
    module: 'entreno',
    name: d.name,
    unit: x.unit,
    aggregation: x.aggregation,
    groupings,
    splits,
    filters,
    compute: (ctx, q) => {
      const base = toLocalQuery(q)
      const withLabels = (rows: MetricBucket[]): MetricBucket[] =>
        isDim(q.groupBy)
          ? rows.map((r) => {
              const label = dimensionLabel(ctx, q.groupBy, r.key)
              return label === undefined ? r : { ...r, label }
            })
          : rows
      if (!q.splitBy) return withLabels(run(ctx, base))
      const dim = q.splitBy as SplitDim
      const fk = SPLIT_FILTER[dim]
      const preset = base[fk]
      const values = preset != null ? [preset] : splitCandidates(ctx, dim, base)
      const out: MetricBucket[] = []
      for (const v of values) {
        const split = String(v)
        const splitLabel = dimensionLabel(ctx, dim, split)
        for (const r of withLabels(run(ctx, { ...base, [fk]: v })))
          out.push(splitLabel === undefined ? { ...r, split } : { ...r, split, splitLabel })
      }
      return out.sort(keyOrder)
    }
  }
}

/** Métricas de Entreno para el registro del núcleo, en el mismo orden que `ENTRENO_METRICS`. */
export const ENTRENO_CHART_METRICS: readonly EntrenoChartMetric[] = ENTRENO_METRICS.map(toChartMetric)

/** Listas para los filtros del constructor: ejercicios, grupos musculares y tipos de sesión. */
export function entrenoMetricOptions(ctx: MetricsContext, kind: MetricOptionKind): MetricOption[] | null {
  switch (kind) {
    case 'exercise':
      return [...ctx.facts.exercises]
        .sort((a, b) => a.title.localeCompare(b.title, 'es'))
        .map((e) => {
          const g = e.primaryGroupId == null ? undefined : ctx.groupById.get(e.primaryGroupId)?.name
          return g ? { value: e.id, label: e.title, group: g } : { value: e.id, label: e.title }
        })
    case 'muscleGroup':
      return ctx.facts.groups.map((g) => (g.active === false ? { value: g.id, label: g.name, inactive: true } : { value: g.id, label: g.name }))
    case 'kind':
      return WORKOUT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))
    default:
      return null
  }
}
