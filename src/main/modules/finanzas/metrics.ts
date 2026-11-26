// Métricas de Finanzas para el constructor de gráficos (F5). Solo envuelven funciones que ya existen
// (`monthSummaries`, `positionAt`, `liquidityAt`, `budgetReport`, `portfolioSummary`): no calculan nada nuevo.
//
// Reglas comunes:
// - Dinero en céntimos enteros. Los GASTOS salen en positivo (gastado neto de reembolsos), igual que en los
//   presupuestos; en `monthSummaries` son negativos (`gastos = -totalExpensesCents`).
// - Rango: se incluyen todos los meses que se solapan con [from, to]. Un mes parcial cuenta ENTERO en los
//   flujos (igual que `monthly.summaries`, que no sabe de días). Los saldos (`last`) se toman al final del mes o
//   en `to`/hoy si es antes (el último mes parcial da el saldo en `to`).
// - Solo hay claves con datos: flujos, los meses con algún movimiento; saldos, desde el primer mes seguido
//   hasta hoy (no se inventan meses futuros); presupuestos, los meses con alguna línea presupuestada.
// - Año: los flujos se suman; los saldos toman el último mes incluido; las tasas suman num y den.
// - Agrupar por dimensión (sin tiempo) junta todo el rango: suma (flujos) o último mes (saldos).
import type {
  DimensionGrouping,
  Grouping,
  MetricBucket,
  MetricDef,
  MetricFilterKey,
  MetricFilters,
  MetricOption,
  MetricOptionKind,
  MetricQuery
} from '@shared/core/metrics-types'
import { addMonthsToMonth, monthEnd, monthOf } from '@shared/dates'
import { budgetReport } from '@shared/modules/finanzas/budgets'
import type { Ctx } from '@shared/modules/finanzas/ctx'
import { liquidityAt, monthSummaries, NO_GROUP, positionAt, trackedMonths } from '@shared/modules/finanzas/ledger'
import { portfolioSummary } from '@shared/modules/finanzas/investments'
import type { MonthKey } from '@shared/modules/finanzas/types'
import type { CoreContext } from '../../core/context'
import { AppState } from './appState'

const MAX_MONTHS = 240
const NO_CATEGORY_LABEL = 'Sin categoría'

interface DimValue {
  id: string
  label: string
}

/** Valor de una métrica en un mes (y, si procede, para un valor concreto de cada dimensión). */
interface Atom {
  month: MonthKey
  dims?: Partial<Record<DimensionGrouping, DimValue>>
  value: number
  num?: number
  den?: number
}

type Agg = 'sum' | 'last' | 'ratio'

/** Meses que se solapan con [from, to] (vacío si el rango es al revés). */
function monthsOf(q: MetricQuery): MonthKey[] {
  if (q.from > q.to) return []
  const out: MonthKey[] = []
  const last = monthOf(q.to)
  for (let m = monthOf(q.from); m <= last && out.length < MAX_MONTHS; m = addMonthsToMonth(m, 1)) out.push(m)
  return out
}

/** Meses con saldo: del primer mes seguido hasta hoy. */
function balanceMonths(ctx: Ctx, q: MetricQuery, firstOverride?: MonthKey): MonthKey[] {
  const first = firstOverride ?? trackedMonths(ctx)[0]
  const today = monthOf(ctx.today)
  return monthsOf(q).filter((m) => (!first || m >= first) && m <= today)
}

/** Fecha del saldo de un mes: fin de mes, o `to`/hoy si es antes. */
function balanceDate(ctx: Ctx, q: MetricQuery, m: MonthKey): string {
  let d = monthEnd(m)
  if (q.to < d) d = q.to
  if (ctx.today < d) d = ctx.today
  return d
}

function matches(f: MetricFilters | undefined, key: MetricFilterKey, value: string): boolean {
  const v = f?.[key]
  return v === undefined || v === '' || String(v) === value
}

function groupLabel(ctx: Ctx, gid: string): string {
  return gid === NO_GROUP ? NO_CATEGORY_LABEL : (ctx.groupById.get(gid)?.name ?? gid)
}

function categoryLabel(ctx: Ctx, cid: string): string {
  return cid === NO_GROUP ? NO_CATEGORY_LABEL : (ctx.categoryById.get(cid)?.name ?? cid)
}

/** Agrupa átomos según la consulta. `agg` dice cómo se combinan los que caen en la misma clave. */
function bucketize(atoms: Atom[], q: MetricQuery, agg: Agg): MetricBucket[] {
  const g = q.groupBy
  const timeKey = (m: MonthKey): string | null => (g === 'month' ? m : g === 'year' ? m.slice(0, 4) : null)
  const isTime = g === 'month' || g === 'year'
  if (!isTime && !(g === 'category' || g === 'categoryGroup' || g === 'account')) return []
  interface Acc {
    key: string
    split?: string
    label?: string
    splitLabel?: string
    byMonth: Map<MonthKey, { value: number; num: number; den: number }>
  }
  const accs = new Map<string, Acc>()
  for (const a of atoms) {
    const key = isTime ? timeKey(a.month)! : a.dims?.[g as DimensionGrouping]?.id
    if (key === undefined) continue
    let split: string | undefined
    let splitLabel: string | undefined
    if (q.splitBy) {
      const sv = a.dims?.[q.splitBy]
      if (!sv) continue
      split = sv.id
      splitLabel = sv.label
    }
    const id = `${key}\u0000${split ?? ''}`
    let acc = accs.get(id)
    if (!acc) {
      acc = { key, split, splitLabel, label: isTime ? undefined : a.dims?.[g as DimensionGrouping]?.label, byMonth: new Map() }
      accs.set(id, acc)
    }
    const cell = acc.byMonth.get(a.month) ?? { value: 0, num: 0, den: 0 }
    cell.value += a.value
    cell.num += a.num ?? 0
    cell.den += a.den ?? 0
    acc.byMonth.set(a.month, cell)
  }
  const out: MetricBucket[] = []
  for (const acc of accs.values()) {
    let value = 0
    let num = 0
    let den = 0
    if (agg === 'last') {
      const lastMonth = [...acc.byMonth.keys()].sort().pop()!
      value = acc.byMonth.get(lastMonth)!.value
    } else {
      for (const c of acc.byMonth.values()) {
        value += c.value
        num += c.num
        den += c.den
      }
    }
    const b: MetricBucket = { key: acc.key, value }
    if (agg === 'ratio') {
      b.num = num
      b.den = den
      b.value = den ? num / den : 0
    }
    if (acc.split !== undefined) b.split = acc.split
    if (acc.label !== undefined) b.label = acc.label
    if (acc.splitLabel !== undefined) b.splitLabel = acc.splitLabel
    out.push(b)
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : (a.split ?? '') < (b.split ?? '') ? -1 : (a.split ?? '') > (b.split ?? '') ? 1 : 0))
}

const TIME: readonly Grouping[] = ['month', 'year']

type CoreCompute = (ctx: Ctx, q: MetricQuery) => Atom[]

function def(
  id: string,
  name: string,
  description: string,
  unit: MetricDef['unit'],
  aggregation: Agg,
  opts: { groupings?: readonly Grouping[]; splits?: readonly DimensionGrouping[]; filters?: readonly MetricFilterKey[] },
  atoms: CoreCompute
): MetricDef<CoreContext> {
  return {
    id: `finanzas.${id}`,
    module: 'finanzas',
    name,
    description,
    unit,
    aggregation,
    groupings: opts.groupings ?? TIME,
    splits: opts.splits ?? [],
    filters: opts.filters ?? [],
    compute: (core, q) => bucketize(atoms(AppState.for(core).ctx(), q), q, aggregation)
  }
}

/** Átomos de flujo a partir del resumen mensual (solo meses con movimientos). */
function flow(pick: (s: ReturnType<typeof monthSummaries> extends Map<string, infer S> ? S : never) => (Partial<Atom> & { value: number }) | null): CoreCompute {
  return (ctx, q) => {
    const months = monthsOf(q)
    const sums = monthSummaries(ctx, months)
    const out: Atom[] = []
    for (const m of months) {
      const s = sums.get(m)!
      if (s.txCount === 0) continue
      const a = pick(s)
      if (a) out.push({ month: m, ...a })
    }
    return out
  }
}

/** Saldos a fin de mes. */
function balance(pick: (ctx: Ctx, date: string, q: MetricQuery) => Array<Pick<Atom, 'value' | 'dims'>>, firstMonth?: (ctx: Ctx) => MonthKey | undefined): CoreCompute {
  return (ctx, q) => {
    const out: Atom[] = []
    for (const m of balanceMonths(ctx, q, firstMonth?.(ctx))) {
      for (const a of pick(ctx, balanceDate(ctx, q, m), q)) out.push({ month: m, ...a })
    }
    return out
  }
}

/** Primer mes con inversiones (mismo criterio que `inv.overview`, sin el tope de 36 meses). */
function investmentsFirstMonth(ctx: Ctx): MonthKey | undefined {
  let from = monthOf(ctx.settings.trackingStart)
  const firstOp = ctx.ops[0]
  if (firstOp && monthOf(firstOp.date) < from) from = monthOf(firstOp.date)
  return from
}

/** Líneas de presupuesto por mes (solo categorías con presupuesto), con su categoría y grupo. */
function budgetAtoms(field: 'budgetCents' | 'spentCents'): CoreCompute {
  return (ctx, q) => {
    const out: Atom[] = []
    for (const m of monthsOf(q)) {
      const rep = budgetReport(ctx, m)
      for (const l of rep.lines) {
        if (l.budgetCents === null) continue
        const cat = ctx.categoryById.get(l.categoryId)
        const gid = cat?.groupId ?? NO_GROUP
        if (!matches(q.filters, 'categoryId', l.categoryId) || !matches(q.filters, 'categoryGroup', gid)) continue
        out.push({
          month: m,
          value: field === 'budgetCents' ? l.budgetCents : l.spentCents,
          dims: {
            category: { id: l.categoryId, label: categoryLabel(ctx, l.categoryId) },
            categoryGroup: { id: gid, label: groupLabel(ctx, gid) }
          }
        })
      }
    }
    return out
  }
}

const CAT_DIMS: readonly DimensionGrouping[] = ['category', 'categoryGroup']
const CAT_FILTERS: readonly MetricFilterKey[] = ['categoryId', 'categoryGroup']

export const FINANZAS_METRICS: MetricDef<CoreContext>[] = [
  def('ingresos', 'Ingresos', 'Ingresos del periodo (criterio de caja).', 'eur_cents', 'sum', {}, flow((s) => ({ value: s.incomeCents }))),
  def(
    'gastos',
    'Gastos',
    'Gasto neto de reembolsos, en positivo.',
    'eur_cents',
    'sum',
    {},
    flow((s) => ({ value: -s.totalExpensesCents }))
  ),
  def('flujo-neto', 'Flujo neto', 'Ingresos menos gastos.', 'eur_cents', 'sum', {}, flow((s) => ({ value: s.netCashFlowCents }))),
  def(
    'aportacion-ahorro',
    'Aportación a ahorro',
    'Entradas netas por transferencia en cuentas de ahorro.',
    'eur_cents',
    'sum',
    {},
    flow((s) => ({ value: s.toSavingsCents }))
  ),
  def(
    'aportacion-inversiones',
    'Aportación a inversiones',
    'Aportaciones netas a cuentas o compras de inversión.',
    'eur_cents',
    'sum',
    {},
    flow((s) => ({ value: s.toInvestmentsCents }))
  ),
  def(
    'gasto-categoria',
    'Gasto por categoría',
    'Gasto neto (en positivo) por categoría o grupo de categorías.',
    'eur_cents',
    'sum',
    { groupings: [...TIME, ...CAT_DIMS], splits: CAT_DIMS, filters: CAT_FILTERS },
    (ctx, q) => {
      const months = monthsOf(q)
      const sums = monthSummaries(ctx, months)
      const out: Atom[] = []
      for (const m of months) {
        for (const [cid, amount] of Object.entries(sums.get(m)!.expensesByCategory)) {
          const gid = cid === NO_GROUP ? NO_GROUP : (ctx.categoryById.get(cid)?.groupId ?? NO_GROUP)
          if (!matches(q.filters, 'categoryId', cid) || !matches(q.filters, 'categoryGroup', gid)) continue
          out.push({
            month: m,
            value: -amount,
            dims: { category: { id: cid, label: categoryLabel(ctx, cid) }, categoryGroup: { id: gid, label: groupLabel(ctx, gid) } }
          })
        }
      }
      return out
    }
  ),
  def(
    'tasa-ahorro',
    'Tasa de ahorro',
    'Flujo neto entre ingresos (num = flujo neto, den = ingresos). Un mes sin ingresos da punto con den = 0 y value = 0 (suma su num en el año).',
    'pct',
    'ratio',
    {},
    flow((s) => ({ value: s.incomeCents > 0 ? s.netCashFlowCents / s.incomeCents : 0, num: s.netCashFlowCents, den: s.incomeCents }))
  ),
  def(
    'tasa-ahorro-sin-extra',
    'Tasa de ahorro sin extraordinarios',
    'Tasa de ahorro sin contar gastos extraordinarios (num = flujo neto sin ellos, den = ingresos). Un mes sin ingresos da punto con den = 0 y value = 0 (suma su num en el año).',
    'pct',
    'ratio',
    {},
    flow((s) => ({
      value: s.incomeCents > 0 ? (s.netCashFlowCents - s.extraordinaryCents) / s.incomeCents : 0,
      num: s.netCashFlowCents - s.extraordinaryCents,
      den: s.incomeCents
    }))
  ),
  def(
    'patrimonio',
    'Patrimonio',
    'Patrimonio neto a fin de mes.',
    'eur_cents',
    'last',
    {},
    balance((ctx, d) => [{ value: positionAt(ctx, d).netWorthCents }])
  ),
  def(
    'liquidez',
    'Liquidez',
    'Suma de las cuentas marcadas como líquidas a fin de mes.',
    'eur_cents',
    'last',
    {},
    balance((ctx, d) => [{ value: liquidityAt(ctx, d) }])
  ),
  def(
    'saldo-cuenta',
    'Saldo de cuentas',
    'Saldo a fin de mes (efectivo y posiciones): suma de todas las cuentas elegidas, también pasivos y las que no cuentan para el patrimonio; elige una cuenta o divide por cuenta para verlas por separado.',
    'eur_cents',
    'last',
    { groupings: [...TIME, 'account'], splits: ['account'], filters: ['accountId'] },
    balance((ctx, d, q) =>
      positionAt(ctx, d)
        .byAccount.filter((a) => matches(q.filters, 'accountId', a.accountId))
        .map((a) => ({
          value: a.balanceCents,
          dims: { account: { id: a.accountId, label: ctx.accountById.get(a.accountId)?.name ?? a.accountId } }
        }))
    )
  ),
  def(
    'valor-inversiones',
    'Valor de las inversiones',
    'Posiciones más efectivo del bróker a fin de mes (el mismo valor que la serie de Inversiones).',
    'eur_cents',
    'last',
    {},
    balance(
      (ctx, d) => {
        const p = portfolioSummary(ctx, d)
        // Mismo criterio que `inv.overview`: sin operaciones ni efectivo no hay serie
        return ctx.ops.length || p.cashCents ? [{ value: p.totalWithCashCents }] : []
      },
      investmentsFirstMonth
    )
  ),
  {
    // Serie de referencia: se dibuja discontinua (o solo con borde en barras), nunca como lo real.
    ...def(
      'presupuesto',
      'Presupuesto',
      'Suma de los presupuestos del mes (solo categorías de gasto con presupuesto).',
      'eur_cents',
      'sum',
      { groupings: [...TIME, ...CAT_DIMS], splits: CAT_DIMS, filters: CAT_FILTERS },
      budgetAtoms('budgetCents')
    ),
    presentation: 'reference'
  },
  def(
    'gasto-presupuestado',
    'Gasto en categorías presupuestadas',
    'Gasto del mes solo en las categorías que tienen presupuesto (para compararlo con el presupuesto).',
    'eur_cents',
    'sum',
    { groupings: [...TIME, ...CAT_DIMS], splits: CAT_DIMS, filters: CAT_FILTERS },
    budgetAtoms('spentCents')
  )
]

/** Listas para los filtros del constructor: cuentas, categorías (con su grupo) y grupos. */
export function finanzasMetricOptions(core: CoreContext, kind: MetricOptionKind): MetricOption[] {
  const ctx = AppState.for(core).ctx()
  switch (kind) {
    case 'account':
      return [...ctx.accounts]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))
        .map((a) => ({ value: a.id, label: a.name, ...(a.active ? {} : { inactive: true }) }))
    case 'category':
      return [
        ...[...ctx.categories]
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))
          .map((c) => ({
            value: c.id,
            label: c.name,
            group: groupLabel(ctx, c.groupId),
            ...(c.active ? {} : { inactive: true })
          })),
        { value: NO_GROUP, label: NO_CATEGORY_LABEL }
      ]
    case 'categoryGroup':
      return [
        ...[...ctx.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ value: g.id, label: g.name })),
        { value: NO_GROUP, label: NO_CATEGORY_LABEL }
      ]
    default:
      return []
  }
}
