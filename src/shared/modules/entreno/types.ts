// Tipos de Entreno: constantes del esquema (las mismas que comprueban los CHECK de SQL) y el
// contrato IPC entre la interfaz y el proceso principal (DTOs en camelCase).
//
// Fechas y horas: `LocalDateTime` es ISO local sin zona `YYYY-MM-DDTHH:mm` (hora de Madrid), como
// se guarda en `trn_workouts.start_time`. Pesos en kg (REAL), duraciones en segundos enteros,
// distancias en km (REAL).
import type { ISODate } from '../../types'
import type { HyroxStation } from './hyrox'

export type { HyroxStation, ISODate }

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
  /** Solo se acepta el bloque que le toca por fecha (el bloque sale siempre de la fecha). */
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
  /** Se ignora: el bloque sale de la fecha de la sesión. */
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
  /** Estación HYROX a la que corresponde (null si no es ninguna). */
  hyroxStation: HyroxStation | null
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
  /**
   * Estación HYROX. Al crear, si viene vacía (null o sin poner) se propone con el diccionario
   * (`matchHyroxStation`). Al editar: sin poner = se queda la que tenga; null = ninguna.
   */
  hyroxStation?: HyroxStation | null
}

export interface MuscleGroup {
  id: number
  name: string
  sortOrder: number
  active: boolean
  /** Rango recomendado de series efectivas por semana (por defecto 10–20). */
  weeklySetsMin: number
  weeklySetsMax: number
  /** Ejercicios que lo usan (principal o secundario). */
  exerciseCount: number
}

export interface MuscleGroupInput {
  id?: number | null
  /** Sin poner: al crear, 10 y 20; al editar, se quedan los que tenga. */
  weeklySetsMin?: number
  weeklySetsMax?: number
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

// ---------- Importar y exportar (contrato IPC: entreno:import.*, entreno:export.*, entreno:restore.json) ----------

/** Sesión resumida en la vista previa de una importación de Hevy. */
export interface HevyWorkoutBrief {
  hevyKey: string
  title: string
  startTime: LocalDateTime
  /** Tipo deducido con las reglas (en una sesión cambiada con tipo corregido a mano, el que ya tiene). */
  kind: WorkoutKind
  exerciseCount: number
  setCount: number
}

/** Error de una fila del archivo. El mensaje nunca incluye el contenido de la celda. */
export interface HevyImportError {
  line: number
  column: string | null
  message: string
}

/** Resultado de `import.preview`. No se ha escrito nada. */
export interface HevyImportPreview {
  /** Hay que devolverlo a `import.apply` (o a `import.cancel`). Caduca a los 30 minutos. */
  token: string
  /** Solo el nombre del archivo, sin la ruta. */
  fileName: string
  format: ImportFormat
  rowsTotal: number
  rowsValid: number
  newWorkouts: HevyWorkoutBrief[]
  changedWorkouts: HevyWorkoutBrief[]
  /** Sesiones que ya estaban iguales en la app. */
  duplicateCount: number
  /** Sesiones con alguna fila con error: no se importan. */
  sessionsWithErrors: number
  errors: HevyImportError[]
  /** Títulos de ejercicios que no existen todavía en el catálogo. */
  newExercises: string[]
  warnings: string[]
  /** Ya se importó un archivo idéntico antes (aviso, no bloquea). */
  alreadyImported: boolean
}

export interface HevyImportResult {
  importId: number
  workoutsNew: number
  workoutsChanged: number
  workoutsDuplicate: number
  sessionsWithErrors: number
  rowsError: number
  exercisesNew: number
  setsWritten: number
  /** Copia de seguridad hecha justo antes (null si no hay carpeta de copias). */
  backup: string | null
}

/** Resultado de `restore.json` (null si se cancela el diálogo). */
export interface EntrenoRestoreResult {
  safetyBackup: string | null
}

// ---------- Planificación: tipos de entreno, semana base, semana concreta (F4) ----------

/** Hora `HH:mm` (24 h). */
export type TimeHM = string

/** Día de la semana: 1 = lunes … 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface RoutineAlias {
  id: number
  alias: string
}

/** Ejercicio previsto de un tipo de entreno (opcional). */
export interface RoutineItem {
  id: number
  exerciseId: number
  /** Posición en la rutina (desde 0). */
  order: number
  targetSets: number | null
  repsMin: number | null
  repsMax: number | null
  targetRpe: number | null
  notes: string | null
}

/** Tipo de entreno ("Fuerza A", "Natación"…), en `trn_routines`. */
export interface Routine {
  id: number
  name: string
  kind: WorkoutKind
  description: string | null
  sortOrder: number
  active: boolean
  /** Otros títulos de Hevy que cuentan como este tipo de entreno al importar. */
  aliases: RoutineAlias[]
  items: RoutineItem[]
  /** Sesiones que lo tienen asignado. */
  workoutCount: number
}

export interface RoutineItemInput {
  exerciseId: number
  targetSets?: number | null
  repsMin?: number | null
  repsMax?: number | null
  targetRpe?: number | null
  notes?: string | null
}

/**
 * Alta o edición de un tipo de entreno. `aliases` e `items`: sin poner = se quedan como estén;
 * con valor = sustituyen a los que hubiera (el orden de `items` es el del array).
 */
export interface RoutineInput {
  id?: number | null
  name: string
  kind: WorkoutKind
  description?: string | null
  active?: boolean
  aliases?: string[]
  items?: RoutineItemInput[]
}

/** Hueco de la semana base (boceto). */
export interface BaseWeekSlot {
  weekday: Weekday
  /** Orden dentro del día (desde 0). */
  order: number
  routineId: number
  routineName: string
  routineKind: WorkoutKind
  time: TimeHM | null
}

export interface BaseWeek {
  slots: BaseWeekSlot[]
  /** Fecha en que se guardó el boceto por primera vez (null si nunca). Límite del guardado automático. */
  firstSavedOn: ISODate | null
  updatedAt: string | null
}

/** Hueco del boceto al guardarlo. El orden dentro de cada día es el del array. */
export interface BaseWeekSlotInput {
  weekday: number
  routineId: number
  time?: TimeHM | null
}

/** `BASE` = copia del boceto (guardado automático o "volver al boceto"); `EDITED` = cambiada por Michael. */
export const WEEK_PLAN_ORIGINS = ['BASE', 'EDITED'] as const
export type WeekPlanOrigin = (typeof WEEK_PLAN_ORIGINS)[number]

export interface WeekPlanSlot {
  date: ISODate
  weekday: Weekday
  /** Orden dentro del día (desde 0). */
  order: number
  routineId: number
  routineName: string
  routineKind: WorkoutKind
  time: TimeHM | null
  note: string | null
}

/**
 * Plan de una semana (de lunes a domingo). Si no está guardada (`saved: false`), los huecos son
 * el boceto actual proyectado sobre esa semana.
 */
export interface WeekPlan {
  /** Lunes. */
  weekStart: ISODate
  /** Domingo. */
  weekEnd: ISODate
  saved: boolean
  origin: WeekPlanOrigin | null
  savedAt: string | null
  /**
   * La semana es anterior a la del primer boceto (o no hay boceto): no hubo plan. Las semanas así
   * no se guardan solas.
   */
  predatesBase: boolean
  /** Ordenados por fecha y orden. */
  slots: WeekPlanSlot[]
}

/** Hueco de una semana concreta al guardarla. El orden dentro de cada día es el del array. */
export interface WeekPlanSlotInput {
  date: ISODate
  routineId: number
  time?: TimeHM | null
  note?: string | null
}

export interface WeekPlanSlotRef {
  date: ISODate
  order: number
}

/** Mover un hueco de día o de orden. Sin `to.order`, va al final del día de destino. */
export interface WeekPlanMoveInput {
  from: WeekPlanSlotRef
  to: { date: ISODate; order?: number | null }
}

// ---------- Bloques, eventos y objetivos (F4) ----------

export interface Block {
  id: number
  name: string
  startDate: ISODate
  /** null = sin fecha de fin (sigue abierto). */
  endDate: ISODate | null
  mainGoal: string | null
  plannedGym: number
  plannedSwim: number
  plannedHyrox: number
  plannedRun: number
  plannedOther: number
  notes: string | null
  /** Evento del que este bloque es una fase. */
  eventId: number | null
  /** Semana o bloque de descarga. */
  isDeload: boolean
  /** Sesiones dentro de sus fechas. */
  workoutCount: number
  createdAt: string
  updatedAt: string
}

export interface BlockInput {
  id?: number | null
  name: string
  startDate: ISODate
  endDate?: ISODate | null
  mainGoal?: string | null
  plannedGym?: number
  plannedSwim?: number
  plannedHyrox?: number
  plannedRun?: number
  plannedOther?: number
  notes?: string | null
  eventId?: number | null
  isDeload?: boolean
}

/** Evento con fecha (p. ej. una carrera de HYROX). */
export interface TrainingEvent {
  id: number
  name: string
  date: ISODate
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface TrainingEventInput {
  id?: number | null
  name: string
  date: ISODate
  notes?: string | null
}

/**
 * Objetivo. Qué campos usa cada tipo:
 * - E1RM: `exerciseId` y `targetValue` (kg de e1RM).
 * - WEIGHT_REPS: `exerciseId`, `targetValue` (kg) y `targetReps`.
 * - WEEKLY_VOLUME: `groupId` (series efectivas/semana) o `exerciseId` (kg/semana) y `targetValue`.
 * - FREQUENCY: `kind` (sesiones/semana) o `groupId` (días/semana) y `targetValue`.
 * - EVENT: `eventId`.
 * Los campos que no usa su tipo se guardan vacíos.
 */
export interface Goal {
  id: number
  name: string
  type: GoalType
  targetValue: number | null
  targetReps: number | null
  deadline: ISODate | null
  exerciseId: number | null
  groupId: number | null
  eventId: number | null
  kind: WorkoutKind | null
  status: GoalStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface GoalInput {
  id?: number | null
  name: string
  type: GoalType
  targetValue?: number | null
  targetReps?: number | null
  deadline?: ISODate | null
  exerciseId?: number | null
  groupId?: number | null
  eventId?: number | null
  kind?: WorkoutKind | null
  /** Solo al crear (por defecto ACTIVE); para cambiarlo después, `goals.setStatus`. */
  status?: GoalStatus
  notes?: string | null
}

// ---------- Hechos para las métricas (lecturas en bloque, sin N+1) ----------

/** Sesión tal como la necesitan las métricas. */
export interface WorkoutFact {
  id: number
  title: string
  startTime: LocalDateTime
  endTime: LocalDateTime | null
  /** Fecha local de inicio (`YYYY-MM-DD`). */
  date: ISODate
  kind: WorkoutKind
  routineId: number | null
  blockId: number | null
  perceivedEffort: number | null
  source: WorkoutSource
}

/** Serie con su ejercicio del catálogo (todas, también las de calentamiento: el filtro es de las métricas). */
export interface SetFact {
  id: number
  workoutId: number
  exerciseId: number
  exerciseOrder: number
  setIndex: number
  setType: SetType
  weightKg: number | null
  reps: number | null
  distanceKm: number | null
  durationSeconds: number | null
  rpe: number | null
}

export interface ExerciseFact {
  id: number
  title: string
  category: ExerciseCategory | null
  measure: MeasureType
  isBodyweight: boolean
  active: boolean
  primaryGroupId: number | null
  secondaryGroupIds: number[]
  hyroxStation: HyroxStation | null
}

export interface MuscleGroupFact {
  id: number
  name: string
  active: boolean
  weeklySetsMin: number
  weeklySetsMax: number
}

export interface RoutineFact {
  id: number
  name: string
  kind: WorkoutKind
  active: boolean
}

export interface BaseWeekSlotFact {
  weekday: Weekday
  order: number
  routineId: number
  time: TimeHM | null
}

export interface PlannedSlotFact {
  date: ISODate
  order: number
  routineId: number
  time: TimeHM | null
  note: string | null
}

/** Semana guardada en `trn_week_plan` (puede no tener huecos: toda de descanso). */
export interface SavedWeekFact {
  weekStart: ISODate
  origin: WeekPlanOrigin
  savedAt: string
  slots: PlannedSlotFact[]
}

/** Rango de fechas (ambas incluidas) para limitar sesiones y series; sin poner = todo. */
export interface FactsRange {
  from?: ISODate | null
  to?: ISODate | null
}

/** Todo lo que necesitan las métricas de Entreno, leído en bloque. */
export interface EntrenoFacts {
  settings: EntrenoSettings
  workouts: WorkoutFact[]
  sets: SetFact[]
  exercises: ExerciseFact[]
  muscleGroups: MuscleGroupFact[]
  routines: RoutineFact[]
  blocks: Block[]
  events: TrainingEvent[]
  goals: Goal[]
  baseWeek: BaseWeekSlotFact[]
  /** Fecha del primer boceto (las semanas anteriores no tuvieron plan). */
  baseFirstSavedOn: ISODate | null
  savedWeeks: SavedWeekFact[]
}
