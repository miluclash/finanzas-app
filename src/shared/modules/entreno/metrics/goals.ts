// Progreso de objetivos y proyección por regresión lineal.
//
// Serie semanal observada por tipo de objetivo:
// - E1RM (ejercicio): mejor e1RM de la semana (kg).
// - WEIGHT_REPS (ejercicio, targetReps): mayor peso de la semana en una serie con al menos esas reps (kg).
// - WEEKLY_VOLUME: con grupo, series efectivas de la semana; con ejercicio, kg de la semana (en un
//   ejercicio de peso corporal, repeticiones). Si vienen los dos, manda el grupo.
// - FREQUENCY: con tipo de sesión, sesiones de la semana; con grupo, días de la semana.
// - EVENT: no tiene serie; devuelve la cuenta atrás.
//
// Solo cuentan las semanas CON DATOS (alguna serie del ejercicio o grupo, o alguna sesión del tipo):
// las semanas vacías no salen en la serie, no cuentan como 0 y no completan las N de la tendencia.
//
// Decisiones:
// - Valor actual = el de la última semana con datos. Mejor = el máximo de la serie.
// - Cumplido = la mejor semana llega al objetivo (en WEIGHT_REPS: alguna serie con ese peso y esas
//   reps). Es la condición para proponer "marcar conseguido"; Michael confirma.
// - % = actual / objetivo, entre 0 y 1.
// - Proyección: mínimos cuadrados sobre las últimas `trendWeeks` semanas con datos hasta hoy, con x
//   = días reales desde el primer punto / 7 (los huecos se respetan) y cada semana situada en su
//   primer día; se evalúa en la fecha límite. Con menos de 3 semanas con datos no hay proyección.
//   En objetivos que suman a lo largo de la semana (volumen y frecuencia) la semana en curso no
//   entra en la tendencia porque está a medias; en los de máximo (e1RM, peso × reps) sí.
import type { GoalType, WorkoutKind } from '../types'
import { type CountedSet, type MetricsContext, isBodyweight, setBodyweightReps, setE1rm, setLoadKg } from './context'
import { type EventCountdown, eventCountdown } from './event'
import type { GoalFact, ISODate } from './types'
import { effectiveSetsMap, groupDays } from './volume'
import { diffDays, weekKeyOf, weekStartOf } from './weeks'

export interface WeekPoint {
  weekKey: ISODate
  value: number
}

export interface LinearFit {
  slope: number
  intercept: number
}

/** Mínimos cuadrados de y = intercept + slope·x. null con menos de 2 puntos o x todos iguales. */
export function linearRegression(points: { x: number; y: number }[]): LinearFit | null {
  const n = points.length
  if (n < 2) return null
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

/** Mínimo de semanas con datos para proyectar. */
export const MIN_PROJECTION_WEEKS = 3

export type ProjectionReason = 'pocos-datos' | 'sin-fecha-limite' | 'fecha-pasada'

export interface Projection {
  value: number
  date: ISODate
  /** Cambio por semana de la tendencia. */
  slopePerWeek: number
  /** Línea de la tendencia: del primer punto usado a la fecha límite (para dibujarla discontinua). */
  line: { date: ISODate; value: number }[]
  /** Semanas con datos usadas. */
  weeksUsed: ISODate[]
}

/**
 * Proyección de una serie semanal (solo semanas con datos, en cualquier orden) a `deadline`.
 * Usa las últimas `trendWeeks` semanas ≤ `today`.
 */
export function projectSeries(
  series: WeekPoint[],
  deadline: ISODate | null,
  today: ISODate,
  trendWeeks: number
): { projection: Projection | null; reason: ProjectionReason | null } {
  if (!deadline) return { projection: null, reason: 'sin-fecha-limite' }
  if (deadline < today) return { projection: null, reason: 'fecha-pasada' }
  const used = [...series]
    .filter((p) => p.weekKey <= today)
    .sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1))
    .slice(-Math.max(1, trendWeeks))
  if (used.length < MIN_PROJECTION_WEEKS) return { projection: null, reason: 'pocos-datos' }
  const x0 = used[0].weekKey
  const xOf = (d: ISODate) => diffDays(d, x0) / 7
  const fit = linearRegression(used.map((p) => ({ x: xOf(p.weekKey), y: p.value })))
  if (!fit) return { projection: null, reason: 'pocos-datos' }
  const at = (d: ISODate) => fit.intercept + fit.slope * xOf(d)
  return {
    projection: {
      value: at(deadline),
      date: deadline,
      slopePerWeek: fit.slope,
      line: [
        { date: x0, value: at(x0) },
        { date: deadline, value: at(deadline) }
      ],
      weeksUsed: used.map((p) => p.weekKey)
    },
    reason: null
  }
}

export type GoalUnit = 'kg' | 'series' | 'reps' | 'sesiones' | 'dias'

export interface GoalProgress {
  goalId: number
  type: GoalType
  unit: GoalUnit | null
  target: number | null
  /** Serie observada: solo semanas con datos, en orden. */
  series: WeekPoint[]
  current: number | null
  best: number | null
  /** current / target, entre 0 y 1 (null sin objetivo o sin datos). */
  pct: number | null
  achieved: boolean
  projection: Projection | null
  /** Por qué no hay proyección (null si la hay o si el tipo no proyecta). */
  projectionReason: ProjectionReason | null
  /** Solo en objetivos EVENT (o con evento): cuenta atrás. */
  countdown: EventCountdown | null
}

function weeklyMax(sets: CountedSet[], value: (s: CountedSet) => number | null): WeekPoint[] {
  const acc = new Map<ISODate, number>()
  for (const s of sets) {
    const v = value(s)
    if (v == null || !(v > 0)) continue
    const prev = acc.get(s.weekKey)
    if (prev === undefined || v > prev) acc.set(s.weekKey, v)
  }
  return toPoints(acc)
}

function toPoints(acc: Map<ISODate, number>): WeekPoint[] {
  return [...acc.entries()].map(([weekKey, value]) => ({ weekKey, value })).sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1))
}

function byWeek(sets: CountedSet[]): Map<ISODate, CountedSet[]> {
  const m = new Map<ISODate, CountedSet[]>()
  for (const s of sets) {
    const l = m.get(s.weekKey)
    if (l) l.push(s)
    else m.set(s.weekKey, [s])
  }
  return m
}

/** Serie semanal (solo semanas con datos) y unidad de un objetivo. */
export function goalSeries(ctx: MetricsContext, goal: GoalFact): { unit: GoalUnit | null; series: WeekPoint[]; cumulative: boolean } {
  const ofExercise = ctx.counted.filter((s) => goal.exerciseId != null && s.exerciseId === goal.exerciseId)
  switch (goal.type) {
    case 'E1RM':
      return { unit: 'kg', series: weeklyMax(ofExercise, (s) => setE1rm(s, ctx.settings)), cumulative: false }
    case 'WEIGHT_REPS': {
      const minReps = goal.targetReps ?? 1
      return {
        unit: 'kg',
        series: weeklyMax(ofExercise, (s) => (s.reps != null && s.reps >= minReps ? s.weightKg : null)),
        cumulative: false
      }
    }
    case 'WEEKLY_VOLUME': {
      if (goal.groupId != null) {
        const acc = new Map<ISODate, number>()
        for (const [w, sets] of byWeek(ctx.counted)) {
          const v = effectiveSetsMap(ctx, sets).get(goal.groupId) ?? 0
          if (v > 0) acc.set(w, v)
        }
        return { unit: 'series', series: toPoints(acc), cumulative: true }
      }
      const bw = ofExercise.length > 0 && isBodyweight(ofExercise[0])
      const acc = new Map<ISODate, number>()
      for (const [w, sets] of byWeek(ofExercise)) {
        const v = sets.reduce((a, s) => a + (bw ? setBodyweightReps(s) : setLoadKg(s)), 0)
        if (v > 0) acc.set(w, v)
      }
      return { unit: bw ? 'reps' : 'kg', series: toPoints(acc), cumulative: true }
    }
    case 'FREQUENCY': {
      if (goal.kind != null) {
        const acc = new Map<ISODate, number>()
        for (const w of ctx.workouts) {
          if (w.kind !== (goal.kind as WorkoutKind)) continue
          const k = weekKeyOf(w.startTime, ctx.settings.weekStartsOn)
          acc.set(k, (acc.get(k) ?? 0) + 1)
        }
        return { unit: 'sesiones', series: toPoints(acc), cumulative: true }
      }
      if (goal.groupId != null) {
        const acc = new Map<ISODate, number>()
        for (const [w, sets] of byWeek(ctx.counted)) {
          const v = groupDays(sets, goal.groupId)
          if (v > 0) acc.set(w, v)
        }
        return { unit: 'dias', series: toPoints(acc), cumulative: true }
      }
      return { unit: null, series: [], cumulative: true }
    }
    case 'EVENT':
      return { unit: null, series: [], cumulative: false }
  }
}

export function goalProgress(ctx: MetricsContext, goal: GoalFact, today: ISODate): GoalProgress {
  const event = goal.eventId != null ? ctx.eventById.get(goal.eventId) : undefined
  const countdown = event ? eventCountdown(event.date, today) : goal.type === 'EVENT' && goal.deadline ? eventCountdown(goal.deadline, today) : null
  const { unit, series, cumulative } = goalSeries(ctx, goal)
  const target = goal.targetValue
  const visible = series.filter((p) => p.weekKey <= today)
  const current = visible.length ? visible[visible.length - 1].value : null
  const best = visible.length ? Math.max(...visible.map((p) => p.value)) : null
  const base: GoalProgress = {
    goalId: goal.id,
    type: goal.type,
    unit,
    target,
    series: visible,
    current,
    best,
    pct: target != null && target > 0 && current != null ? Math.min(1, Math.max(0, current / target)) : null,
    achieved: target != null && best != null && best >= target,
    projection: null,
    projectionReason: null,
    countdown
  }
  if (goal.type === 'EVENT') return base
  const currentWeek = weekStartOf(today, ctx.settings.weekStartsOn)
  const trendSeries = cumulative ? visible.filter((p) => p.weekKey < currentWeek) : visible
  const { projection, reason } = projectSeries(trendSeries, goal.deadline, today, ctx.settings.trendWeeks)
  return { ...base, projection, projectionReason: reason }
}

/** Progreso de todos los objetivos (por defecto, solo los activos). */
export function goalsProgress(ctx: MetricsContext, today: ISODate, includeAll = false): GoalProgress[] {
  return ctx.facts.goals.filter((g) => includeAll || g.status === 'ACTIVE').map((g) => goalProgress(ctx, g, today))
}

