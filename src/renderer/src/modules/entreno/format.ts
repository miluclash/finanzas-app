// Formato y etiquetas de Entreno en la interfaz: kg con coma decimal, duraciones legibles, distancias en
// km o m según el tamaño y los nombres en español de cada tipo. Solo presentación: no calcula nada.
import { formatDate } from '@shared/dates'
import type { ExerciseCategory, LocalDateTime, MeasureType, SetType, WorkoutKind } from '@shared/modules/entreno/types'

export const KIND_LABEL: Record<WorkoutKind, string> = {
  GYM: 'Gimnasio',
  SWIM: 'Natación',
  HYROX: 'HYROX',
  RUN: 'Carrera',
  OTHER: 'Otro'
}

export const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: 'Normal',
  warmup: 'Calentamiento',
  dropset: 'Drop set',
  failure: 'Al fallo'
}

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  STRENGTH: 'Fuerza',
  SWIM: 'Natación',
  HYROX: 'HYROX',
  CARDIO: 'Cardio',
  MOBILITY: 'Movilidad'
}
export const SIN_CLASIFICAR = 'Sin clasificar'

export const MEASURE_LABEL: Record<MeasureType, string> = {
  WEIGHT_REPS: 'Peso y repeticiones',
  REPS: 'Solo repeticiones',
  DURATION: 'Duración',
  WEIGHT_DURATION: 'Peso y duración',
  DISTANCE_DURATION: 'Distancia y duración',
  WEIGHT_DISTANCE: 'Peso y distancia'
}

const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const num1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

/** 82.5 -> «82,5 kg» */
export const formatKg = (kg: number | null | undefined): string => (kg === null || kg === undefined ? '—' : `${num.format(kg)} kg`)

/** Número con coma decimal y sin ceros de más (para repeticiones, RPE, contadores). */
export const formatNum = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : num.format(n))

/** Duración de una sesión: «45 min», «1 h 05 min». */
export function formatDuracion(seg: number | null | undefined): string {
  if (seg === null || seg === undefined) return '—'
  if (seg < 60) return `${seg} s`
  const min = Math.round(seg / 60)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/** Duración de una serie: «2:30», «1:02:30». */
export function formatTiempo(seg: number | null | undefined): string {
  if (seg === null || seg === undefined) return '—'
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = Math.round(seg % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** Menos de 1 km en metros («400 m»); desde 1 km en kilómetros («5,2 km»). */
export function formatDistancia(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—'
  if (km < 1) return `${num.format(Math.round(km * 1000))} m`
  return `${num1.format(km)} km`
}

/** `2026-11-05T07:05` -> `05/11/2026` */
export const fechaDe = (t: LocalDateTime): string => formatDate(t.slice(0, 10))
/** `2026-11-05T07:05` -> `07:05` */
export const horaDe = (t: LocalDateTime): string => t.slice(11, 16)
export const fechaHora = (t: LocalDateTime): string => `${fechaDe(t)} · ${horaDe(t)}`

/** Sin mayúsculas ni tildes, para buscar. */
export const normalizar = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

// ---------- Lectura de lo que se escribe en los formularios ----------
// Los campos opcionales vacíos dan null; lo que no se entiende da NaN (el formulario lo marca).

/** «82,5» o «82.5» -> 82.5 */
export function leerNumero(t: string): number | null {
  const s = t.trim().replace(',', '.')
  if (s === '') return null
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

export function leerEntero(t: string): number | null {
  const s = t.trim()
  if (s === '') return null
  return /^\d+$/.test(s) ? Number(s) : NaN
}

/** «2:30», «1:02:30» o segundos sueltos («90») -> segundos. */
export function leerTiempo(t: string): number | null {
  const s = t.trim()
  if (s === '') return null
  const m = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(s)
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return /^\d+$/.test(s) ? Number(s) : NaN
}

/** «400», «400 m» -> 0.4 km; «5,2 km» -> 5.2 km. Sin unidad se entiende metros. */
export function leerDistanciaKm(t: string): number | null {
  const s = t.trim().toLowerCase()
  if (s === '') return null
  const m = /^(\d+(?:[.,]\d+)?)\s*(km|m)?$/.exec(s)
  if (!m) return NaN
  const v = Number(m[1].replace(',', '.'))
  return Math.round((m[2] === 'km' ? v : v / 1000) * 1e6) / 1e6
}

export const textoNumero = (n: number | null | undefined): string => (n === null || n === undefined ? '' : num.format(n).replace(/\./g, ''))
export const textoTiempo = (seg: number | null | undefined): string => (seg === null || seg === undefined ? '' : formatTiempo(seg))
export const textoDistancia = (km: number | null | undefined): string =>
  km === null || km === undefined ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${num.format(km)} km`

const ZONA = 'Europe/Madrid'
/** Marca de tiempo UTC (por ejemplo la de una importación) -> `20/11/2026, 18:30` en hora de Madrid. */
export const fechaHoraLocal = (iso: string): string =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ZONA })
export const fechaLocal = (iso: string): string => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA })
