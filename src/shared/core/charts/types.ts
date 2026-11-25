// Lo que el motor de gráficos entrega a la interfaz (`core:charts.data`). La interfaz solo dibuja:
// todos los cálculos (eje, series, periodo anterior, totales, dispersión y tabla) ya vienen hechos.
import type { ISODate } from '../../types'
import type { ChartType, ChartValidationIssue, DimensionGrouping, Grouping, MetricAggregation, MetricUnit } from '../metrics-types'
import type { DateRange } from './range'

/**
 * Una serie dibujable. `id` es la clave del valor en `ChartDataPoint.values` (y el `dataKey` de
 * Recharts): `s0`, `s1`… para cada serie del gráfico; `s0_3` para el valor número 3 de la división;
 * `p0`, `p0_3` para las del periodo anterior. Sin puntos ni caracteres raros.
 */
export interface ChartDataSeries {
  id: string
  label: string
  /** Índice de la serie en la especificación. */
  seriesIndex: number
  metricId: string
  aggregation: MetricAggregation
  /** Valor de `splitBy` de esta serie; null en la serie "Otros"; ausente si no hay división. */
  split?: string | null
  /** Serie del periodo anterior. */
  previous: boolean
  /** En las del periodo anterior: id de la serie actual con la que se compara. */
  of?: string
  /** Grupo de apilado: las actuales con las actuales y las anteriores con las anteriores. */
  stackId: 'actual' | 'anterior'
  /** Total de la serie en su rango, con su agregación (null si no hay datos). */
  total: number | null
}

/** Un punto del eje x con el valor de cada serie. */
export interface ChartDataPoint {
  /** Clave de la agrupación: fecha del día, lunes de la semana, `YYYY-MM`, `YYYY` o id de la dimensión. */
  key: string
  /** Rótulo corto para el eje (`23 nov`, `nov 26`, `Pecho`). */
  label: string
  /** Rótulo largo para el tooltip y la tabla (`Semana del 23/11/2026`). */
  longLabel: string
  /**
   * Clave y rótulos del punto del periodo anterior que se compara con este (en ejes de tiempo, el
   * de la misma posición; en dimensiones, la misma clave). null si no hay periodo anterior o si el
   * anterior tiene menos puntos.
   */
  prevKey: string | null
  prevLabel: string | null
  prevLongLabel: string | null
  /** Valor de cada serie por su `id`. null = sin dato (en métricas `sum`, sin dato es 0). */
  values: Record<string, number | null>
}

export interface ChartScatterPoint {
  key: string
  label: string
  longLabel: string
  x: number
  y: number
}

export interface ChartScatter {
  /** Serie del eje x (la primera) y del eje y (la segunda). */
  x: ChartDataSeries
  y: ChartDataSeries
  /** Solo las claves con dato en las dos series. */
  points: ChartScatterPoint[]
}

export interface ChartTable {
  columns: { id: string; label: string }[]
  rows: { key: string; label: string; cells: (number | null)[] }[]
  /** Total de cada columna con su agregación. */
  totals: (number | null)[]
}

export interface ChartData {
  type: ChartType
  /** Unidad común de todas las series. */
  unit: MetricUnit
  groupBy: Grouping
  splitBy: DimensionGrouping | null
  axis: 'time' | 'dimension'
  /** Fechas resueltas del rango (con `now`). */
  range: DateRange
  /** Fechas del periodo anterior, si se compara. */
  previous: DateRange | null
  /** Fecha con la que se resolvió el rango. */
  now: ISODate
  series: ChartDataSeries[]
  points: ChartDataPoint[]
  /** Línea de objetivo (en la unidad de las series). */
  target: number | null
  /** Solo en gráficos de dispersión. */
  scatter: ChartScatter | null
  /** Las mismas cifras en forma de tabla (para el tipo tabla y para accesibilidad). */
  table: ChartTable
  /** Avisos para mostrar bajo el gráfico (p. ej. valores de la división agrupados en "Otros"). */
  notes: string[]
  /** No hay ningún dato en el rango. */
  empty: boolean
}

/** Respuesta de `core:charts.data`: los datos, o los avisos si la especificación no es válida. */
export type ChartDataResult = { ok: true; data: ChartData } | { ok: false; issues: ChartValidationIssue[] }
