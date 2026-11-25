// Semanas del plan (de lunes a domingo, fijo: no depende de `weekStartsOn`) y proyección del boceto
// sobre una semana concreta. Funciones puras: las usan el servicio de planificación y las métricas.
import { addDays, isISODate, parts } from '../../dates'
import type { BaseWeekSlotFact, ISODate, PlannedSlotFact, Weekday } from './types'

/** Día de la semana de una fecha: 1 = lunes … 7 = domingo. */
export function weekdayOf(d: ISODate): Weekday {
  const p = parts(d)
  const js = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() // 0 = domingo
  return (js === 0 ? 7 : js) as Weekday
}

/** Lunes de la semana de una fecha. */
export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - weekdayOf(d))
}

export function isMonday(d: unknown): d is ISODate {
  return isISODate(d) && weekdayOf(d) === 1
}

/** Las 7 fechas de la semana que empieza en `weekStart` (lunes). */
export function weekDates(weekStart: ISODate): ISODate[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i))
}

/** Domingo de la semana que empieza en `weekStart`. */
export function weekEndOf(weekStart: ISODate): ISODate {
  return addDays(weekStart, 6)
}

/** Lunes desde `from` hasta `to` (ambos lunes, incluidos). */
export function mondaysBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) out.push(w)
  return out
}

/** El boceto (semana base) colocado sobre la semana que empieza en `weekStart`, por fecha y orden. */
export function projectBaseWeek(weekStart: ISODate, base: readonly BaseWeekSlotFact[]): PlannedSlotFact[] {
  return [...base]
    .sort((a, b) => a.weekday - b.weekday || a.order - b.order)
    .map((s) => ({ date: addDays(weekStart, s.weekday - 1), order: s.order, routineId: s.routineId, time: s.time, note: null }))
}
