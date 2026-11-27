// Lecturas de métricas de Entreno (`entreno:metrics.*`). Leen los hechos de la base en memoria
// (`loadEntrenoFacts`), los adaptan y llaman a la lógica pura de src/shared/modules/entreno/metrics.
// No escriben nada y no pasan por la cola.
//
// Caché: el contexto preparado y los récords se guardan hasta el siguiente aviso de cambio del
// núcleo (`ctx.onChange`: cada escritura confirmada, restaurar una copia o cambiar de base). "Hoy"
// no forma parte de la caché: entra en cada llamada (`ctx.today()`, que los tests pueden fijar).
import { isISODate } from '@shared/dates'
import { HYROX_STATION_KEYS } from '@shared/modules/entreno/hyrox'
import {
  type Bucket,
  type EntrenoInicio,
  type EntrenoSummary,
  type ExerciseRecordsView,
  type GoalView,
  type HyroxStatus,
  type MetricQuery,
  type MetricsContext,
  type NextSession,
  type RecordHitView,
  type RecordsResult,
  type ResolvedWeek,
  type SummaryQuery,
  type WeeklyReview,
  buildInicio,
  buildSummary,
  computeMetric,
  computeRecords,
  exerciseRecordsView,
  getEntrenoMetric,
  goalView,
  goalViews,
  hyroxStatus,
  nextSession,
  prepareMetrics,
  resolveWeek,
  toMetricsFacts,
  weeklyReview,
  workoutRecordsView
} from '@shared/modules/entreno/metrics'
import { WORKOUT_KINDS } from '@shared/modules/entreno/types'
import { z } from 'zod'
import type { CoreContext } from '../../core/context'
import { UserError } from '../../core/errors'
import { loadEntrenoFacts } from './facts'
import { parseInput } from './repo'

const isoDate = z.string().refine(isISODate, 'Fecha no válida (YYYY-MM-DD)')
const id = z.number().int().positive()
const SummaryQuerySchema = z
  .object({ period: z.enum(['week', 'month', 'block']).optional(), date: isoDate.nullish() })
  .strict()
  .optional()
const MetricQuerySchema = z
  .object({
    groupBy: z.enum(['workout', 'exercise', 'muscleGroup', 'week', 'month', 'day', 'kind']),
    from: isoDate.nullish(),
    to: isoDate.nullish(),
    exerciseId: id.nullish(),
    groupId: id.nullish(),
    kind: z.enum(WORKOUT_KINDS).nullish()
  })
  .strict()

interface Cache {
  m: MetricsContext
  records: RecordsResult
}

export interface EntrenoMetricsService {
  summary(q?: SummaryQuery): EntrenoSummary
  week(date: string): ResolvedWeek
  next(date?: string | null): NextSession | null
  records(exerciseId?: number | null): ExerciseRecordsView[]
  workoutRecords(workoutId: number): RecordHitView[]
  goals(): GoalView[]
  goal(goalId: number): GoalView | null
  hyrox(eventId: number): HyroxStatus | null
  compute(metricId: string, query: MetricQuery): Bucket[]
  inicio(): EntrenoInicio
  /** Revisión de la última semana completa (umbrales de los ajustes de Entreno). */
  review(): WeeklyReview
  /** Contexto de métricas preparado (de la caché): lo usan las métricas del constructor de gráficos. */
  context(): MetricsContext
  /** Para tests: cuántas veces se ha leído la base. */
  readonly loads: number
}

/** Un servicio (y una caché) por contexto del núcleo: lo comparten los handlers y el registro de métricas. */
const services = new WeakMap<CoreContext, EntrenoMetricsService>()

export function metricsServiceFor(ctx: CoreContext): EntrenoMetricsService {
  let s = services.get(ctx)
  if (!s) {
    s = createMetricsService(ctx)
    services.set(ctx, s)
  }
  return s
}

export function createMetricsService(ctx: CoreContext): EntrenoMetricsService {
  let cache: Cache | null = null
  let loads = 0
  ctx.onChange(() => {
    cache = null
  })
  const get = (): Cache => {
    if (!cache) {
      loads++
      const facts = loadEntrenoFacts(ctx.db)
      const m = prepareMetrics(toMetricsFacts(facts), facts.settings)
      cache = { m, records: computeRecords(m) }
    }
    return cache
  }
  return {
    summary: (q) => {
      const query = parseInput(SummaryQuerySchema, q) ?? {}
      const c = get()
      return buildSummary(c.m, c.records, ctx.today(), query, HYROX_STATION_KEYS)
    },
    week: (date) => resolveWeek(get().m, parseInput(isoDate, date), ctx.today()),
    next: (date) => nextSession(get().m, date == null ? ctx.today() : parseInput(isoDate, date)),
    records: (exerciseId) => {
      const c = get()
      return exerciseRecordsView(c.m, c.records, exerciseId == null ? null : parseInput(id, exerciseId))
    },
    workoutRecords: (workoutId) => {
      const c = get()
      return workoutRecordsView(c.m, c.records, parseInput(id, workoutId))
    },
    goals: () => goalViews(get().m, ctx.today()),
    goal: (goalId) => {
      const m = get().m
      const g = m.facts.goals.find((x) => x.id === parseInput(id, goalId))
      return g ? goalView(m, g, ctx.today()) : null
    },
    hyrox: (eventId) => hyroxStatus(get().m, parseInput(id, eventId), ctx.today(), HYROX_STATION_KEYS),
    compute: (metricId, query) => {
      if (typeof metricId !== 'string' || !getEntrenoMetric(metricId)) throw new UserError('Esa métrica no existe.')
      const q = parseInput(MetricQuerySchema, query)
      if (!getEntrenoMetric(metricId)!.groupings.includes(q.groupBy)) throw new UserError('Esa métrica no se puede agrupar así.')
      return computeMetric(get().m, metricId, q)
    },
    inicio: () => {
      const c = get()
      return buildInicio(c.m, c.records, ctx.today())
    },
    review: () => {
      const c = get()
      return weeklyReview({ ctx: c.m, records: c.records, today: ctx.today(), stations: HYROX_STATION_KEYS })
    },
    context: () => get().m,
    get loads() {
      return loads
    }
  }
}
