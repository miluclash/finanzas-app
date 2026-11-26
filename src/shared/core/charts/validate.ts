// Validación de una especificación de gráfico: esquema (Zod), versión y las reglas que dependen de
// las métricas. Se aplica al guardar y al cargar: una especificación guardada que deja de cumplirlas
// (p. ej. su métrica ya no existe) devuelve avisos, nunca un error que rompa el panel.
//
// Reglas (en este orden; los mensajes son para mostrarlos tal cual):
// - metric: cada métrica existe.
// - grouping (1): todas las series usan `groupBy` y cada métrica lo admite.
// - unit (2): todas las series tienen la misma unidad.
// - split (3): `splitBy` solo con una serie, distinto de `groupBy` y admitido por la métrica.
// - stack (4): `stacked` solo con métricas de agregación `sum`.
// - scatter: la dispersión exige exactamente dos series.
// - filter: cada filtro de una serie lo admite su métrica.
//
// Agrupación por año derivada: una métrica que admite `month` y no `year` también se puede agrupar
// por año; el motor la pide por meses y la reagrupa con su agregación (`admitsGrouping`).
import type { ChartRule, ChartSpec, ChartValidationIssue, Grouping, MetricMeta, MetricFilterKey } from '../metrics-types'
import { GROUPING_LABELS, UNIT_LABELS } from './labels'
import { ChartSpecV1Schema, zodMessages } from './schema'

/** Versión de especificación que entiende esta app. */
export const CHART_SPEC_VERSION = 1

/** ¿La métrica se puede agrupar así? (incluye el año derivado de los meses). */
export function admitsGrouping(meta: Pick<MetricMeta, 'groupings'>, g: Grouping): boolean {
  return meta.groupings.includes(g) || (g === 'year' && meta.groupings.includes('month'))
}

/** Agrupación con la que se pide la métrica al módulo: `g`, o `month` si el año es derivado. */
export function nativeGrouping(meta: Pick<MetricMeta, 'groupings'>, g: Grouping): Grouping {
  return meta.groupings.includes(g) ? g : g === 'year' && meta.groupings.includes('month') ? 'month' : g
}

/** Agrupaciones que admite una métrica para el constructor (las suyas y el año derivado). */
export function chartGroupings(meta: Pick<MetricMeta, 'groupings'>): Grouping[] {
  const out = [...meta.groupings]
  if (!out.includes('year') && out.includes('month')) out.splice(out.indexOf('month') + 1, 0, 'year')
  return out
}

const issue = (rule: ChartRule, message: string, series?: number): ChartValidationIssue =>
  series === undefined ? { rule, message } : { rule, message, series }

/**
 * Pone al día una especificación guardada antes de validarla. Hoy solo existe la versión 1, que se
 * devuelve tal cual; aquí entrarán las conversiones de versiones antiguas cuando haya una versión 2.
 * Una especificación sin versión, de una versión desconocida o más nueva que la app da un aviso.
 */
export function upgradeSpec(raw: unknown): { ok: true; spec: unknown } | { ok: false; issue: ChartValidationIssue } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, issue: issue('schema', 'La configuración del gráfico está dañada (no es un objeto).') }
  const v = (raw as { version?: unknown }).version
  if (v === CHART_SPEC_VERSION) return { ok: true, spec: raw }
  if (v === undefined) return { ok: false, issue: issue('schema', 'A la configuración del gráfico le falta la versión.') }
  if (typeof v === 'number' && Number.isInteger(v) && v > CHART_SPEC_VERSION)
    return { ok: false, issue: issue('schema', `Este gráfico se guardó con una versión más nueva de la app (v${v}). Actualiza la app para verlo.`) }
  return { ok: false, issue: issue('schema', `Versión de la configuración del gráfico desconocida (${String(v)}).`) }
}

/** Nombre de la serie para los mensajes: «Nombre de la métrica». */
const nameOf = (m: MetricMeta) => `«${m.name}»`

/** Comprueba las reglas que dependen de las métricas en una especificación que ya cumple el esquema. */
export function checkRules(spec: ChartSpec, metas: readonly MetricMeta[]): ChartValidationIssue[] {
  const out: ChartValidationIssue[] = []
  const byId = new Map(metas.map((m) => [m.id, m]))
  const found: { meta: MetricMeta; i: number }[] = []
  spec.series.forEach((s, i) => {
    const meta = byId.get(s.metricId)
    if (!meta) out.push(issue('metric', `La serie ${i + 1} usa una métrica que ya no existe (${s.metricId}). Edita el gráfico para elegir otra.`, i))
    else found.push({ meta, i })
  })
  // 1. Agrupación.
  for (const { meta, i } of found)
    if (!admitsGrouping(meta, spec.groupBy)) out.push(issue('grouping', `${nameOf(meta)} no se puede agrupar por ${GROUPING_LABELS[spec.groupBy]}.`, i))
  // 2. Unidad.
  const first = found[0]
  if (first)
    for (const { meta, i } of found.slice(1))
      if (meta.unit !== first.meta.unit)
        out.push(
          issue(
            'unit',
            `Todas las series tienen que tener la misma unidad: ${nameOf(first.meta)} va en ${UNIT_LABELS[first.meta.unit]} y ${nameOf(meta)} en ${UNIT_LABELS[meta.unit]}.`,
            i
          )
        )
  // 3. División.
  if (spec.splitBy) {
    const by = GROUPING_LABELS[spec.splitBy]
    if (spec.series.length !== 1) out.push(issue('split', `Para dividir por ${by}, el gráfico tiene que tener una sola serie.`))
    else if (spec.splitBy === spec.groupBy) out.push(issue('split', `No se puede dividir por ${by} y agrupar por lo mismo.`, 0))
    else if (first && !first.meta.splits.includes(spec.splitBy)) out.push(issue('split', `${nameOf(first.meta)} no se puede dividir por ${by}.`, 0))
  }
  // 4. Apilado.
  if (spec.type === 'stacked')
    for (const { meta, i } of found)
      if (meta.aggregation !== 'sum')
        out.push(issue('stack', `Las barras apiladas solo valen para métricas que se suman, y ${nameOf(meta)} no se suma.`, i))
  // Dispersión.
  if (spec.type === 'scatter' && spec.series.length !== 2)
    out.push(issue('scatter', `La dispersión necesita exactamente dos series, una para cada eje (tiene ${spec.series.length}).`))
  // Filtros.
  for (const { meta, i } of found)
    for (const k of Object.keys(spec.series[i].filters ?? {}) as MetricFilterKey[])
      if (spec.series[i].filters?.[k] !== undefined && !meta.filters.includes(k))
        out.push(issue('filter', `${nameOf(meta)} no admite el filtro «${FILTER_LABELS[k]}».`, i))
  return out
}

export const FILTER_LABELS: Record<MetricFilterKey, string> = {
  exerciseId: 'ejercicio',
  groupId: 'grupo muscular',
  kind: 'tipo de sesión',
  accountId: 'cuenta',
  categoryId: 'categoría',
  categoryGroup: 'grupo de categorías'
}

/** Resultado de leer una especificación: la especificación válida o sus avisos. */
export type ParsedSpec = { ok: true; spec: ChartSpec; issues: [] } | { ok: false; spec: null; issues: ChartValidationIssue[] }

/** Versión, esquema y reglas. Devuelve la especificación ya normalizada por Zod o los avisos. */
export function parseSpec(raw: unknown, metas: readonly MetricMeta[]): ParsedSpec {
  const up = upgradeSpec(raw)
  if (!up.ok) return { ok: false, spec: null, issues: [up.issue] }
  const r = ChartSpecV1Schema.safeParse(up.spec)
  if (!r.success) {
    const issues = zodMessages(r.error, 'La configuración del gráfico no es válida.').map((m) =>
      issue('schema', m.message, m.path[0] === 'series' && typeof m.path[1] === 'number' ? m.path[1] : undefined)
    )
    return { ok: false, spec: null, issues }
  }
  const issues = checkRules(r.data, metas)
  return issues.length ? { ok: false, spec: null, issues } : { ok: true, spec: r.data, issues: [] }
}

/** Avisos de una especificación (vacío si es válida). */
export function validateSpec(spec: unknown, metas: readonly MetricMeta[]): ChartValidationIssue[] {
  return parseSpec(spec, metas).issues
}

/**
 * Para el constructor: por qué no se puede añadir esta métrica a un gráfico que ya tiene una primera
 * serie (`first`) con esta agrupación y tipo. null si se puede. Mensaje corto para mostrar junto a
 * la métrica desactivada.
 */
export function incompatibilityReason(
  meta: MetricMeta,
  ctx: { first?: MetricMeta | null; groupBy?: Grouping | null; type?: ChartSpec['type'] | null }
): string | null {
  if (ctx.first && meta.unit !== ctx.first.unit) return `unidad distinta: ${UNIT_LABELS[meta.unit]}`
  if (ctx.groupBy && !admitsGrouping(meta, ctx.groupBy)) return `no se agrupa por ${GROUPING_LABELS[ctx.groupBy]}`
  if (ctx.type === 'stacked' && meta.aggregation !== 'sum') return 'no se suma (no se puede apilar)'
  return null
}
