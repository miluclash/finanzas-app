// Formato de las cifras de un gráfico según su unidad (formato español: puntos de miles, coma
// decimal y espacio fino antes de la unidad). Solo presentación: las cifras llegan ya calculadas.
import type { ChartRange, Grouping, MetricAggregation, MetricUnit } from '@shared/core/metrics-types'
import { GROUPING_LABELS, UNIT_LABELS } from '@shared/core/charts/labels'
import type { DateRange } from '@shared/core/charts/range'
import { formatEur, formatPct } from '@shared/money'
import { formatDate } from '@shared/dates'

const ESP = ' '

const num = (max: number, min = 0) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' } as Intl.NumberFormatOptions)
const N0 = num(0)
const N1 = num(1)
const N2 = num(2)
const COMPACTO = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 })

/** Sufijo de cada unidad (lo que va detrás de la cifra). */
const SUFIJO: Record<MetricUnit, string> = {
  eur_cents: '€',
  pct: '%',
  kg: 'kg',
  reps: 'rep.',
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

/** Decimales que tienen sentido en cada unidad. */
const DECIMALES: Record<MetricUnit, Intl.NumberFormat> = {
  eur_cents: N2,
  pct: N1,
  kg: N1,
  reps: N0,
  sets: N1,
  sessions: N0,
  days: N0,
  min: N0,
  kg_per_min: N1,
  rpe: N1,
  sets_rpe: N0,
  m: N0,
  km: N2
}

/** Cifra completa con su unidad (tooltip, tabla, totales): «1.234,50 €», «12,5 %», «87,5 kg». */
export function formatoValor(unit: MetricUnit, v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (unit === 'eur_cents') return formatEur(v)
  if (unit === 'pct') return formatPct(v)
  if (unit === 'rpe') return `RPE${ESP}${N1.format(v)}`
  return `${DECIMALES[unit].format(v)}${ESP}${SUFIJO[unit]}`
}

/** Cifra corta para el eje: «12 mil €», «25 %», «1,2 mil kg». */
export function formatoEje(unit: MetricUnit, v: number): string {
  if (!Number.isFinite(v)) return ''
  if (unit === 'eur_cents') return `${COMPACTO.format(v / 100)}${ESP}€`
  if (unit === 'pct') return `${N0.format(v * 100)}${ESP}%`
  if (unit === 'rpe') return N1.format(v)
  return Math.abs(v) >= 10000 ? COMPACTO.format(v) : DECIMALES[unit].format(v)
}

/** Texto de la unidad para el pie del gráfico: «euros», «kg», «% (proporción)». */
export function textoUnidad(unit: MetricUnit): string {
  return unit === 'pct' ? 'porcentaje' : UNIT_LABELS[unit]
}

/** «Del 07/09/2026 al 25/11/2026 · por semana». */
export function textoPeriodo(r: DateRange, groupBy: Grouping): string {
  return `Del ${formatDate(r.from)} al ${formatDate(r.to)} · por ${GROUPING_LABELS[groupBy]}`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesDe = (d: string) => MESES[Number(d.slice(5, 7)) - 1]

/**
 * Periodo anterior para el pie del gráfico, para ir tras «comparado con»: «el periodo del 15/06/2026 al
 * 03/09/2026» o, si son meses completos, «octubre de 2026 completo» / «junio a octubre de 2026 (meses completos)».
 */
export function textoAnterior(r: DateRange, mesesCompletos: boolean): string {
  if (!mesesCompletos) return `el periodo del ${formatDate(r.from)} al ${formatDate(r.to)}`
  const [a1, a2] = [r.from.slice(0, 4), r.to.slice(0, 4)]
  if (r.from.slice(0, 7) === r.to.slice(0, 7)) return `${mesDe(r.from)} de ${a1} completo`
  return a1 === a2 ? `${mesDe(r.from)} a ${mesDe(r.to)} de ${a2} (meses completos)` : `${mesDe(r.from)} de ${a1} a ${mesDe(r.to)} de ${a2} (meses completos)`
}

const UNIDAD_RANGO = { day: ['día', 'días'], week: ['semana', 'semanas'], month: ['mes', 'meses'], year: ['año', 'años'] } as const

/** Descripción de un rango: «Últimas 12 semanas», «Este año», «Del 01/01/2026 al 31/03/2026». */
export function textoRango(r: ChartRange): string {
  if (r.kind === 'absolute') return `Del ${formatDate(r.from)} al ${formatDate(r.to)}`
  if (r.kind === 'this') return r.unit === 'week' ? 'Esta semana' : r.unit === 'month' ? 'Este mes' : 'Este año'
  const [uno, varios] = UNIDAD_RANGO[r.unit]
  const fem = r.unit === 'week'
  return r.count === 1 ? `${fem ? 'Última' : 'Último'} ${uno}` : `${fem ? 'Últimas' : 'Últimos'} ${r.count} ${varios}`
}

/** Cómo se rotula el total de una serie según su agregación. */
export const NOMBRE_TOTAL: Record<MetricAggregation, string> = {
  sum: 'Total',
  last: 'Último valor',
  max: 'Máximo',
  ratio: 'En todo el periodo'
}

/** Cambio relativo entre dos totales, como texto («+12,3 %»); null si no tiene sentido. */
export function textoCambio(actual: number | null, anterior: number | null): string | null {
  if (actual === null || anterior === null || anterior === 0) return null
  const r = (actual - anterior) / Math.abs(anterior)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${formatPct(Math.abs(r))}`
}
