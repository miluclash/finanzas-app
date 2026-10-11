// Fechas como texto ISO 'YYYY-MM-DD' (sin horas ni zonas horarias) para evitar desfases.
import type { ISODate, MonthKey } from './types'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false
  const m = ISO_RE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= daysInMonth(y, mo)
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

export function parts(d: ISODate): { y: number; m: number; d: number } {
  const [y, m, dd] = d.split('-').map(Number)
  return { y, m, d: dd }
}

export function makeDate(y: number, m1: number, d: number): ISODate {
  // normaliza desbordes de mes
  const dt = new Date(Date.UTC(y, m1 - 1, d))
  return dt.toISOString().slice(0, 10)
}

/** Fecha local de hoy (no UTC). */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7)
}

export function monthStart(m: MonthKey): ISODate {
  return `${m}-01`
}

export function monthEnd(m: MonthKey): ISODate {
  const [y, mo] = m.split('-').map(Number)
  return `${m}-${String(daysInMonth(y, mo)).padStart(2, '0')}`
}

export function addMonthsToMonth(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number)
  const total = y * 12 + (mo - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Suma meses a una fecha; si el día no existe en el mes destino, usa el último día. */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const { y, m, d: day } = parts(d)
  const target = addMonthsToMonth(`${y}-${String(m).padStart(2, '0')}`, n)
  const [ty, tm] = target.split('-').map(Number)
  const dd = Math.min(anchorDay ?? day, daysInMonth(ty, tm))
  return `${target}-${String(dd).padStart(2, '0')}`
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, d: day } = parts(d)
  return makeDate(y, m, day + n)
}

export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parts(a)
  const pb = parts(b)
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000)
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA' */
export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return '—'
  const { y, m, d: day } = parts(d)
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_ES_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]

/** 'YYYY-MM' -> 'oct 2026' */
export function formatMonth(m: MonthKey, long = false): string {
  const [y, mo] = m.split('-').map(Number)
  return `${(long ? MONTHS_ES_LONG : MONTHS_ES)[mo - 1]} ${y}`
}

/** Acepta 'DD/MM/AAAA' o ISO y devuelve ISO o null. */
export function parseUserDate(s: string): ISODate | null {
  const t = s.trim()
  if (isISODate(t)) return t
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (!m) return null
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isISODate(iso) ? iso : null
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b
}
