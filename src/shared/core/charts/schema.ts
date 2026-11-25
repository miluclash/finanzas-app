// Esquemas Zod del constructor de gráficos y de los paneles: especificación versión 1, entrada de
// guardado, consulta a una métrica y tarjetas de panel. Las cuatro reglas que dependen de las
// métricas (agrupación, unidad, división y apilado) están en `validate.ts`.
import { z } from 'zod'
import { diffDays, isISODate } from '../../dates'
import {
  CARD_SIZES,
  CHART_MAX_SERIES,
  CHART_TYPES,
  DASHBOARD_IDS,
  DIMENSION_GROUPINGS,
  METRIC_FILTER_KEYS,
  TIME_GROUPINGS,
  type ChartSpecV1,
  type DashboardCard,
  type MetricFilterKey,
  type MetricQuery
} from '../metrics-types'

const isoDate = z.string().refine(isISODate, { error: 'Fecha no válida (tiene que ser AAAA-MM-DD).' })

export const GroupingSchema = z.enum([...TIME_GROUPINGS, ...DIMENSION_GROUPINGS], { error: 'Agrupación no válida.' })
export const DimensionSchema = z.enum(DIMENSION_GROUPINGS, { error: 'División no válida.' })

const filterValue = z.union([z.string().trim().min(1).max(100), z.number()], { error: 'Valor de filtro no válido.' })

export const MetricFiltersSchema = z
  .object(Object.fromEntries(METRIC_FILTER_KEYS.map((k) => [k, filterValue.optional()])) as Record<MetricFilterKey, z.ZodOptional<typeof filterValue>>)
  .strict()

/** Máximo de periodos de un rango relativo, por unidad (para no pedir décadas de días). */
export const RANGE_LIMITS = { day: 1095, week: 260, month: 240, year: 30 } as const
/** Máximo de días de un rango con fechas fijas (unos 30 años). */
export const ABSOLUTE_MAX_DAYS = 366 * 30

const RangeUnits = z.enum(['day', 'week', 'month', 'year'], { error: 'Unidad de rango no válida.' })

export const ChartRangeSchema = z
  .discriminatedUnion(
    'kind',
    [
      z.object({ kind: z.literal('last'), unit: RangeUnits, count: z.number().int({ error: 'El número de periodos tiene que ser entero.' }).min(1, { error: 'Elige al menos un periodo.' }) }).strict(),
      z.object({ kind: z.literal('this'), unit: z.enum(['week', 'month', 'year'], { error: 'Unidad de rango no válida.' }) }).strict(),
      z.object({ kind: z.literal('absolute'), from: isoDate, to: isoDate }).strict()
    ],
    { error: 'Rango no válido.' }
  )
  .superRefine((r, c) => {
    if (r.kind === 'last' && r.count > RANGE_LIMITS[r.unit])
      c.addIssue({ code: 'custom', message: `Como mucho ${RANGE_LIMITS[r.unit]} periodos en este rango.`, path: ['count'] })
    if (r.kind === 'absolute' && isISODate(r.from) && isISODate(r.to)) {
      if (r.from > r.to) c.addIssue({ code: 'custom', message: 'La fecha de inicio es posterior a la de fin.', path: ['from'] })
      else if (diffDays(r.to, r.from) > ABSOLUTE_MAX_DAYS) c.addIssue({ code: 'custom', message: 'El rango es demasiado largo (máximo 30 años).', path: ['to'] })
    }
  })

export const ChartSeriesSchema = z
  .object({
    metricId: z.string({ error: 'Falta la métrica.' }).trim().min(1, { error: 'Falta la métrica.' }).max(100),
    filters: MetricFiltersSchema.optional(),
    label: z.string().trim().max(80, { error: 'El nombre de la serie es demasiado largo (máximo 80 caracteres).' }).optional()
  })
  .strict()

export const ChartSpecV1Schema = z
  .object({
    version: z.literal(1, { error: 'Versión de especificación no válida.' }),
    type: z.enum(CHART_TYPES, { error: 'Tipo de gráfico no válido.' }),
    series: z
      .array(ChartSeriesSchema, { error: 'Faltan las series.' })
      .min(1, { error: 'El gráfico necesita al menos una serie.' })
      .max(CHART_MAX_SERIES, { error: `Como mucho ${CHART_MAX_SERIES} series por gráfico.` }),
    groupBy: GroupingSchema,
    splitBy: DimensionSchema.optional(),
    range: ChartRangeSchema,
    comparePrevious: z.boolean().optional(),
    target: z.number({ error: 'El objetivo tiene que ser un número.' }).nullable().optional()
  })
  .strict()

// El tipo del esquema y el del contrato tienen que coincidir (falla al compilar si no).
type SpecFromSchema = z.infer<typeof ChartSpecV1Schema>
const _specCheck: (s: SpecFromSchema) => ChartSpecV1 = (s) => s
const _specCheck2: (s: ChartSpecV1) => SpecFromSchema = (s) => s
void _specCheck
void _specCheck2

export const ChartTitleSchema = z
  .string({ error: 'Falta el título.' })
  .trim()
  .min(1, { error: 'Ponle un título al gráfico.' })
  .max(80, { error: 'El título es demasiado largo (máximo 80 caracteres).' })

/** Entrada de `core:charts.save`. La especificación se valida aparte (esquema y reglas). */
export const ChartInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    title: ChartTitleSchema,
    spec: z.unknown()
  })
  .strict()

/** Consulta a una métrica (`core:metrics.compute`). */
export const MetricQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    groupBy: GroupingSchema,
    splitBy: DimensionSchema.optional(),
    filters: MetricFiltersSchema.optional()
  })
  .strict()
  .refine((q) => q.from <= q.to, { error: 'La fecha de inicio es posterior a la de fin.', path: ['from'] })

const _queryCheck: (q: z.infer<typeof MetricQuerySchema>) => MetricQuery = (q) => q
void _queryCheck

// ---------------------------------------------------------------------------------------------------
// Paneles
// ---------------------------------------------------------------------------------------------------

export const DashboardIdSchema = z.enum(DASHBOARD_IDS, { error: 'Ese panel no existe.' })

export const DashboardCardSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    type: z.enum(['fixed', 'chart']),
    ref: z.string().trim().min(1).max(100),
    size: z.enum(CARD_SIZES),
    hidden: z.boolean()
  })
  .strict()
  .refine((c) => c.type !== 'chart' || /^[1-9]\d*$/.test(c.ref), { error: 'La tarjeta de un gráfico tiene que apuntar a un gráfico guardado.', path: ['ref'] })

export const MAX_DASHBOARD_CARDS = 200

export const DashboardCardsSchema = z
  .array(DashboardCardSchema)
  .max(MAX_DASHBOARD_CARDS, { error: `Como mucho ${MAX_DASHBOARD_CARDS} tarjetas por panel.` })
  .superRefine((cards, c) => {
    const ids = new Set<string>()
    const fixed = new Set<string>()
    cards.forEach((card, i) => {
      if (ids.has(card.id)) c.addIssue({ code: 'custom', message: `Hay dos tarjetas con el mismo id («${card.id}»).`, path: [i, 'id'] })
      ids.add(card.id)
      if (card.type === 'fixed') {
        if (fixed.has(card.ref)) c.addIssue({ code: 'custom', message: `La tarjeta fija «${card.ref}» está repetida.`, path: [i, 'ref'] })
        fixed.add(card.ref)
      }
    })
  })

const _cardCheck: (c: z.infer<typeof DashboardCardSchema>) => DashboardCard = (c) => c
void _cardCheck

/** Mensajes por defecto de Zod (en inglés): se sustituyen por uno genérico en español. */
const ZOD_DEFAULT = /\b(Invalid|Expected|expected|Unrecognized|Too (big|small)|received)\b/

/** Primer mensaje legible de un error de Zod (en español: los esquemas llevan sus mensajes). */
export function firstZodMessage(e: z.ZodError, fallback = 'Datos no válidos.'): string {
  return zodMessages(e, fallback)[0]?.message ?? fallback
}

function readable(i: z.core.$ZodIssue, fallback: string): string {
  const where = i.path.map(String).join('.') || 'raíz'
  if (i.code === 'unrecognized_keys') return `Hay un campo que no existe: ${i.keys.map((k) => `«${k}»`).join(', ')}${i.path.length ? ` (en ${where})` : ''}.`
  return ZOD_DEFAULT.test(i.message) ? `${fallback.replace(/\.$/, '')} (${where}).` : i.message
}

/** Todos los mensajes legibles de un error de Zod, con la ruta de cada uno. */
export function zodMessages(e: z.ZodError, fallback = 'Datos no válidos.'): { message: string; path: PropertyKey[] }[] {
  return e.issues.map((i) => ({ message: readable(i, fallback), path: i.path }))
}
