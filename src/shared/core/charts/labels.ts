// Rótulos en español de unidades, agrupaciones y claves de tiempo. Los usan los mensajes del
// validador, el motor (rótulos del eje x) y la interfaz.
import type { DimensionGrouping, Grouping, MetricAggregation, MetricUnit, TimeGrouping } from '../metrics-types'
import { TIME_GROUPINGS } from '../metrics-types'

export const UNIT_LABELS: Record<MetricUnit, string> = {
  eur_cents: 'euros',
  pct: '%',
  kg: 'kg',
  reps: 'repeticiones',
  sets: 'series',
  sessions: 'sesiones',
  days: 'días',
  min: 'min',
  kg_per_min: 'kg/min',
  rpe: 'RPE',
  sets_rpe: 'series × RPE',
  m: 'm',
  km: 'km'
}

export const GROUPING_LABELS: Record<Grouping, string> = {
  day: 'día',
  week: 'semana',
  month: 'mes',
  year: 'año',
  workout: 'sesión',
  exercise: 'ejercicio',
  muscleGroup: 'grupo muscular',
  kind: 'tipo de sesión',
  category: 'categoría',
  categoryGroup: 'grupo de categorías',
  account: 'cuenta'
}

export const AGGREGATION_LABELS: Record<MetricAggregation, string> = {
  sum: 'se suma',
  last: 'último valor del periodo',
  ratio: 'proporción (se recalcula)',
  max: 'máximo'
}

export function isTimeGrouping(g: Grouping): g is TimeGrouping {
  return (TIME_GROUPINGS as readonly string[]).includes(g)
}

export function isDimensionGrouping(g: Grouping): g is DimensionGrouping {
  return !isTimeGrouping(g)
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Rótulo corto de una clave de tiempo para el eje x: `25 nov`, `nov`, `2026`. Con `withYear`
 * (el rango cruza de año) se añade el año en dos cifras: `25 nov 26`, `nov 26`. Las semanas se
 * rotulan con su lunes.
 */
export function timeKeyLabel(key: string, g: TimeGrouping, withYear = false): string {
  if (g === 'year') return key
  const y = key.slice(2, 4)
  const m = MONTHS[Number(key.slice(5, 7)) - 1] ?? key
  if (g === 'month') return withYear ? `${m} ${y}` : m
  const d = String(Number(key.slice(8, 10)))
  return withYear ? `${d} ${m} ${y}` : `${d} ${m}`
}

/** Rótulo largo (para tooltips y tablas): `25/11/2026`, `Semana del 23/11/2026`, `noviembre 2026`, `2026`. */
export function timeKeyLongLabel(key: string, g: TimeGrouping): string {
  if (g === 'year') return key
  if (g === 'month') return `${MONTHS_LONG[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`
  const dmy = `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`
  return g === 'week' ? `Semana del ${dmy}` : dmy
}
