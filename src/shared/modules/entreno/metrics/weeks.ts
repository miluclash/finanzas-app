// Semanas, días y duraciones con fechas locales como texto. Todo es aritmética de días en UTC
// (`Date.UTC`), nunca `Date` con la hora local del sistema: ni la zona ni el cambio de hora
// mueven una sesión de día o de semana.
import { addDays, diffDays } from '../../../dates'
import type { ISODate, LocalDateTime } from './types'

export { addDays, diffDays }

/** Fecha (día local) de un `YYYY-MM-DDTHH:mm` o de un `YYYY-MM-DD`. */
export function dateOf(dt: LocalDateTime | ISODate): ISODate {
  return dt.slice(0, 10)
}

/** 1 = lunes … 7 = domingo. */
export function isoWeekday(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  return js === 0 ? 7 : js
}

/** Primer día de la semana que contiene `date`. `weekStartsOn`: 1 = lunes … 7 = domingo. */
export function weekStartOf(date: LocalDateTime | ISODate, weekStartsOn = 1): ISODate {
  const day = dateOf(date)
  const back = (isoWeekday(day) - weekStartsOn + 7) % 7
  return addDays(day, -back)
}

/** Último día (incluido) de la semana que empieza en `weekStart`. */
export function weekEndOf(weekStart: ISODate): ISODate {
  return addDays(weekStart, 6)
}

/**
 * Clave de semana = fecha de su primer día ('YYYY-MM-DD'). Es ordenable como texto y no depende
 * del inicio de semana para leerse. Una sesión cuenta en la semana (y el día) en que empieza,
 * aunque termine pasada la medianoche.
 */
export function weekKeyOf(date: LocalDateTime | ISODate, weekStartsOn = 1): ISODate {
  return weekStartOf(date, weekStartsOn)
}

/** Clave de mes 'YYYY-MM'. */
export function monthKeyOf(date: LocalDateTime | ISODate): string {
  return date.slice(0, 7)
}

/** Número de semana ISO 8601 (para rótulos) de una fecha. */
export function isoWeekNumber(date: ISODate): { year: number; week: number } {
  // El jueves de la semana ISO decide el año.
  const thursday = addDays(date, 4 - isoWeekday(date))
  const year = Number(thursday.slice(0, 4))
  const week = Math.floor(diffDays(thursday, `${year}-01-01`) / 7) + 1
  return { year, week }
}

/**
 * Rótulo de una semana: número ISO de su primer día. Si la semana empieza en lunes coincide con la
 * semana ISO; con otro inicio es la semana ISO del primer día (lo más simple y estable).
 */
export function weekLabelNumber(weekStart: ISODate): number {
  return isoWeekNumber(weekStart).week
}

/** Claves de semana desde la de `from` hasta la de `to` (incluidas), en orden. */
export function weekKeysBetween(from: ISODate, to: ISODate, weekStartsOn = 1): ISODate[] {
  const out: ISODate[] = []
  const last = weekStartOf(to, weekStartsOn)
  for (let w = weekStartOf(from, weekStartsOn); w <= last; w = addDays(w, 7)) out.push(w)
  return out
}

/** Las `n` últimas claves de semana terminando en la de `today` (incluida), de la más antigua a la actual. */
export function lastWeekKeys(today: ISODate, n: number, weekStartsOn = 1): ISODate[] {
  const current = weekStartOf(today, weekStartsOn)
  const out: ISODate[] = []
  for (let i = n - 1; i >= 0; i--) out.push(addDays(current, -7 * i))
  return out
}

/** Minutos desde el 1/1/1970 de un ISO local, como si fuera UTC (reloj de pared). */
function wallMinutes(dt: LocalDateTime): number {
  return (
    Date.UTC(+dt.slice(0, 4), +dt.slice(5, 7) - 1, +dt.slice(8, 10), +dt.slice(11, 13) || 0, +dt.slice(14, 16) || 0) / 60000
  )
}

/**
 * Duración en minutos entre dos horas locales, por reloj de pared (`fin − inicio` tal como están
 * escritas). Cruzar la medianoche funciona. En la noche del cambio de hora se cuenta la diferencia
 * de reloj (01:30→03:30 son 120 min) porque las horas de Hevy no llevan zona; es la opción más
 * simple y no depende del sistema. null si falta el fin o si el fin es anterior al inicio.
 */
export function minutesBetween(start: LocalDateTime, end: LocalDateTime | null): number | null {
  if (!end) return null
  const m = wallMinutes(end) - wallMinutes(start)
  return m < 0 ? null : m
}

/** ¿`date` cae entre `from` y `to` (ambos incluidos; null = sin límite)? */
export function inRange(date: ISODate, from: ISODate | null | undefined, to: ISODate | null | undefined): boolean {
  return (!from || date >= from) && (!to || date <= to)
}
