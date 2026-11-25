// Hechos de entrada de las métricas de Entreno: filas planas que el proceso principal construye
// leyendo la base. Aquí no hay base de datos, ni Electron, ni reloj: la fecha de "hoy" siempre
// entra como parámetro.
//
// Fechas: `ISODate` = 'YYYY-MM-DD' y `LocalDateTime` = 'YYYY-MM-DDTHH:mm', ambas en hora local
// (Madrid) y sin zona. Se trabajan como texto y con aritmética de días en UTC, así que ni la zona
// del sistema ni el cambio de hora mueven nada.
import type { ISODate } from '../../../types'
import type {
  EntrenoSettings,
  ExerciseCategory,
  GoalStatus,
  GoalType,
  LocalDateTime,
  MeasureType,
  SetType,
  WorkoutKind,
  WorkoutSource
} from '../types'

export type { EntrenoSettings, ISODate, LocalDateTime, WorkoutKind }

/** Hora 'HH:mm' (opcional en el plan). */
export type TimeOfDay = string

export interface WorkoutFact {
  id: number
  /** Título (de Hevy o puesto a mano); opcional porque las métricas no lo usan. */
  title?: string
  startTime: LocalDateTime
  endTime: LocalDateTime | null
  kind: WorkoutKind
  /** Tipo de entreno (rutina) al que corresponde, si lo tiene. */
  routineId: number | null
  blockId: number | null
  perceivedEffort: number | null
  source: WorkoutSource
}

export interface SetFact {
  workoutId: number
  /** Id del catálogo: los alias y los ejercicios unidos ya apuntan al mismo id. */
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
  /** Clave de la estación HYROX (nombre en inglés) o null. */
  hyroxStation: string | null
  primaryGroupId: number | null
  secondaryGroupIds: number[]
}

export interface MuscleGroupFact {
  id: number
  name: string
  /** false = grupo desactivado: no sale en las listas por grupo (sus series siguen contando). */
  active?: boolean
  weeklySetsMin: number
  weeklySetsMax: number
}

/** Tipo de entreno ("Fuerza A", "Natación"…), guardado en `trn_routines`. */
export interface RoutineFact {
  id: number
  name: string
  kind: WorkoutKind
}

export interface BlockFact {
  id: number
  name: string
  startDate: ISODate
  /** null = abierto (sigue en curso). */
  endDate: ISODate | null
  /** Sesiones previstas por semana y tipo de sesión. */
  plannedByKind: Partial<Record<WorkoutKind, number>>
  /** El bloque es una fase de este evento. */
  eventId: number | null
  /** Semana(s) de descarga. */
  isDeload: boolean
}

export interface EventFact {
  id: number
  name: string
  date: ISODate
}

export interface GoalFact {
  id: number
  /** Nombre visible (opcional: las métricas no lo usan). */
  name?: string
  type: GoalType
  /** kg (E1RM, WEIGHT_REPS), series o kg (WEEKLY_VOLUME), sesiones o días (FREQUENCY). */
  targetValue: number | null
  /** Repeticiones mínimas (WEIGHT_REPS). */
  targetReps: number | null
  deadline: ISODate | null
  exerciseId: number | null
  groupId: number | null
  kind: WorkoutKind | null
  eventId: number | null
  status: GoalStatus
}

/** Fila del plan guardado de una semana concreta (`trn_week_plan`). */
export interface PlanEntryFact {
  date: ISODate
  order: number
  routineId: number
  time: TimeOfDay | null
}

/** Semana con plan guardado (puede no tener huecos: toda de descanso). */
export interface SavedWeekFact {
  /** Primer día de la semana guardada (lunes). */
  weekStart: ISODate
  slots: PlanEntryFact[]
}

/** Fila de la semana base o boceto (`trn_base_week`). `weekday`: 1 = lunes … 7 = domingo. */
export interface BaseWeekEntryFact {
  weekday: number
  order: number
  routineId: number
  time: TimeOfDay | null
}

/** Todo lo que necesitan las métricas. Las listas pueden venir en cualquier orden. */
export interface MetricsFacts {
  workouts: WorkoutFact[]
  sets: SetFact[]
  exercises: ExerciseFact[]
  groups: MuscleGroupFact[]
  routines: RoutineFact[]
  blocks: BlockFact[]
  events: EventFact[]
  goals: GoalFact[]
  /** Semanas con plan guardado. */
  savedWeeks: SavedWeekFact[]
  /** Boceto vigente. */
  baseWeek: BaseWeekEntryFact[]
  /**
   * Fecha en que se guardó el boceto por primera vez. Las semanas anteriores a la suya no tuvieron
   * plan y no usan el boceto. Sin poner o null = el boceto vale para cualquier semana.
   */
  baseFirstSavedOn?: ISODate | null
}
