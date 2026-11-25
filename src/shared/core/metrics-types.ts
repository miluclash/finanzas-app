// Tipos compartidos del constructor de gráficos y de los paneles editables (F5).
// Es el contrato entre el núcleo, los módulos y la interfaz: métricas, consultas, especificación de
// gráfico (versión 1) y paneles. Solo tipos y constantes: la validación (Zod y las cuatro reglas) y el
// motor viven en `src/shared/core/charts/`, y el registro en el proceso principal.
import type { ISODate } from '../types'

// ---------------------------------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------------------------------

/** Agrupaciones por tiempo. Las semanas van de lunes a domingo (clave = fecha del lunes). */
export const TIME_GROUPINGS = ['day', 'week', 'month', 'year'] as const
export type TimeGrouping = (typeof TIME_GROUPINGS)[number]

/** Agrupaciones por dimensión. Cada módulo declara cuáles admite cada métrica. */
export const DIMENSION_GROUPINGS = ['workout', 'exercise', 'muscleGroup', 'kind', 'category', 'categoryGroup', 'account'] as const
export type DimensionGrouping = (typeof DIMENSION_GROUPINGS)[number]

export type Grouping = TimeGrouping | DimensionGrouping

/**
 * Cómo se combinan los valores de una métrica al juntar periodos o series (totales, apilado y
 * comparación con el periodo anterior):
 * - `sum`: flujos (gastos, ingresos, volumen). Se suman.
 * - `last`: saldos (patrimonio, liquidez, saldo por cuenta, valor de inversiones). Último valor del periodo.
 * - `ratio`: tasas (tasa de ahorro, adherencia). Se recalculan con Σ numerador / Σ denominador; nunca se promedian.
 * - `max`: mejores marcas (e1RM, peso máximo). El máximo.
 */
export const METRIC_AGGREGATIONS = ['sum', 'last', 'ratio', 'max'] as const
export type MetricAggregation = (typeof METRIC_AGGREGATIONS)[number]

/**
 * Unidades canónicas. Dos series solo pueden ir en el mismo gráfico si tienen la misma unidad.
 * `eur_cents`: dinero en céntimos enteros. `pct`: proporción entre 0 y 1 (0,25 = 25 %).
 */
export const METRIC_UNITS = [
  'eur_cents',
  'pct',
  'kg',
  'reps',
  'sets',
  'sessions',
  'days',
  'min',
  'kg_per_min',
  'rpe',
  'sets_rpe',
  'm',
  'km'
] as const
export type MetricUnit = (typeof METRIC_UNITS)[number]

/** Filtros que puede admitir una métrica (cada una declara los suyos). El rango de fechas va aparte. */
export const METRIC_FILTER_KEYS = ['exerciseId', 'groupId', 'kind', 'accountId', 'categoryId', 'categoryGroup'] as const
export type MetricFilterKey = (typeof METRIC_FILTER_KEYS)[number]

export type MetricFilterValue = string | number
export type MetricFilters = Partial<Record<MetricFilterKey, MetricFilterValue>>

/** Consulta a una métrica. `from` y `to` incluidos, en fechas locales (hora de Madrid). */
export interface MetricQuery {
  from: ISODate
  to: ISODate
  groupBy: Grouping
  /** Segunda agrupación por dimensión, para barras apiladas (una serie por valor de la dimensión). */
  splitBy?: DimensionGrouping
  filters?: MetricFilters
}

/**
 * Un punto de la serie. `key` es la clave de la agrupación (fecha del lunes, `YYYY-MM`, `YYYY`, `YYYY-MM-DD`
 * o el id de la dimensión). `split` es el valor de `splitBy` si se pidió. En métricas `ratio`, `num` y `den`
 * son obligatorios y `value = num / den` (o 0 si `den` es 0); el motor recalcula con ellos.
 */
export interface MetricBucket {
  key: string
  split?: string
  value: number
  num?: number
  den?: number
  /** Rótulo legible de `key` cuando es una dimensión (p. ej. nombre del ejercicio o de la categoría). */
  label?: string
  /** Rótulo legible de `split`. */
  splitLabel?: string
}

/** Lo que el núcleo publica de cada métrica (sin la función de cálculo): viaja a la interfaz. */
export interface MetricMeta {
  /** Único en toda la app; se recomienda `<módulo>.<id>` (p. ej. `entreno.e1rm`, `finanzas.gastos`). */
  id: string
  /** Módulo dueño (`finanzas`, `entreno`…): quien resuelve `compute`. */
  module: string
  name: string
  description?: string
  unit: MetricUnit
  aggregation: MetricAggregation
  /** Agrupaciones admitidas (tiempo y dimensión). */
  groupings: readonly Grouping[]
  /** Dimensiones admitidas como `splitBy`. Vacío si no se puede apilar por dimensión. */
  splits: readonly DimensionGrouping[]
  /** Filtros admitidos. */
  filters: readonly MetricFilterKey[]
}

/**
 * Métrica completa, en el proceso principal. `C` es el contexto que recibe `compute` (en el núcleo,
 * `CoreContext`). `compute` es síncrona y solo lee. Devuelve solo claves con datos, ordenadas por `key`.
 */
export interface MetricDef<C = unknown> extends MetricMeta {
  compute(ctx: C, q: MetricQuery): MetricBucket[]
}

/** Listas para rellenar los filtros del constructor. Las da el módulo que las conoce. */
export const METRIC_OPTION_KINDS = ['exercise', 'muscleGroup', 'kind', 'account', 'category', 'categoryGroup'] as const
export type MetricOptionKind = (typeof METRIC_OPTION_KINDS)[number]

export interface MetricOption {
  value: MetricFilterValue
  label: string
  /** Para agrupar en el desplegable (p. ej. el grupo de una categoría). */
  group?: string
  inactive?: boolean
}

// ---------------------------------------------------------------------------------------------------
// Gráficos (especificación versión 1)
// ---------------------------------------------------------------------------------------------------

export const CHART_TYPES = ['line', 'bar', 'area', 'stacked', 'scatter', 'table'] as const
export type ChartType = (typeof CHART_TYPES)[number]

/**
 * Rango del gráfico.
 * - `last`: los últimos `count` periodos de `unit`, incluido el actual (p. ej. últimas 12 semanas).
 * - `this`: el periodo actual completo hasta hoy (esta semana, este mes, este año).
 * - `absolute`: fechas fijas, ambas incluidas.
 * Los relativos se resuelven con `now` (fecha local de Madrid) y semanas ISO (lunes).
 */
export type ChartRange =
  | { kind: 'last'; unit: 'day' | 'week' | 'month' | 'year'; count: number }
  | { kind: 'this'; unit: 'week' | 'month' | 'year' }
  | { kind: 'absolute'; from: ISODate; to: ISODate }

export interface ChartSeries {
  metricId: string
  filters?: MetricFilters
  /** Rótulo propio de la serie (si no, el nombre de la métrica y sus filtros). */
  label?: string
}

export const CHART_MAX_SERIES = 6

/**
 * Especificación guardada en `core_charts.spec`. Reglas (las aplica el motor al guardar y al cargar):
 * 1. Todas las series usan `groupBy` y cada métrica lo admite.
 * 2. Todas las series tienen la misma unidad.
 * 3. `splitBy` solo con una serie (y la métrica lo admite).
 * 4. `stacked` solo con métricas de agregación `sum`.
 * Además: entre 1 y 6 series; `scatter` exige exactamente dos.
 */
export interface ChartSpecV1 {
  version: 1
  type: ChartType
  series: ChartSeries[]
  groupBy: Grouping
  splitBy?: DimensionGrouping
  range: ChartRange
  /** Añade cada serie del tramo de igual duración justo antes del rango. */
  comparePrevious?: boolean
  /** Línea de objetivo con un valor fijo, en la unidad de las series. */
  target?: number | null
}

export type ChartSpec = ChartSpecV1

export interface SavedChart {
  id: number
  title: string
  /** Módulo de la primera serie (o `core` si mezcla módulos). Sirve para la identidad visual. */
  module: string
  spec: ChartSpec
  createdAt: string
  updatedAt: string
}

export interface ChartInput {
  id?: number
  title: string
  spec: ChartSpec
}

/** `filter`: una serie usa un filtro que su métrica no admite. */
export type ChartRule = 'schema' | 'grouping' | 'unit' | 'split' | 'stack' | 'scatter' | 'metric' | 'filter'

export interface ChartValidationIssue {
  rule: ChartRule
  /** En español, para mostrar tal cual. */
  message: string
  /** Índice de la serie afectada, si aplica. */
  series?: number
}

// ---------------------------------------------------------------------------------------------------
// Paneles
// ---------------------------------------------------------------------------------------------------

export const DASHBOARD_IDS = ['inicio', 'finanzas', 'entreno'] as const
export type DashboardId = (typeof DASHBOARD_IDS)[number]

/** Tamaños de tarjeta en la cuadrícula: pequeña, mediana, ancha y completa. */
export const CARD_SIZES = ['s', 'm', 'l', 'full'] as const
export type CardSize = (typeof CARD_SIZES)[number]

/**
 * Tarjeta de un panel. `fixed`: tarjeta fija del registro de la interfaz (`ref` = id de la tarjeta);
 * no se puede eliminar, solo ocultar. `chart`: gráfico guardado (`ref` = id de `core_charts`, como texto).
 */
export interface DashboardCard {
  /** Único dentro del panel. */
  id: string
  type: 'fixed' | 'chart'
  ref: string
  size: CardSize
  hidden: boolean
}

export interface DashboardLayout {
  dashboardId: DashboardId
  cards: DashboardCard[]
  /** `false` si no hay fila guardada y se ha usado el diseño por defecto. */
  saved: boolean
}

/**
 * Lo que la interfaz declara de cada tarjeta fija (el componente lo añade cada módulo en su
 * `tarjetas.tsx`). `panels`: en qué paneles se puede usar.
 */
export interface FixedCardMeta {
  id: string
  module: string
  title: string
  sizes: readonly CardSize[]
  defaultSize: CardSize
  panels: readonly DashboardId[]
}

/** Diseño por defecto de un panel: tarjetas fijas en orden (lo que se ve hoy). */
export interface DashboardDefault {
  dashboardId: DashboardId
  cards: readonly { ref: string; size: CardSize }[]
}
