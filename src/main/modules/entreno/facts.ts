// Lecturas en bloque de los "hechos" que necesitan las métricas de Entreno (lógica pura en
// src/shared/modules/entreno/metrics). Cada función hace un número fijo de consultas, sin N+1, y
// devuelve los tipos de `types.ts`. Solo leen.
import { mondayOf } from '@shared/modules/entreno/plan'
import type {
  BaseWeekSlotFact,
  EntrenoFacts,
  ExerciseCategory,
  ExerciseFact,
  FactsRange,
  HyroxStation,
  MeasureType,
  MuscleGroupFact,
  RoutineFact,
  SavedWeekFact,
  SetFact,
  SetType,
  WorkoutFact,
  WorkoutKind,
  WorkoutSource
} from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { listBlocks, listEvents } from './blocks'
import { getSettings } from './catalog'
import { listGoals } from './goals'
import { baseWeekMeta, baseWeekSlots, savedWeeks } from './planning'

/** Condición sobre `w.start_time` para un rango de fechas (ambas incluidas). */
function rangeWhere(range: FactsRange | undefined): { sql: string; params: string[] } {
  const where: string[] = []
  const params: string[] = []
  if (range?.from) {
    where.push('w.start_time >= ?')
    params.push(range.from)
  }
  if (range?.to) {
    // `start_time` es `YYYY-MM-DDTHH:mm`: todo el día `to` queda por debajo de `to` + 'U'.
    where.push('w.start_time < ?')
    params.push(`${range.to}U`)
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

/** Sesiones, de la más antigua a la más nueva. */
export function workoutFacts(db: Db, range?: FactsRange): WorkoutFact[] {
  const w = rangeWhere(range)
  return db
    .all<{
      id: number
      title: string
      start_time: string
      end_time: string | null
      kind: WorkoutKind
      routine_id: number | null
      block_id: number | null
      perceived_effort: number | null
      source: WorkoutSource
    }>(
      `SELECT w.id, w.title, w.start_time, w.end_time, w.kind, w.routine_id, w.block_id, w.perceived_effort, w.source
       FROM trn_workouts w ${w.sql} ORDER BY w.start_time, w.id`,
      w.params
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      startTime: r.start_time,
      endTime: r.end_time,
      date: r.start_time.slice(0, 10),
      kind: r.kind,
      routineId: r.routine_id,
      blockId: r.block_id,
      perceivedEffort: r.perceived_effort,
      source: r.source
    }))
}

/** Series (todas, también calentamientos), en el orden de sus sesiones. */
export function setFacts(db: Db, range?: FactsRange): SetFact[] {
  const w = rangeWhere(range)
  return db
    .all<{
      id: number
      workout_id: number
      exercise_id: number
      exercise_order: number
      set_index: number
      set_type: SetType
      weight_kg: number | null
      reps: number | null
      distance_km: number | null
      duration_seconds: number | null
      rpe: number | null
    }>(
      `SELECT s.id, s.workout_id, s.exercise_id, s.exercise_order, s.set_index, s.set_type, s.weight_kg, s.reps, s.distance_km,
              s.duration_seconds, s.rpe
       FROM trn_sets s JOIN trn_workouts w ON w.id = s.workout_id ${w.sql}
       ORDER BY w.start_time, w.id, s.exercise_order, s.set_index`,
      w.params
    )
    .map((r) => ({
      id: r.id,
      workoutId: r.workout_id,
      exerciseId: r.exercise_id,
      exerciseOrder: r.exercise_order,
      setIndex: r.set_index,
      setType: r.set_type,
      weightKg: r.weight_kg,
      reps: r.reps,
      distanceKm: r.distance_km,
      durationSeconds: r.duration_seconds,
      rpe: r.rpe
    }))
}

/** Ejercicios con su grupo principal, secundarios y estación HYROX. */
export function exerciseFacts(db: Db): ExerciseFact[] {
  const muscles = db.all<{ exercise_id: number; group_id: number; role: string }>(
    `SELECT m.exercise_id, m.group_id, m.role FROM trn_exercise_muscles m
     JOIN trn_muscle_groups g ON g.id = m.group_id ORDER BY g.sort_order, g.id`
  )
  const primary = new Map<number, number>()
  const secondary = new Map<number, number[]>()
  for (const m of muscles) {
    if (m.role === 'primary') primary.set(m.exercise_id, m.group_id)
    else secondary.set(m.exercise_id, [...(secondary.get(m.exercise_id) ?? []), m.group_id])
  }
  return db
    .all<{
      id: number
      title: string
      category: ExerciseCategory | null
      measure: MeasureType
      is_bodyweight: number
      active: number
      hyrox_station: HyroxStation | null
    }>('SELECT id, title, category, measure, is_bodyweight, active, hyrox_station FROM trn_exercises ORDER BY id')
    .map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      measure: r.measure,
      isBodyweight: r.is_bodyweight === 1,
      active: r.active === 1,
      primaryGroupId: primary.get(r.id) ?? null,
      secondaryGroupIds: secondary.get(r.id) ?? [],
      hyroxStation: r.hyrox_station
    }))
}

export function muscleGroupFacts(db: Db): MuscleGroupFact[] {
  return db
    .all<{ id: number; name: string; active: number; weekly_sets_min: number; weekly_sets_max: number }>(
      'SELECT id, name, active, weekly_sets_min, weekly_sets_max FROM trn_muscle_groups ORDER BY sort_order, id'
    )
    .map((r) => ({ id: r.id, name: r.name, active: r.active === 1, weeklySetsMin: r.weekly_sets_min, weeklySetsMax: r.weekly_sets_max }))
}

export function routineFacts(db: Db): RoutineFact[] {
  return db
    .all<{ id: number; name: string; kind: WorkoutKind; active: number }>('SELECT id, name, kind, active FROM trn_routines ORDER BY sort_order, id')
    .map((r) => ({ id: r.id, name: r.name, kind: r.kind, active: r.active === 1 }))
}

export function baseWeekFacts(db: Db): BaseWeekSlotFact[] {
  return baseWeekSlots(db)
}

/** Semanas con plan guardado. Con `range`, las que empiezan entre el lunes de `from` y `to`. */
export function savedWeekFacts(db: Db, range?: FactsRange): SavedWeekFact[] {
  return savedWeeks(db, range?.from ? mondayOf(range.from) : null, range?.to ?? null)
}

/**
 * Todos los hechos de golpe. `range` limita sesiones, series y semanas guardadas; el resto
 * (catálogo, bloques, eventos, objetivos, boceto, ajustes) va entero.
 */
export function loadEntrenoFacts(db: Db, range?: FactsRange): EntrenoFacts {
  return {
    settings: getSettings(db),
    workouts: workoutFacts(db, range),
    sets: setFacts(db, range),
    exercises: exerciseFacts(db),
    muscleGroups: muscleGroupFacts(db),
    routines: routineFacts(db),
    blocks: listBlocks(db),
    events: listEvents(db),
    goals: listGoals(db),
    baseWeek: baseWeekFacts(db),
    baseFirstSavedOn: baseWeekMeta(db)?.firstSavedOn ?? null,
    savedWeeks: savedWeekFacts(db, range)
  }
}
