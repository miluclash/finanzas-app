// Contexto de métricas: los hechos con sus índices y las series que cuentan ya enriquecidas con
// su sesión, fecha, semana y mes. Se construye una vez por petición y lo usan todas las funciones.
import type { SetType } from '../types'
import type {
  BlockFact,
  EntrenoSettings,
  EventFact,
  ExerciseFact,
  ISODate,
  MetricsFacts,
  MuscleGroupFact,
  RoutineFact,
  SetFact,
  WorkoutFact
} from './types'
import { dateOf, monthKeyOf, weekKeyOf } from './weeks'

/** Serie que cuenta (tipo incluido en `countedSetTypes`), con su contexto. */
export interface CountedSet extends SetFact {
  workout: WorkoutFact
  /** Undefined si el ejercicio no está en el catálogo (se trata como de carga y sin grupos). */
  exercise: ExerciseFact | undefined
  date: ISODate
  weekKey: ISODate
  monthKey: string
}

export interface MetricsContext {
  facts: MetricsFacts
  settings: EntrenoSettings
  workoutById: Map<number, WorkoutFact>
  exerciseById: Map<number, ExerciseFact>
  groupById: Map<number, MuscleGroupFact>
  routineById: Map<number, RoutineFact>
  blockById: Map<number, BlockFact>
  eventById: Map<number, EventFact>
  /** Sesiones en orden cronológico (inicio y, a igualdad, id). */
  workouts: WorkoutFact[]
  /** Series que cuentan, en orden cronológico de sesión, ejercicio y serie. */
  counted: CountedSet[]
}

/** ¿Esta serie cuenta en las métricas de rendimiento? (los calentamientos, por defecto, no). */
export function isCountedSetType(setType: SetType, settings: EntrenoSettings): boolean {
  return settings.countedSetTypes.includes(setType)
}

export function compareWorkouts(a: WorkoutFact, b: WorkoutFact): number {
  return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : a.id - b.id
}

export function prepareMetrics(facts: MetricsFacts, settings: EntrenoSettings): MetricsContext {
  const byId = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))
  const workoutById = byId(facts.workouts)
  const exerciseById = byId(facts.exercises)
  const workouts = [...facts.workouts].sort(compareWorkouts)
  const rank = new Map(workouts.map((w, i) => [w.id, i]))
  const counted: CountedSet[] = []
  for (const s of facts.sets) {
    const workout = workoutById.get(s.workoutId)
    if (!workout || !isCountedSetType(s.setType, settings)) continue
    const date = dateOf(workout.startTime)
    counted.push({
      ...s,
      workout,
      exercise: exerciseById.get(s.exerciseId),
      date,
      weekKey: weekKeyOf(date, settings.weekStartsOn),
      monthKey: monthKeyOf(date)
    })
  }
  counted.sort(
    (a, b) => rank.get(a.workoutId)! - rank.get(b.workoutId)! || a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex
  )
  return {
    facts,
    settings,
    workoutById,
    exerciseById,
    groupById: byId(facts.groups),
    routineById: byId(facts.routines),
    blockById: byId(facts.blocks),
    eventById: byId(facts.events),
    workouts,
    counted
  }
}

/** ¿El ejercicio es de peso corporal? (un ejercicio fuera del catálogo se trata como de carga). */
export function isBodyweight(s: CountedSet): boolean {
  return s.exercise?.isBodyweight === true
}

/**
 * Carga de una serie en kg (peso × repeticiones). 0 si falta el peso o las repeticiones, y 0 en
 * ejercicios de peso corporal: su volumen va aparte en repeticiones y no se mezcla con kg (el
 * lastre de un ejercicio de peso corporal tampoco suma kg; es la opción más simple).
 */
export function setLoadKg(s: CountedSet): number {
  if (isBodyweight(s)) return 0
  if (s.weightKg == null || s.reps == null || s.weightKg <= 0 || s.reps <= 0) return 0
  return s.weightKg * s.reps
}

/** Repeticiones de una serie de peso corporal (0 en ejercicios de carga). */
export function setBodyweightReps(s: CountedSet): number {
  if (!isBodyweight(s) || s.reps == null || s.reps <= 0) return 0
  return s.reps
}

/**
 * e1RM de una serie: Epley `peso × (1 + reps/30)` o Brzycki `peso × 36 / (37 − reps)`, según
 * `e1rmFormula`, y solo con `e1rmMinReps ≤ reps ≤ e1rmMaxReps`. La fórmula se aplica tal cual,
 * también con 1 repetición (Epley da peso × 1,033). Sin redondear: se redondea al mostrar.
 */
export function e1rm(weightKg: number | null, reps: number | null, settings: EntrenoSettings): number | null {
  if (weightKg == null || reps == null || !(weightKg > 0) || !(reps > 0)) return null
  if (reps < settings.e1rmMinReps || reps > settings.e1rmMaxReps) return null
  if (settings.e1rmFormula === 'BRZYCKI') {
    if (reps >= 37) return null
    return (weightKg * 36) / (37 - reps)
  }
  return weightKg * (1 + reps / 30)
}

/** e1RM de una serie que cuenta (null en ejercicios de peso corporal). */
export function setE1rm(s: CountedSet, settings: EntrenoSettings): number | null {
  if (isBodyweight(s)) return null
  return e1rm(s.weightKg, s.reps, settings)
}

/** Bloque que contiene una fecha (los bloques no se solapan; si lo hicieran, gana el que empieza antes). */
export function blockAt(blocks: BlockFact[], date: ISODate): BlockFact | undefined {
  return [...blocks]
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id - b.id))
    .find((b) => b.startDate <= date && (b.endDate == null || date <= b.endDate))
}

/** ¿Algún día de la semana [weekStart, weekStart+6] cae en el bloque? */
export function blockOverlapsWeek(b: BlockFact, weekStart: ISODate, weekEnd: ISODate): boolean {
  return b.startDate <= weekEnd && (b.endDate == null || b.endDate >= weekStart)
}
