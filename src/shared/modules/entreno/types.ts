// Tipos de Entreno: constantes del esquema (las mismas que comprueban los CHECK de SQL) y el
// contrato IPC entre la interfaz y el proceso principal (DTOs en camelCase).
//
// Fechas y horas: `LocalDateTime` es ISO local sin zona `YYYY-MM-DDTHH:mm` (hora de Madrid), como
// se guarda en `trn_workouts.start_time`. Pesos en kg (REAL), duraciones en segundos enteros,
// distancias en km (REAL).
import type { ISODate } from '../../types'

export type { ISODate }

/** ISO local `YYYY-MM-DDTHH:mm`, sin zona horaria. */
export type LocalDateTime = string

export const WORKOUT_KINDS = ['GYM', 'SWIM', 'HYROX', 'RUN', 'OTHER'] as const
export type WorkoutKind = (typeof WORKOUT_KINDS)[number]

export const WORKOUT_SOURCES = ['HEVY', 'MANUAL'] as const
export type WorkoutSource = (typeof WORKOUT_SOURCES)[number]

export const SET_TYPES = ['normal', 'warmup', 'dropset', 'failure'] as const
export type SetType = (typeof SET_TYPES)[number]

/** Categoría de ejercicio (NULL en la base hasta que Michael la ponga). */
export const EXERCISE_CATEGORIES = ['STRENGTH', 'SWIM', 'HYROX', 'CARDIO', 'MOBILITY'] as const
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number]

/** Qué se mide en las series del ejercicio. */
export const MEASURE_TYPES = ['WEIGHT_REPS', 'REPS', 'DURATION', 'WEIGHT_DURATION', 'DISTANCE_DURATION', 'WEIGHT_DISTANCE'] as const
export type MeasureType = (typeof MEASURE_TYPES)[number]

export const MUSCLE_ROLES = ['primary', 'secondary'] as const
export type MuscleRole = (typeof MUSCLE_ROLES)[number]

export const KIND_RULE_FIELDS = ['title', 'exercise'] as const
export type KindRuleField = (typeof KIND_RULE_FIELDS)[number]

export const IMPORT_FORMATS = ['CSV', 'TSV', 'XLSX'] as const
export type ImportFormat = (typeof IMPORT_FORMATS)[number]

export const GOAL_TYPES = ['E1RM', 'WEIGHT_REPS', 'WEEKLY_VOLUME', 'FREQUENCY', 'EVENT'] as const
export type GoalType = (typeof GOAL_TYPES)[number]

export const GOAL_STATUSES = ['ACTIVE', 'ACHIEVED', 'ABANDONED'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const E1RM_FORMULAS = ['EPLEY', 'BRZYCKI'] as const
export type E1rmFormula = (typeof E1RM_FORMULAS)[number]

/** Columnas de la exportación de Hevy, en su orden (también las de la vista `trn_v_hevy`). */
export const HEVY_VIEW_COLUMNS = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
  'rpe'
] as const

/** Fila de la vista `trn_v_hevy` (fechas en formato Hevy `5 Nov 2026, 07:05`). */
export interface HevyViewRow {
  title: string
  start_time: string
  end_time: string | null
  description: string | null
  exercise_title: string
  superset_id: string | null
  exercise_notes: string | null
  set_index: number
  set_type: SetType
  weight_kg: number | null
  reps: number | null
  distance_km: number | null
  duration_seconds: number | null
  rpe: number | null
}

// ---------- Sesiones ----------

export interface WorkoutBase {
  id: number
  title: string
  startTime: LocalDateTime
  endTime: LocalDateTime | null
  description: string | null
  kind: WorkoutKind
  /** El tipo se corrigió a mano: las reglas ya no lo cambian. */
  kindManual: boolean
  source: WorkoutSource
  perceivedEffort: number | null
  notes: string | null
  blockId: number | null
  routineId: number | null
  importId: number | null
  /** `título|start_time` (solo sesiones de Hevy). */
  hevyKey: string | null
  createdAt: string
  updatedAt: string
}

/** Sesión con su resumen (listado). */
export interface WorkoutSummary extends WorkoutBase {
  /** `end_time − start_time` en segundos (null si no hay fin). */
  durationSeconds: number | null
  exerciseCount: number
  setCount: number
}

export interface WorkoutSet {
  id: number
  setIndex: number
  setType: SetType
  weightKg: number | null
  reps: number | null
  distanceKm: number | null
  durationSeconds: number | null
  rpe: number | null
  notes: string | null
}

/** Un ejercicio dentro de una sesión, con sus series en orden. */
export interface WorkoutExercise {
  exerciseOrder: number
  exerciseId: number
  /** Título tal como vino en la serie (el de Hevy). */
  exerciseTitle: string
  /** Título actual del ejercicio en el catálogo (puede diferir si se renombró o se unió). */
  catalogTitle: string
  supersetId: string | null
  exerciseNotes: string | null
  sets: WorkoutSet[]
}

export interface WorkoutDetail extends WorkoutSummary {
  exercises: WorkoutExercise[]
}

export interface WorkoutFilter {
  kind?: WorkoutKind | null
  /** Desde esta fecha (incluida). */
  from?: ISODate | null
  /** Hasta esta fecha (incluida). */
  to?: ISODate | null
  /** Busca en título, descripción, notas y ejercicios (sin distinguir mayúsculas). */
  search?: string | null
  source?: WorkoutSource | null
  limit?: number | null
  offset?: number | null
}

/**
 * Cambios de los campos propios de la app en una sesión (de Hevy o manual). Solo cambian las
 * claves presentes. `kind: null` devuelve la sesión al tipo automático (reglas).
 */
export interface WorkoutExtrasInput {
  id: number
  kind?: WorkoutKind | null
  perceivedEffort?: number | null
  notes?: string | null
  blockId?: number | null
  routineId?: number | null
}

export interface ManualSetInput {
  setType?: SetType
  weightKg?: number | null
  reps?: number | null
  distanceKm?: number | null
  durationSeconds?: number | null
  rpe?: number | null
  notes?: string | null
}

export interface ManualExerciseInput {
  exerciseId: number
  supersetId?: string | null
  exerciseNotes?: string | null
  sets: ManualSetInput[]
}

/**
 * Sesión manual completa. Con `id` se edita (solo si es MANUAL) y se sustituyen todas sus series.
 * `exercise_order` y `set_index` salen del orden de los arrays (desde 0, como Hevy).
 * `kind: null` = lo deciden las reglas.
 */
export interface ManualWorkoutInput {
  id?: number | null
  title: string
  startTime: LocalDateTime
  endTime?: LocalDateTime | null
  description?: string | null
  kind?: WorkoutKind | null
  perceivedEffort?: number | null
  notes?: string | null
  blockId?: number | null
  routineId?: number | null
  exercises: ManualExerciseInput[]
}

// ---------- Ejercicios y catálogos ----------

export interface ExerciseAlias {
  id: number
  alias: string
}

export interface Exercise {
  id: number
  title: string
  category: ExerciseCategory | null
  measure: MeasureType
  isBodyweight: boolean
  active: boolean
  notes: string | null
  primaryGroupId: number | null
  secondaryGroupIds: number[]
  aliases: ExerciseAlias[]
  setCount: number
  /** Inicio de la última sesión en la que aparece. */
  lastUsed: LocalDateTime | null
}

export interface ExerciseInput {
  id?: number | null
  title: string
  category?: ExerciseCategory | null
  measure?: MeasureType
  isBodyweight?: boolean
  active?: boolean
  notes?: string | null
  primaryGroupId?: number | null
  secondaryGroupIds?: number[]
}

export interface MuscleGroup {
  id: number
  name: string
  sortOrder: number
  active: boolean
  /** Ejercicios que lo usan (principal o secundario). */
  exerciseCount: number
}

export interface MuscleGroupInput {
  id?: number | null
  name: string
  sortOrder?: number
  active?: boolean
}

/** Regla de tipo de sesión. Gana la regla activa de mayor `priority` que case. */
export interface KindRule {
  id: number
  field: KindRuleField
  /** Texto que tiene que contener (sin distinguir mayúsculas ni tildes). */
  contains: string
  kind: WorkoutKind
  priority: number
  active: boolean
}

export interface KindRuleInput {
  id?: number | null
  field: KindRuleField
  contains: string
  kind: WorkoutKind
  priority?: number
  active?: boolean
}

export interface ReapplyResult {
  /** Sesiones con tipo automático revisadas. */
  checked: number
  /** Sesiones cuyo tipo ha cambiado. */
  changed: number
}

/** Parámetros de métricas (trn_settings, una fila por clave con su valor en JSON). */
export interface EntrenoSettings {
  e1rmFormula: E1rmFormula
  e1rmMinReps: number
  e1rmMaxReps: number
  /** Tipos de serie que cuentan en las métricas de rendimiento. */
  countedSetTypes: SetType[]
  /** Día en que empieza la semana: 1 = lunes … 7 = domingo. */
  weekStartsOn: number
  /** Cuánto cuenta una serie para un grupo muscular secundario. */
  secondaryMuscleFactor: number
  /** Semanas para la tendencia de los objetivos. */
  trendWeeks: number
  timeZone: string
}

export interface ImportRecord {
  id: number
  fileName: string
  fileHash: string
  importedAt: string
  format: ImportFormat
  rowsTotal: number
  workoutsNew: number
  workoutsDuplicate: number
  workoutsChanged: number
  rowsError: number
  exercisesNew: number
}

// ---------- Importación de Hevy (servicio para el importador) ----------

/** Serie de Hevy ya parseada (misma forma que `HevySet` del parser). */
export interface HevySetInput {
  exerciseTitle: string
  exerciseOrder: number
  supersetId: string | null
  exerciseNotes: string | null
  setIndex: number
  setType: SetType
  weightKg: number | null
  reps: number | null
  distanceKm: number | null
  durationSeconds: number | null
  rpe: number | null
}

/** Sesión de Hevy ya parseada (misma forma que `HevySession` del parser, sin sus metadatos). */
export interface HevyWorkoutInput {
  hevyKey: string
  title: string
  startTime: LocalDateTime
  endTime: LocalDateTime | null
  description: string | null
  sets: HevySetInput[]
}

/** Sesión de Hevy guardada, con sus series en orden (para que el importador compare firmas). */
export interface StoredHevyWorkout extends HevyWorkoutInput {
  id: number
  kind: WorkoutKind
  kindManual: boolean
}

export interface HevyImportMeta {
  fileName: string
  /** sha256 del archivo. */
  fileHash: string
  format: ImportFormat
  rowsTotal: number
  rowsError: number
  /** Sesiones que ya estaban igual (no se tocan; solo se apuntan). */
  workoutsDuplicate: number
}

/**
 * Entrada de `applyHevyWorkouts`. El importador decide qué es nuevo, duplicado o cambiado.
 * `kinds` permite fijar el tipo de una sesión nueva (por `hevyKey`); si no, lo deciden las reglas.
 */
export interface ApplyHevyInput {
  meta: HevyImportMeta
  newWorkouts: HevyWorkoutInput[]
  changedWorkouts: HevyWorkoutInput[]
  kinds?: Record<string, WorkoutKind>
}

export interface ApplyHevyResult {
  importId: number
  workoutsNew: number
  workoutsChanged: number
  workoutsDuplicate: number
  exercisesNew: number
  setsWritten: number
}
