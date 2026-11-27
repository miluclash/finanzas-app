// Herramientas del núcleo para la IA local: lista de métricas, cálculo de una métrica, opciones de
// los filtros y propuesta de gráfico. Leen con los servicios de siempre (`createCoreMetrics`) y el
// gráfico se guarda, cuando Michael lo confirma, con `core:charts.save` (cola y auditoría).
import { z } from 'zod'
import { AGGREGATION_LABELS, GROUPING_LABELS, UNIT_LABELS } from '@shared/core/charts/labels'
import { ChartInputSchema, firstZodMessage } from '@shared/core/charts/schema'
import { parseSpec } from '@shared/core/charts/validate'
import {
  CHART_TYPES,
  DIMENSION_GROUPINGS,
  METRIC_OPTION_KINDS,
  TIME_GROUPINGS,
  type ChartInput,
  type ChartRange,
  type ChartSpecV1,
  type MetricBucket,
  type MetricMeta,
  type MetricUnit
} from '@shared/core/metrics-types'
import { addMonthsToMonth, isISODate, monthOf, monthStart } from '@shared/dates'
import type { AiFieldDiff, AiToolDef } from '@shared/core/ai-types'
import { createChartsService } from '../charts'
import type { CoreContext } from '../context'
import { UserError } from '../errors'
import { createCoreMetrics } from '../metrics'
import { actionTool, eur, params, pct, readTool } from './toolkit'

/** Puntos máximos de una métrica que se envían al modelo (los más recientes). */
export const AI_METRIC_POINTS_MAX = 120
/** Opciones máximas de un filtro que se envían al modelo. */
export const AI_OPTIONS_MAX = 200

const isoDate = z.string().refine(isISODate, 'Fecha no válida (AAAA-MM-DD)')
const GROUPINGS = [...TIME_GROUPINGS, ...DIMENSION_GROUPINGS] as const

const CHART_TYPE_LABELS: Record<(typeof CHART_TYPES)[number], string> = {
  line: 'Líneas',
  bar: 'Barras',
  area: 'Área',
  stacked: 'Barras apiladas',
  scatter: 'Dispersión',
  table: 'Tabla'
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Valor legible en la unidad de la métrica (dinero con €, proporciones con %). */
export function formatMetricValue(value: number, unit: MetricUnit): string | number {
  if (unit === 'eur_cents') return eur(value)
  if (unit === 'pct') return pct(value) ?? '—'
  return round(value)
}

function metaOrThrow(metas: readonly MetricMeta[], id: string): MetricMeta {
  const m = metas.find((x) => x.id === id)
  if (!m) throw new UserError(`Esa métrica no existe (${id}). Usa core_metricas_lista para ver los ids.`)
  return m
}

const ListArgs = z.object({ modulo: z.enum(['finanzas', 'entreno']).optional() }).strict()

const FiltersArg = z.record(z.string(), z.union([z.string(), z.number()])).optional()

const ComputeArgs = z
  .object({
    metrica: z.string().trim().min(1),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
    agrupar: z.enum(GROUPINGS),
    dividir: z.enum(DIMENSION_GROUPINGS).optional(),
    filtros: FiltersArg
  })
  .strict()

const OptionsArgs = z.object({ tipo: z.enum(METRIC_OPTION_KINDS) }).strict()

const ChartArgs = z
  .object({
    titulo: z.string().trim().min(1).max(80),
    tipo: z.enum(CHART_TYPES),
    series: z
      .array(z.object({ metrica: z.string().trim().min(1), filtros: FiltersArg, etiqueta: z.string().trim().max(80).optional() }).strict())
      .min(1)
      .max(6),
    agrupar: z.enum(GROUPINGS),
    dividir: z.enum(DIMENSION_GROUPINGS).optional(),
    rango: z
      .object({
        tipo: z.enum(['ultimos', 'este', 'fechas']),
        unidad: z.enum(['day', 'week', 'month', 'year']).optional(),
        cantidad: z.number().int().min(1).optional(),
        desde: isoDate.optional(),
        hasta: isoDate.optional()
      })
      .strict(),
    compararAnterior: z.boolean().optional(),
    /** En la unidad de las series; si es dinero, en euros. */
    objetivo: z.number().nullable().optional()
  })
  .strict()

function toRange(r: z.infer<typeof ChartArgs>['rango']): ChartRange {
  if (r.tipo === 'ultimos') {
    if (!r.unidad || !r.cantidad) throw new UserError('Para «ultimos» indica la unidad y la cantidad de periodos.')
    return { kind: 'last', unit: r.unidad, count: r.cantidad }
  }
  if (r.tipo === 'este') {
    if (!r.unidad || r.unidad === 'day') throw new UserError('Para «este» la unidad tiene que ser week, month o year.')
    return { kind: 'this', unit: r.unidad }
  }
  if (!r.desde || !r.hasta) throw new UserError('Para «fechas» indica desde y hasta.')
  return { kind: 'absolute', from: r.desde, to: r.hasta }
}

function rangeLabel(r: ChartRange): string {
  const units = { day: 'días', week: 'semanas', month: 'meses', year: 'años' } as const
  const one = { week: 'esta semana', month: 'este mes', year: 'este año' } as const
  if (r.kind === 'last') return `Últimos ${r.count} ${units[r.unit]}`
  if (r.kind === 'this') return one[r.unit]
  return `Del ${r.from} al ${r.to}`
}

export const CORE_AI_TOOLS: readonly AiToolDef<CoreContext>[] = [
  readTool<CoreContext, z.infer<typeof ListArgs>>({
    name: 'core_metricas_lista',
    label: 'Consultando las métricas disponibles',
    description:
      'Lista las métricas que se pueden calcular o dibujar (finanzas y entreno): id, nombre, unidad, agrupaciones, divisiones y filtros que admite cada una. Úsala antes de core_metrica_calcular o core_grafico_crear.',
    parameters: params({ modulo: { type: 'string', enum: ['finanzas', 'entreno'], description: 'Solo las de este módulo (opcional).' } }),
    args: ListArgs,
    run: (ctx, a) =>
      createCoreMetrics(ctx)
        .list()
        .filter((m) => !a.modulo || m.module === a.modulo)
        .map((m) => ({
          id: m.id,
          nombre: m.name,
          ...(m.description ? { descripcion: m.description } : {}),
          unidad: UNIT_LABELS[m.unit],
          agregacion: AGGREGATION_LABELS[m.aggregation],
          agrupaciones: m.groupings,
          divisiones: m.splits,
          filtros: m.filters
        }))
  }),

  readTool<CoreContext, z.infer<typeof ComputeArgs>>({
    name: 'core_metrica_calcular',
    label: 'Calculando una métrica',
    description:
      'Calcula una métrica entre dos fechas, agrupada por tiempo (day, week, month, year) o por una dimensión (category, account, exercise…). Devuelve los puntos ya formateados (dinero en €). Sin fechas: los últimos 12 meses hasta hoy. Los ids de los filtros salen de core_metrica_opciones.',
    parameters: params(
      {
        metrica: { type: 'string', description: 'Id de la métrica (de core_metricas_lista).' },
        desde: { type: 'string', description: 'Fecha inicial AAAA-MM-DD (opcional).' },
        hasta: { type: 'string', description: 'Fecha final AAAA-MM-DD (opcional; por defecto hoy).' },
        agrupar: { type: 'string', enum: [...GROUPINGS], description: 'Agrupación (tiene que admitirla la métrica).' },
        dividir: { type: 'string', enum: [...DIMENSION_GROUPINGS], description: 'Segunda agrupación por dimensión (opcional).' },
        filtros: { type: 'object', description: 'Filtros, p. ej. {"categoryId": "C12"} o {"exerciseId": 3}.' }
      },
      ['metrica', 'agrupar']
    ),
    args: ComputeArgs,
    run: (ctx, a) => {
      const metrics = createCoreMetrics(ctx)
      const meta = metaOrThrow(metrics.list(), a.metrica)
      const to = a.hasta ?? ctx.today()
      const from = a.desde ?? monthStart(addMonthsToMonth(monthOf(to), -11))
      const query = { from, to, groupBy: a.agrupar, ...(a.dividir ? { splitBy: a.dividir } : {}), ...(a.filtros ? { filters: a.filtros } : {}) }
      const points: MetricBucket[] = metrics.compute(meta.id, query)
      const shown = points.length > AI_METRIC_POINTS_MAX ? points.slice(points.length - AI_METRIC_POINTS_MAX) : points
      return {
        metrica: meta.name,
        unidad: UNIT_LABELS[meta.unit],
        desde: from,
        hasta: to,
        agrupacion: GROUPING_LABELS[a.agrupar],
        puntos: shown.map((p) => ({
          clave: p.key,
          ...(p.label ? { etiqueta: p.label } : {}),
          ...(p.split !== undefined ? { division: p.splitLabel ?? p.split } : {}),
          valor: formatMetricValue(p.value, meta.unit)
        })),
        ...(points.length > shown.length ? { recortado: `Solo los ${shown.length} puntos más recientes de ${points.length}.` } : {})
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof OptionsArgs>>({
    name: 'core_metrica_opciones',
    label: 'Consultando las opciones de los filtros',
    description:
      'Valores posibles de un filtro de métrica (ejercicios, grupos musculares, tipos de sesión, cuentas, categorías o grupos de categorías), con su id.',
    parameters: params({ tipo: { type: 'string', enum: [...METRIC_OPTION_KINDS] } }, ['tipo']),
    args: OptionsArgs,
    run: (ctx, a) => {
      const all = createCoreMetrics(ctx).options(a.tipo)
      return {
        opciones: all.slice(0, AI_OPTIONS_MAX).map((o) => ({ id: o.value, nombre: o.label, ...(o.group ? { grupo: o.group } : {}), ...(o.inactive ? { inactivo: true } : {}) })),
        ...(all.length > AI_OPTIONS_MAX ? { recortado: `Solo ${AI_OPTIONS_MAX} de ${all.length}.` } : {})
      }
    }
  }),

  actionTool<CoreContext, z.infer<typeof ChartArgs>>({
    name: 'core_grafico_crear',
    label: 'Preparando un gráfico',
    description:
      'Propone crear un gráfico guardado. NO lo crea: Michael lo ve y lo confirma en una tarjeta. Reglas: todas las series con la misma unidad y la misma agrupación; dividir solo con una serie; barras apiladas (stacked) solo con métricas que se suman; dispersión (scatter) con exactamente dos series. El objetivo va en la unidad de las series (en euros si es dinero).',
    parameters: params(
      {
        titulo: { type: 'string', description: 'Título corto (máx. 80 caracteres).' },
        tipo: { type: 'string', enum: [...CHART_TYPES] },
        series: {
          type: 'array',
          description: 'De 1 a 6 series.',
          items: {
            type: 'object',
            properties: {
              metrica: { type: 'string', description: 'Id de la métrica.' },
              filtros: { type: 'object' },
              etiqueta: { type: 'string' }
            },
            required: ['metrica']
          }
        },
        agrupar: { type: 'string', enum: [...GROUPINGS] },
        dividir: { type: 'string', enum: [...DIMENSION_GROUPINGS] },
        rango: {
          type: 'object',
          description: 'ultimos (unidad + cantidad), este (unidad week/month/year) o fechas (desde + hasta).',
          properties: {
            tipo: { type: 'string', enum: ['ultimos', 'este', 'fechas'] },
            unidad: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
            cantidad: { type: 'integer' },
            desde: { type: 'string' },
            hasta: { type: 'string' }
          },
          required: ['tipo']
        },
        compararAnterior: { type: 'boolean' },
        objetivo: { type: 'number' }
      },
      ['titulo', 'tipo', 'series', 'agrupar', 'rango']
    ),
    args: ChartArgs,
    plan: (ctx, a) => {
      const metas = createCoreMetrics(ctx).list()
      const first = metaOrThrow(metas, a.series[0].metrica)
      const target = a.objetivo == null ? undefined : first.unit === 'eur_cents' ? Math.round(a.objetivo * 100) : a.objetivo
      const spec: ChartSpecV1 = {
        version: 1,
        type: a.tipo,
        series: a.series.map((s) => ({ metricId: s.metrica, ...(s.filtros ? { filters: s.filtros } : {}), ...(s.etiqueta ? { label: s.etiqueta } : {}) })),
        groupBy: a.agrupar,
        ...(a.dividir ? { splitBy: a.dividir } : {}),
        range: toRange(a.rango),
        ...(a.compararAnterior ? { comparePrevious: true } : {}),
        ...(target !== undefined ? { target } : {})
      }
      const input = ChartInputSchema.safeParse({ title: a.titulo, spec })
      if (!input.success) throw new UserError(firstZodMessage(input.error, 'Gráfico no válido.'))
      const parsed = parseSpec(spec, metas)
      if (!parsed.ok) throw new UserError(`Gráfico no válido: ${parsed.issues.map((i) => i.message).join(' ')}`)
      const payload: ChartInput = { title: input.data.title, spec: parsed.spec }
      const names = parsed.spec.series.map((s) => s.label ?? metas.find((m) => m.id === s.metricId)?.name ?? s.metricId)
      const fields: AiFieldDiff[] = [
        { label: 'Título', before: null, after: payload.title },
        { label: 'Tipo', before: null, after: CHART_TYPE_LABELS[parsed.spec.type] },
        { label: 'Series', before: null, after: names.join(', ') },
        { label: 'Agrupación', before: null, after: GROUPING_LABELS[parsed.spec.groupBy] },
        { label: 'Rango', before: null, after: rangeLabel(parsed.spec.range) }
      ]
      return {
        criterion: null,
        changes: [
          {
            entity: 'chart',
            entityId: null,
            op: 'create',
            label: `Gráfico «${payload.title}»`,
            fields,
            preview: { kind: 'chart', title: payload.title, spec: parsed.spec },
            payload,
            fingerprint: null
          }
        ]
      }
    },
    apply: async (ctx, change) => {
      const metrics = createCoreMetrics(ctx)
      await createChartsService(ctx, metrics).save(change.payload as ChartInput)
    },
    fingerprint: () => null
  })
]
