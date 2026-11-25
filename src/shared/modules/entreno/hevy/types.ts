import type { IsoLocalDateTime } from './dates'
import {
  HEVY_VIEW_COLUMNS,
  SET_TYPES,
  type HevySetInput,
  type KindRule as StoredKindRule,
  type SetType,
  type WorkoutKind
} from '../types'

// Las constantes y tipos del esquema viven en ../types; aquí solo se reexportan con los nombres del parser.
export { SET_TYPES }

export const HEVY_COLUMNS = HEVY_VIEW_COLUMNS
export type HevyColumn = (typeof HEVY_COLUMNS)[number]

export type HevySetType = SetType

export type SessionKind = WorkoutKind

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

export type HevySet = HevySetInput

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

/** Regla de tipo de sesión (la de la base, con o sin `id`). */
export type KindRule = Omit<StoredKindRule, 'id'> & { id?: number }
