import type { IsoLocalDateTime } from './dates'

export const HEVY_COLUMNS = [
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
export type HevyColumn = (typeof HEVY_COLUMNS)[number]

export const SET_TYPES = ['normal', 'warmup', 'dropset', 'failure'] as const
export type HevySetType = (typeof SET_TYPES)[number]

export type SessionKind = 'GYM' | 'SWIM' | 'HYROX' | 'RUN' | 'OTHER'

/** Fila de Hevy ya validada y normalizada (una serie con los datos de su sesión). */
export interface HevyRow {
  line: number
  title: string
  startTime: IsoLocalDateTime
  endTime: IsoLocalDateTime | null
  description: string | null
  exerciseTitle: string
  supersetId: string | null
  exerciseNotes: string | null
  setIndex: number
  setType: HevySetType
  weightKg: number | null
  reps: number | null
  distanceKm: number | null
  durationSeconds: number | null
  rpe: number | null
}

/** Error de fila: nunca incluye el contenido de la celda. */
export interface RowError {
  line: number
  column: HevyColumn | null
  message: string
}

export interface HevySet {
  exerciseTitle: string
  exerciseOrder: number
  supersetId: string | null
  exerciseNotes: string | null
  setIndex: number
  setType: HevySetType
  weightKg: number | null
  reps: number | null
  distanceKm: number | null
  durationSeconds: number | null
  rpe: number | null
}

/** Sesión sin metadatos de agrupado: lo que necesita el formateo inverso. */
export interface HevySessionData {
  title: string
  startTime: IsoLocalDateTime
  endTime: IsoLocalDateTime | null
  description: string | null
  sets: HevySet[]
}

export interface HevySession extends HevySessionData {
  hevyKey: string
  /** Línea física de la primera fila de la sesión. */
  firstLine: number
  /** true si alguna fila de la sesión tiene error: no se debe importar. */
  hasErrors: boolean
  warnings: string[]
  signature: string
}

export interface KindRule {
  field: 'title' | 'exercise'
  contains: string
  kind: SessionKind
  priority: number
  active: boolean
}
