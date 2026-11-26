// Volumen de carga y con peso corporal, series efectivas por grupo, frecuencia por grupo,
// duración y densidad, RPE y carga interna, sesiones por semana y natación. Solo series que cuentan.
import type { WorkoutKind } from '../types'
import { type CountedSet, type MetricsContext, setBodyweightReps, setLoadKg } from './context'
import type { ISODate, MuscleGroupFact } from './types'
import { inRange, minutesBetween, weekKeyOf } from './weeks'

/** Por qué se agrupa una métrica. Las claves de id van como texto (`'12'`). `year` (clave `YYYY`) la usa el constructor de gráficos. */
export type Grouping = 'workout' | 'exercise' | 'muscleGroup' | 'week' | 'month' | 'year' | 'day' | 'kind'

export interface SetFilter {
  /** Desde esta fecha (incluida), por el día en que empieza la sesión. */
  from?: ISODate | null
  /** Hasta esta fecha (incluida). */
  to?: ISODate | null
  exerciseId?: number | null
  /** Ejercicios cuyo grupo principal es este. */
  groupId?: number | null
  kind?: WorkoutKind | null
  workoutId?: number | null
}

export interface Bucket {
  key: string
  value: number
}

export function filterSets(ctx: MetricsContext, f: SetFilter = {}): CountedSet[] {
  return ctx.counted.filter(
    (s) =>
      inRange(s.date, f.from, f.to) &&
      (f.exerciseId == null || s.exerciseId === f.exerciseId) &&
      (f.groupId == null || s.exercise?.primaryGroupId === f.groupId) &&
      (f.kind == null || s.workout.kind === f.kind) &&
      (f.workoutId == null || s.workoutId === f.workoutId)
  )
}

/**
 * Clave de agrupación de una serie. Por grupo muscular se usa el grupo principal del ejercicio
 * (el volumen en kg no se reparte entre secundarios; las series efectivas sí). null = la serie no
 * entra en ningún grupo (ejercicio sin grupo principal).
 */
export function groupKey(s: CountedSet, by: Grouping): string | null {
  switch (by) {
    case 'workout':
      return String(s.workoutId)
    case 'exercise':
      return String(s.exerciseId)
    case 'muscleGroup':
      return s.exercise?.primaryGroupId == null ? null : String(s.exercise.primaryGroupId)
    case 'week':
      return s.weekKey
    case 'month':
      return s.monthKey
    case 'year':
      return s.monthKey.slice(0, 4)
    case 'day':
      return s.date
    case 'kind':
      return s.workout.kind
  }
}

/** Suma `value(serie)` por clave. Solo devuelve las claves con alguna serie, ordenadas por clave. */
export function sumBy(sets: CountedSet[], by: Grouping, value: (s: CountedSet) => number): Bucket[] {
  const acc = new Map<string, number>()
  for (const s of sets) {
    const k = groupKey(s, by)
    if (k == null) continue
    acc.set(k, (acc.get(k) ?? 0) + value(s))
  }
  return sortBuckets(acc)
}

/** Máximo de `value(serie)` por clave (ignorando null). */
export function maxBy(sets: CountedSet[], by: Grouping, value: (s: CountedSet) => number | null): Bucket[] {
  const acc = new Map<string, number>()
  for (const s of sets) {
    const k = groupKey(s, by)
    const v = value(s)
    if (k == null || v == null) continue
    const prev = acc.get(k)
    if (prev === undefined || v > prev) acc.set(k, v)
  }
  return sortBuckets(acc)
}

export function sortBuckets(acc: Map<string, number>): Bucket[] {
  const numeric = [...acc.keys()].every((k) => /^\d+$/.test(k))
  return [...acc.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => (numeric ? Number(a.key) - Number(b.key) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** Volumen de carga Σ peso × reps (kg), sin ejercicios de peso corporal. */
export function loadVolume(ctx: MetricsContext, by: Grouping, f: SetFilter = {}): Bucket[] {
  return sumBy(filterSets(ctx, f), by, setLoadKg).filter((b) => b.value > 0)
}

/** Volumen con peso corporal Σ reps (solo ejercicios marcados como peso corporal). */
export function bodyweightVolume(ctx: MetricsContext, by: Grouping, f: SetFilter = {}): Bucket[] {
  return sumBy(filterSets(ctx, f), by, setBodyweightReps).filter((b) => b.value > 0)
}

/** Total de volumen de carga (kg) de unas series. */
export function totalLoadKg(sets: CountedSet[]): number {
  return sets.reduce((a, s) => a + setLoadKg(s), 0)
}

// ---------- Series efectivas por grupo muscular ----------

export type SetsStatus = 'bajo' | 'dentro' | 'por-encima'

export interface GroupWeekSets {
  groupId: number
  name: string
  sets: number
  min: number
  max: number
  status: SetsStatus
}

/** Series efectivas por grupo de las series dadas: principal 1, cada secundario `secondaryMuscleFactor`. */
export function effectiveSetsMap(ctx: MetricsContext, sets: CountedSet[]): Map<number, number> {
  const acc = new Map<number, number>()
  const add = (g: number, v: number) => acc.set(g, (acc.get(g) ?? 0) + v)
  for (const s of sets) {
    const ex = s.exercise
    if (!ex) continue
    if (ex.primaryGroupId != null) add(ex.primaryGroupId, 1)
    for (const g of ex.secondaryGroupIds) if (g !== ex.primaryGroupId) add(g, ctx.settings.secondaryMuscleFactor)
  }
  return acc
}

/** Grupos activos del catálogo, en su orden (los desactivados no salen en las listas por grupo). */
export function activeGroups(ctx: MetricsContext): MuscleGroupFact[] {
  return ctx.facts.groups.filter((g) => g.active !== false)
}

export function setsStatus(sets: number, min: number, max: number): SetsStatus {
  return sets < min ? 'bajo' : sets > max ? 'por-encima' : 'dentro'
}

/** Series efectivas de cada grupo del catálogo en una semana (los grupos sin series salen con 0). */
export function effectiveSetsByGroup(ctx: MetricsContext, weekKey: ISODate): GroupWeekSets[] {
  const map = effectiveSetsMap(
    ctx,
    ctx.counted.filter((s) => s.weekKey === weekKey)
  )
  return activeGroups(ctx).map((g) => {
    const sets = map.get(g.id) ?? 0
    return { groupId: g.id, name: g.name, sets, min: g.weeklySetsMin, max: g.weeklySetsMax, status: setsStatus(sets, g.weeklySetsMin, g.weeklySetsMax) }
  })
}

/** Series efectivas de un grupo en cada semana pedida (0 si no hay). */
export function effectiveSetsWeekly(ctx: MetricsContext, groupId: number, weekKeys: ISODate[]): Bucket[] {
  return weekKeys.map((w) => ({
    key: w,
    value: effectiveSetsMap(
      ctx,
      ctx.counted.filter((s) => s.weekKey === w)
    ).get(groupId) ?? 0
  }))
}

// ---------- Frecuencia por grupo ----------

/**
 * Días distintos de la semana con alguna serie que cuenta de un ejercicio cuyo grupo PRINCIPAL es
 * el grupo. Los secundarios no suman días (ya cuentan a medias en las series efectivas).
 */
export function groupDays(sets: CountedSet[], groupId: number): number {
  return new Set(sets.filter((s) => s.exercise?.primaryGroupId === groupId).map((s) => s.date)).size
}

export function groupFrequency(ctx: MetricsContext, weekKey: ISODate): { groupId: number; name: string; days: number }[] {
  const week = ctx.counted.filter((s) => s.weekKey === weekKey)
  return activeGroups(ctx).map((g) => ({ groupId: g.id, name: g.name, days: groupDays(week, g.id) }))
}

export function groupDaysWeekly(ctx: MetricsContext, groupId: number, weekKeys: ISODate[]): Bucket[] {
  return weekKeys.map((w) => ({ key: w, value: groupDays(ctx.counted.filter((s) => s.weekKey === w), groupId) }))
}

// ---------- Sesiones, duración y densidad ----------

export interface WorkoutStats {
  workoutId: number
  date: ISODate
  weekKey: ISODate
  kind: WorkoutKind
  /** Minutos por reloj (`fin − inicio`), null sin hora de fin. */
  minutes: number | null
  loadKg: number
  bodyweightReps: number
  /** Series que cuentan. */
  sets: number
  /** kg por minuto; null sin duración o con duración 0. */
  density: number | null
}

/** Resumen de cada sesión (también las que no tienen series que cuentan), en orden cronológico. */
export function workoutStats(ctx: MetricsContext, f: Pick<SetFilter, 'from' | 'to' | 'kind'> = {}): WorkoutStats[] {
  const setsBy = new Map<number, CountedSet[]>()
  for (const s of ctx.counted) {
    const l = setsBy.get(s.workoutId)
    if (l) l.push(s)
    else setsBy.set(s.workoutId, [s])
  }
  const out: WorkoutStats[] = []
  for (const w of ctx.workouts) {
    const date = w.startTime.slice(0, 10)
    if (!inRange(date, f.from, f.to) || (f.kind != null && w.kind !== f.kind)) continue
    const sets = setsBy.get(w.id) ?? []
    const minutes = minutesBetween(w.startTime, w.endTime)
    const loadKg = totalLoadKg(sets)
    out.push({
      workoutId: w.id,
      date,
      weekKey: sets[0]?.weekKey ?? weekOf(ctx, date),
      kind: w.kind,
      minutes,
      loadKg,
      bodyweightReps: sets.reduce((a, s) => a + setBodyweightReps(s), 0),
      sets: sets.length,
      density: minutes != null && minutes > 0 ? loadKg / minutes : null
    })
  }
  return out
}

function weekOf(ctx: MetricsContext, date: ISODate): ISODate {
  return weekKeyOf(date, ctx.settings.weekStartsOn)
}

/** Número de sesiones de cada semana pedida (de un tipo, o todas). */
export function sessionsWeekly(ctx: MetricsContext, weekKeys: ISODate[], kind?: WorkoutKind | null): Bucket[] {
  const acc = new Map<string, number>(weekKeys.map((w) => [w, 0]))
  for (const w of ctx.workouts) {
    if (kind != null && w.kind !== kind) continue
    const k = weekOf(ctx, w.startTime)
    if (acc.has(k)) acc.set(k, acc.get(k)! + 1)
  }
  return weekKeys.map((w) => ({ key: w, value: acc.get(w)! }))
}

// ---------- RPE y carga interna ----------

export interface RpeWeek {
  exerciseId: number
  weekKey: ISODate
  avgRpe: number
  /** Series con RPE. */
  sets: number
}

/** RPE medio por ejercicio y semana (solo series con RPE; las demás no cuentan ni como 0). */
export function rpeByExerciseWeek(ctx: MetricsContext, f: SetFilter = {}): RpeWeek[] {
  const acc = new Map<string, { exerciseId: number; weekKey: ISODate; sum: number; n: number }>()
  for (const s of filterSets(ctx, f)) {
    if (s.rpe == null) continue
    const k = `${s.exerciseId}|${s.weekKey}`
    const a = acc.get(k) ?? { exerciseId: s.exerciseId, weekKey: s.weekKey, sum: 0, n: 0 }
    a.sum += s.rpe
    a.n++
    acc.set(k, a)
  }
  return [...acc.values()]
    .map((a) => ({ exerciseId: a.exerciseId, weekKey: a.weekKey, avgRpe: a.sum / a.n, sets: a.n }))
    .sort((a, b) => (a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : a.exerciseId - b.exerciseId))
}

/**
 * Carga interna semanal = Σ (series × RPE), es decir, la suma del RPE de cada serie que cuenta y
 * tiene RPE. null en una semana sin ningún RPE (no es 0: es que no hay dato).
 */
export function internalLoadWeekly(ctx: MetricsContext, weekKeys: ISODate[]): { weekKey: ISODate; load: number | null; setsWithRpe: number }[] {
  return weekKeys.map((w) => {
    const withRpe = ctx.counted.filter((s) => s.weekKey === w && s.rpe != null)
    return { weekKey: w, load: withRpe.length ? withRpe.reduce((a, s) => a + s.rpe!, 0) : null, setsWithRpe: withRpe.length }
  })
}

// ---------- Natación ----------

export interface SwimWeek {
  weekKey: ISODate
  sessions: number
  /** Ejercicios distintos hechos en sesiones de natación. */
  exercises: number
  sets: number
  /** Metros (Σ distancia de las series que cuentan); null si ninguna serie tiene distancia. */
  meters: number | null
}

export function swimWeekly(ctx: MetricsContext, weekKeys: ISODate[]): SwimWeek[] {
  return weekKeys.map((w) => {
    const sessions = ctx.workouts.filter((x) => x.kind === 'SWIM' && weekOf(ctx, x.startTime) === w).length
    const sets = ctx.counted.filter((s) => s.weekKey === w && s.workout.kind === 'SWIM')
    const withDist = sets.filter((s) => s.distanceKm != null)
    return {
      weekKey: w,
      sessions,
      exercises: new Set(sets.map((s) => s.exerciseId)).size,
      sets: sets.length,
      meters: withDist.length ? Math.round(withDist.reduce((a, s) => a + s.distanceKm! * 1000, 0) * 1000) / 1000 : null
    }
  })
}
