// Constructores de hechos inventados para los tests de métricas de Entreno.
import type { EntrenoSettings, SetType, WorkoutKind } from '../../src/shared/modules/entreno/types'
import {
  type BlockFact,
  type ExerciseFact,
  type GoalFact,
  type MetricsContext,
  type MetricsFacts,
  type MuscleGroupFact,
  type SetFact,
  type WorkoutFact,
  prepareMetrics
} from '../../src/shared/modules/entreno/metrics'

export const SETTINGS: EntrenoSettings = {
  e1rmFormula: 'EPLEY',
  e1rmMinReps: 1,
  e1rmMaxReps: 12,
  countedSetTypes: ['normal', 'dropset', 'failure'],
  weekStartsOn: 1,
  secondaryMuscleFactor: 0.5,
  trendWeeks: 6,
  timeZone: 'Europe/Madrid'
}

export function facts(p: Partial<MetricsFacts> = {}): MetricsFacts {
  return {
    workouts: [],
    sets: [],
    exercises: [],
    groups: [],
    routines: [],
    blocks: [],
    events: [],
    goals: [],
    savedWeeks: [],
    baseWeek: [],
    ...p
  }
}

export function ctxOf(p: Partial<MetricsFacts> = {}, s: Partial<EntrenoSettings> = {}): MetricsContext {
  return prepareMetrics(facts(p), { ...SETTINGS, ...s })
}

export function wk(id: number, startTime: string, o: Partial<WorkoutFact> = {}): WorkoutFact {
  return { id, startTime, endTime: null, kind: 'GYM', routineId: null, blockId: null, perceivedEffort: null, source: 'HEVY', ...o }
}

const nextIndex = new Map<string, number>()
/** Serie: el índice dentro del ejercicio sube solo. */
export function st(
  workoutId: number,
  exerciseId: number,
  weightKg: number | null,
  reps: number | null,
  o: Partial<SetFact> & { type?: SetType } = {}
): SetFact {
  const k = `${workoutId}|${exerciseId}`
  const setIndex = nextIndex.get(k) ?? 0
  nextIndex.set(k, setIndex + 1)
  const { type, ...rest } = o
  return {
    workoutId,
    exerciseId,
    exerciseOrder: exerciseId,
    setIndex,
    setType: type ?? 'normal',
    weightKg,
    reps,
    distanceKm: null,
    durationSeconds: null,
    rpe: null,
    ...rest
  }
}

export function ex(id: number, o: Partial<ExerciseFact> = {}): ExerciseFact {
  return {
    id,
    title: `Ejercicio ${id}`,
    category: 'STRENGTH',
    measure: 'WEIGHT_REPS',
    isBodyweight: false,
    hyroxStation: null,
    primaryGroupId: null,
    secondaryGroupIds: [],
    ...o
  }
}

export function grp(id: number, name: string, min = 10, max = 20): MuscleGroupFact {
  return { id, name, weeklySetsMin: min, weeklySetsMax: max }
}

export function blk(id: number, startDate: string, endDate: string | null, o: Partial<BlockFact> = {}): BlockFact {
  return { id, name: `Bloque ${id}`, startDate, endDate, plannedByKind: {}, eventId: null, isDeload: false, ...o }
}

export function goal(id: number, o: Partial<GoalFact> & { type: GoalFact['type'] }): GoalFact {
  return {
    id,
    targetValue: null,
    targetReps: null,
    deadline: null,
    exerciseId: null,
    groupId: null,
    kind: null,
    eventId: null,
    status: 'ACTIVE',
    ...o
  }
}

export const rt = (id: number, name: string, kind: WorkoutKind) => ({ id, name, kind })
