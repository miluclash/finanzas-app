// Rangos de fechas de los gráficos: relativos (con `now` como parámetro, nunca el reloj), periodo
// anterior y claves del eje de tiempo. Fechas locales como texto `YYYY-MM-DD`; semanas ISO (lunes).
//
// Periodo anterior (documentado también en `previousRangeFor`):
// - Rangos relativos por semanas, meses o años (`last` y `this`): son N periodos alineados, el
//   último cortado en `now`. El anterior son los N periodos completos justo antes, cortado el último
//   a la misma altura: se desplazan `from` y `to` N periodos hacia atrás. Así la duración en periodos
//   coincide (N), el anterior también queda alineado y cada posición se compara con la misma
//   (semana con semana, mes con mes). En semanas la duración en días es exactamente la misma; en
//   meses y años el corte se ajusta al último día del mes si ese día no existe (31 → 28/29/30), y
//   si `now` es el último día de su mes, el corte anterior también lo es (30/4 → 31/3, 28/2 → 31/1).
// - Métricas que solo se calculan por meses (sin días ni semanas): el motor alinea además el
//   anterior a meses completos (`build.ts`), porque esas métricas cuentan el mes entero.
// - Rangos por días y rangos con fechas fijas (`previousRange`): el tramo de igual duración en días
//   justo antes. Si el rango son meses completos (del día 1 al último día de un mes), el anterior
//   son los mismos meses completos justo antes (igual duración en meses).
import { addDays, addMonths, addMonthsToMonth, daysInMonth, diffDays, monthsBetween, parts } from '../../dates'
import type { ISODate } from '../../types'
import type { ChartRange, TimeGrouping } from '../metrics-types'

export interface DateRange {
  from: ISODate
  to: ISODate
}

export type PeriodUnit = TimeGrouping

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(d: ISODate): number {
  const p = parts(d)
  const w = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  return w === 0 ? 7 : w
}

/** Lunes de la semana de `d`. */
export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d))
}

/** Primer día del periodo que contiene `d`. */
export function periodStart(d: ISODate, unit: PeriodUnit): ISODate {
  switch (unit) {
    case 'day':
      return d
    case 'week':
      return mondayOf(d)
    case 'month':
      return `${d.slice(0, 7)}-01`
    case 'year':
      return `${d.slice(0, 4)}-01-01`
  }
}

/** Desplaza una fecha `n` periodos (en meses y años, si el día no existe se usa el último del mes). */
export function shiftPeriods(d: ISODate, unit: PeriodUnit, n: number): ISODate {
  switch (unit) {
    case 'day':
      return addDays(d, n)
    case 'week':
      return addDays(d, 7 * n)
    case 'month':
      return addMonths(d, n)
    case 'year':
      return addMonths(d, 12 * n)
  }
}

/**
 * Fechas de un rango del gráfico, ambas incluidas.
 * - `last week 12`: del lunes de hace 11 semanas a hoy. `last month 6`: del día 1 de hace 5 meses a
 *   hoy. `last day 30`: de hace 29 días a hoy. `last year 2`: del 1 de enero del año pasado a hoy.
 * - `this week|month|year`: del primer día del periodo actual a hoy (igual que `last … 1`).
 * - `absolute`: tal cual.
 */
export function resolveRange(range: ChartRange, now: ISODate): DateRange {
  if (range.kind === 'absolute') return { from: range.from, to: range.to }
  const count = range.kind === 'this' ? 1 : range.count
  return { from: shiftPeriods(periodStart(now, range.unit), range.unit, -(count - 1)), to: now }
}

const isMonthStart = (d: ISODate) => d.endsWith('-01')
const isMonthEnd = (d: ISODate) => parts(d).d === daysInMonth(parts(d).y, parts(d).m)

/**
 * Tramo de igual duración justo antes de `from`–`to`. Si el rango son meses completos, el anterior
 * son los mismos meses completos justo antes; si no, los mismos días justo antes.
 */
export function previousRange(from: ISODate, to: ISODate): DateRange {
  if (isMonthStart(from) && isMonthEnd(to)) {
    const months = monthsBetween(from.slice(0, 7), to.slice(0, 7)) + 1
    return { from: `${addMonthsToMonth(from.slice(0, 7), -months)}-01`, to: addDays(from, -1) }
  }
  const days = diffDays(to, from) + 1
  return { from: addDays(from, -days), to: addDays(from, -1) }
}

/**
 * Periodo anterior de un rango del gráfico (ver la cabecera del archivo): los relativos por semanas,
 * meses o años se desplazan N periodos hacia atrás (alineados, misma duración en periodos); los de
 * días y los de fechas fijas usan `previousRange`.
 */
export function previousRangeFor(range: ChartRange, now: ISODate): DateRange {
  const r = resolveRange(range, now)
  if (range.kind === 'absolute' || range.unit === 'day') return previousRange(r.from, r.to)
  const n = range.kind === 'this' ? 1 : range.count
  const to = shiftPeriods(r.to, range.unit, -n)
  // Si el corte es el último día de su mes, el anterior también (30/4 → 31/3, 29/2 → 31/1).
  const finDeMes = (range.unit === 'month' || range.unit === 'year') && isMonthEnd(r.to)
  return { from: shiftPeriods(r.from, range.unit, -n), to: finDeMes ? monthEndOf(to) : to }
}

/** Último día del mes de `d`. */
export function monthEndOf(d: ISODate): ISODate {
  const p = parts(d)
  return `${d.slice(0, 7)}-${String(daysInMonth(p.y, p.m)).padStart(2, '0')}`
}

/** Primer día del mes de `d`. */
export function monthStartOf(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`
}

/** Clave de tiempo de una fecha: el día, el lunes de su semana, `YYYY-MM` o `YYYY`. */
export function timeKeyOf(d: ISODate, g: TimeGrouping): string {
  switch (g) {
    case 'day':
      return d
    case 'week':
      return mondayOf(d)
    case 'month':
      return d.slice(0, 7)
    case 'year':
      return d.slice(0, 4)
  }
}

/** Todas las claves de tiempo de un rango, en orden (también las que no tengan datos). */
export function timeKeys(from: ISODate, to: ISODate, g: TimeGrouping): string[] {
  if (from > to) return []
  const out: string[] = []
  if (g === 'year') {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(String(y).padStart(4, '0'))
    return out
  }
  if (g === 'month') {
    const last = to.slice(0, 7)
    for (let m = from.slice(0, 7); m <= last; m = addMonthsToMonth(m, 1)) out.push(m)
    return out
  }
  const step = g === 'week' ? 7 : 1
  const end = timeKeyOf(to, g)
  for (let d = timeKeyOf(from, g); d <= end; d = addDays(d, step)) out.push(d)
  return out
}
