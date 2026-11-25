// Formato y etiquetas de Entreno en la interfaz: kg con coma decimal, duraciones legibles, distancias en
// km o m según el tamaño y los nombres en español de cada tipo. Solo presentación: no calcula nada.
import { addDays, diffDays, formatDate } from '@shared/dates'
import { RECORD_NAMES, type RecordType } from '@shared/modules/entreno/metrics/records'
import type { ExerciseCategory, GoalStatus, GoalType, HyroxStation, LocalDateTime, MeasureType, SetType, WorkoutKind } from '@shared/modules/entreno/types'

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

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  E1RM: 'E1RM de un ejercicio',
  WEIGHT_REPS: 'Peso × repeticiones',
  WEEKLY_VOLUME: 'Volumen semanal',
  FREQUENCY: 'Frecuencia semanal',
  EVENT: 'Evento'
}
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { ACTIVE: 'Activo', ACHIEVED: 'Conseguido', ABANDONED: 'Abandonado' }

/** Estaciones de HYROX: la clave es el nombre oficial (en inglés); el valor, una ayuda en español. */
export const HYROX_STATION_LABEL: Record<HyroxStation, string> = {
  SkiErg: 'Esquí ergómetro',
  'Sled Push': 'Empuje de trineo',
  'Sled Pull': 'Arrastre de trineo',
  'Burpee Broad Jumps': 'Burpees con salto largo',
  Rowing: 'Remo ergómetro',
  'Farmers Carry': 'Paseo del granjero',
  'Sandbag Lunges': 'Zancadas con saco',
  'Wall Balls': 'Lanzamientos a la pared'
}

/** Días de la semana, de lunes (índice 0) a domingo. */
export const WEEKDAY_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' })
const num1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' })

const int = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })
/** 12345.6 -> «12.346» */
export const formatEntero = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : int.format(Math.round(n)))
/** Con un decimal como máximo: 104.12 -> «104,1» */
export const formatNum1 = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : num1.format(n))
/** 0.923 -> «92 %» */
export const formatPorcentaje = (x: number | null | undefined): string => (x === null || x === undefined ? '—' : `${int.format(Math.round(x * 100))} %`)
/** 0.059 -> «+5,9 %»; -0.1 -> «−10 %» (signo explícito) */
export const formatCambio = (x: number): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${num1.format(Math.abs(x * 100))} %`

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

/** `2026-11-23` -> `23 nov` */
export const fechaCorta = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
/** Lunes y domingo de una semana -> `23 nov – 29 nov 2026` */
export const rangoSemana = (lunes: string, domingo: string): string => `${fechaCorta(lunes)} – ${fechaCorta(domingo)} ${domingo.slice(0, 4)}`

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dia = (d: string) => Number(d.slice(8))
const mes = (d: string) => MESES_LARGOS[Number(d.slice(5, 7)) - 1]
/** «del 23 al 29 de noviembre de 2026»; si cambia el mes o el año, lo dice en cada extremo. */
export function rangoLargo(from: string, to: string): string {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `del ${dia(from)} de ${mes(from)} de ${from.slice(0, 4)} al ${dia(to)} de ${mes(to)} de ${to.slice(0, 4)}`
  if (from.slice(5, 7) !== to.slice(5, 7)) return `del ${dia(from)} de ${mes(from)} al ${dia(to)} de ${mes(to)} de ${to.slice(0, 4)}`
  return `del ${dia(from)} al ${dia(to)} de ${mes(to)} de ${to.slice(0, 4)}`
}
/** «noviembre de 2026» */
export const mesLargo = (d: string): string => `${mes(d)} de ${d.slice(0, 4)}`
/** «jueves» */
export const diaSemanaLargo = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long' })
/** «Hoy, 19:00», «Mañana» o «Jueves 26 nov, 07:00» */
export function cuando(date: string, hoy: string, hora?: string | null): string {
  const n = diffDays(date, hoy)
  const base = n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `${diaSemanaLargo(date).replace(/^./, (c) => c.toUpperCase())} ${fechaCorta(date)}`
  return hora ? `${base}, ${hora}` : base
}
/** Lunes de la semana siguiente o anterior, por si hace falta navegar. */
export const semanaMas = (lunes: string, n: number): string => addDays(lunes, 7 * n)

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
/** «frente a los mismos días de la semana pasada (lun–mié: 1.500 kg)» o «frente a la semana anterior (13.500 kg)» */
export function textoComparacionVolumen(comparison: 'same-days' | 'full-week', previousLoadKg: number, previousToDate: string): string {
  if (comparison === 'full-week') return `frente a la semana anterior (${formatEntero(previousLoadKg)} kg)`
  const hasta = DIA_CORTO[new Date(`${previousToDate}T12:00:00`).getDay()]
  const rango = hasta === 'lun' ? 'lun' : `lun–${hasta}`
  return `frente a los mismos días de la semana pasada (${rango}: ${formatEntero(previousLoadKg)} kg)`
}
/** Aviso cuando no hay % porque la referencia no tiene volumen */
export const sinVolumenPrevio = (comparison: 'same-days' | 'full-week'): string =>
  comparison === 'same-days' ? 'sin volumen en los mismos días de la semana pasada' : 'sin volumen en la semana anterior'

/** Marca de un récord: «85 kg», «12 repeticiones con 60 kg». */
export function marcaRecord(tipo: RecordType, valor: number, pesoKg: number | null): string {
  if (tipo === 'reps-con-peso') return `${num.format(valor)} reps con ${formatKg(pesoKg)}`
  if (tipo === 'reps-peso-corporal') return `${num.format(valor)} reps`
  if (tipo === 'mejor-e1rm') return `${num1.format(valor)} kg`
  if (tipo === 'volumen-sesion') return `${int.format(valor)} kg`
  return formatKg(valor)
}
/** «antes 80 kg» / «antes 10 reps» */
export function anteriorRecord(tipo: RecordType, previo: number): string {
  return `antes ${tipo === 'reps-con-peso' || tipo === 'reps-peso-corporal' ? `${num.format(previo)} reps` : marcaRecord(tipo, previo, null)}`
}
export const nombreRecord = (tipo: RecordType): string => RECORD_NAMES[tipo]

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
