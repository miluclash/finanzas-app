// Herramientas de Finanzas para la IA local (F6).
//
// Lectura: resúmenes y listas recortadas con las funciones de siempre (`monthSummary`,
// `computeAlerts`, `budgetReport`, `listGoals`, `netWorthSeries`, `listTransactions`). No calculan
// nada nuevo.
//
// Acciones (solo proponen): movimientos (crear, editar, cambiar categoría o estado, borrar, y
// recategorizar por criterio), presupuestos y objetivos. `plan` valida con el MISMO esquema que el
// handler (`TxInput`, `BudgetSetInput`, `GoalInput`) y `apply` llama a la MISMA función que el
// handler dentro de una operación de la cola con su misma etiqueta (`finanzas:tx.save`…): la lógica
// financiera no cambia (regla 2). Fuera: cuentas, categorías, inversiones, reglas, ajustes e
// importaciones.
import { z } from 'zod'
import { AI_TX_SEARCH_MAX, type AiActionPlan, type AiChange, type AiChangeDraft, type AiFieldDiff } from '@shared/core/ai-types'
import { addMonthsToMonth, formatMonth, isISODate, monthOf } from '@shared/dates'
import { computeAlerts } from '@shared/modules/finanzas/dashboard'
import { GOAL_HEALTH_LABEL } from '@shared/modules/finanzas/goals'
import { allBalances, monthSummary, NO_GROUP, netWorthSeries } from '@shared/modules/finanzas/ledger'
import { BudgetSetInput, GoalInput, TxInput } from '@shared/modules/finanzas/schemas'
import {
  GOAL_STATUSES,
  GOAL_TYPES,
  PRIORITIES,
  TX_STATUSES,
  type Account,
  type Category,
  type Goal,
  type Transaction,
  type TxStatus,
  type TxType
} from '@shared/modules/finanzas/types'
import { expectedSign, validateTransaction, type TxDraft } from '@shared/modules/finanzas/validation'
import type { CoreContext } from '../../core/context'
import { UserError } from '../../core/errors'
import { actionTool, eur, eurosToCents, fecha, fingerprintOf, limited, norm, params, pct, readTool, resolveByName } from '../../core/ai/toolkit'
import type { AiToolDef } from '../../core/registry'
import { AppState } from './appState'
import * as planning from './planning'
import * as txs from './transactions'

const st = (ctx: CoreContext) => AppState.for(ctx)
const isoDate = z.string().refine(isISODate, 'Fecha no válida (AAAA-MM-DD)')
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes no válido (AAAA-MM)')
const ref = z.union([z.string().trim().min(1), z.number()])
const euros = z.number().finite()

const TYPE_LABEL: Record<TxType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  REFUND: 'Reembolso',
  TRANSFER: 'Transferencia',
  INVESTMENT_BUY: 'Compra de inversión',
  INVESTMENT_SELL: 'Venta de inversión',
  ADJUSTMENT: 'Ajuste'
}
const STATUS_LABEL: Record<TxStatus, string> = { CONFIRMED: 'Confirmado', PENDING_REVIEW: 'Pendiente de revisar', CANCELLED: 'Anulado' }
const GOAL_STATUS_LABEL: Record<Goal['status'], string> = { ACTIVE: 'Activo', PAUSED: 'En pausa', COMPLETED: 'Completado', CANCELLED: 'Cancelado' }
const GOAL_TYPE_LABEL: Record<Goal['type'], string> = { REQUIRED: 'Obligatorio', PLANNED: 'Planificado', OPTIONAL: 'Opcional', LONG_TERM: 'Largo plazo' }
const PRIORITY_LABEL: Record<Goal['priority'], string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' }

/** Tipos que el asistente puede crear o editar (con categoría). */
const EDITABLE_TYPES = ['INCOME', 'EXPENSE', 'REFUND'] as const
const TYPE_ARG = z.enum(['gasto', 'ingreso', 'reembolso'])
const TYPE_OF_ARG: Record<z.infer<typeof TYPE_ARG>, (typeof EDITABLE_TYPES)[number]> = { gasto: 'EXPENSE', ingreso: 'INCOME', reembolso: 'REFUND' }
const STATUS_ARG = z.enum(['confirmado', 'pendiente', 'anulado'])
const STATUS_OF_ARG: Record<z.infer<typeof STATUS_ARG>, TxStatus> = { confirmado: 'CONFIRMED', pendiente: 'PENDING_REVIEW', anulado: 'CANCELLED' }
const ACTION_IDS_MAX = 50

// ---------------------------------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------------------------------

function category(s: AppState, q: string | number): Category {
  return resolveByName(s.ctx().categories, q, (c) => c.id, (c) => c.name, 'la categoría')
}

function account(s: AppState, q: string | number): Account {
  return resolveByName(s.ctx().accounts, q, (a) => a.id, (a) => a.name, 'la cuenta')
}

function catName(s: AppState, id: string | null | undefined): string | null {
  return id ? (s.ctx().categoryById.get(id)?.name ?? id) : null
}

function accName(s: AppState, id: string | null | undefined): string | null {
  return id ? (s.ctx().accountById.get(id)?.name ?? id) : null
}

function txLabel(t: Pick<Transaction, 'description' | 'amountCents' | 'date'>): string {
  return `${t.description} · ${eur(t.amountCents)} · ${fecha(t.date)}`
}

function existingTx(s: AppState, id: string): Transaction {
  const t = s.ctx().txById.get(id)
  if (!t) throw new UserError(`El movimiento ${id} no existe.`)
  return t
}

/** Un movimiento que el asistente puede editar (ni transferencias ni apuntes de inversión). */
function editableTx(s: AppState, id: string): Transaction {
  const t = existingTx(s, id)
  if (t.type === 'TRANSFER') throw new UserError(`${id} es una transferencia: se edita desde su formulario en la app.`)
  if (t.investmentOpId) throw new UserError(`${id} lo genera una operación de inversión: se gestiona desde Inversiones.`)
  return t
}

/** El movimiento tal cual, como entrada de `finanzas:tx.save` (para editarlo sin perder nada). */
function txToInput(t: Transaction): TxInput {
  return {
    id: t.id,
    date: t.date,
    accountId: t.accountId,
    description: t.description,
    amountCents: t.amountCents,
    currency: t.currency,
    type: t.type,
    categoryId: t.categoryId,
    subcategoryId: t.subcategoryId,
    merchant: t.merchant,
    recurringId: t.recurringId,
    goalId: t.goalId,
    linkedTxId: t.linkedTxId,
    status: t.status,
    nature: t.nature,
    source: t.source,
    notes: t.notes
  }
}

/** Valida la entrada con el esquema del handler y con las reglas de siempre (sin escribir). */
function checkTxInput(s: AppState, input: TxInput): string[] {
  const r = TxInput.safeParse(input)
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? 'Movimiento no válido.')
  const d = r.data
  const draft: TxDraft = {
    id: d.id,
    date: d.date,
    accountId: d.accountId,
    description: d.description,
    amountCents: d.amountCents,
    type: d.type,
    categoryId: d.categoryId,
    subcategoryId: d.subcategoryId,
    goalId: d.goalId,
    recurringId: d.recurringId,
    linkedTxId: d.linkedTxId,
    status: d.status,
    transferId: null
  }
  const v = validateTransaction(s.ctx(), draft)
  if (v.errors.length) throw new UserError(v.errors.map((e) => e.message).join(' '))
  return v.warnings.map((w) => w.message)
}

interface TxView {
  date: string
  description: string
  amountCents: number
  type: TxType
  categoryId: string | null
  accountId: string
  status: TxStatus
  merchant: string | null
  notes: string | null
}

function txFields(s: AppState, before: TxView | null, after: TxView | null): AiFieldDiff[] {
  const rows: Array<[string, (t: TxView) => string | null]> = [
    ['Fecha', (t) => fecha(t.date)],
    ['Descripción', (t) => t.description],
    ['Importe', (t) => eur(t.amountCents)],
    ['Tipo', (t) => TYPE_LABEL[t.type]],
    ['Categoría', (t) => catName(s, t.categoryId)],
    ['Cuenta', (t) => accName(s, t.accountId)],
    ['Estado', (t) => STATUS_LABEL[t.status]],
    ['Comercio', (t) => t.merchant],
    ['Notas', (t) => t.notes]
  ]
  const out: AiFieldDiff[] = []
  for (const [label, get] of rows) {
    const b = before ? get(before) : null
    const a = after ? get(after) : null
    if (before && after && b === a) continue
    if (b === null && a === null) continue
    out.push({ label, before: b, after: a })
  }
  return out
}

function viewOfInput(i: TxInput): TxView {
  return {
    date: i.date,
    description: i.description,
    amountCents: i.amountCents,
    type: i.type,
    categoryId: i.categoryId ?? null,
    accountId: i.accountId,
    status: i.status ?? 'CONFIRMED',
    merchant: i.merchant ?? null,
    notes: i.notes ?? null
  }
}

const txFingerprint = (ctx: CoreContext, change: AiChange) =>
  change.entityId ? fingerprintOf(st(ctx).ctx().txById.get(change.entityId) ?? null) : null

/**
 * Escribe como el handler: una operación de la cola con la misma etiqueta y la misma función. Antes,
 * en el mismo turno, `guard` comprueba que el registro sigue como al proponer el cambio.
 */
function write<T>(ctx: CoreContext, guard: () => void, name: string, fn: (s: AppState) => T): Promise<T> {
  const s = st(ctx)
  return ctx.queue.enqueue(`finanzas:${name}`, () => {
    guard()
    return fn(s)
  })
}

function txUpdateDraft(s: AppState, before: Transaction, input: TxInput, extraWarnings: string[] = []): AiChangeDraft {
  const warnings = [...extraWarnings, ...checkTxInput(s, input)]
  const fields = txFields(s, before, viewOfInput(input))
  if (warnings.length) fields.push({ label: 'Aviso', before: null, after: warnings.join(' ') })
  return {
    entity: 'transaction',
    entityId: before.id,
    op: 'update',
    label: txLabel(before),
    fields,
    payload: input,
    // La huella, del movimiento tal como está guardado (no de la fila del listado, que lleva avisos).
    fingerprint: fingerprintOf(s.ctx().txById.get(before.id) ?? null)
  }
}

// ---------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------

const MonthArgs = z.object({ mes: monthKey.optional() }).strict()

function summaryView(s: AppState, month: string) {
  const ctx = s.ctx()
  const m = monthSummary(ctx, month)
  const byCat = Object.entries(m.expensesByCategory)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => a[1] - b[1])
  const byGroup = Object.entries(m.expensesByGroup)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => a[1] - b[1])
  return {
    mes: month,
    nombreMes: formatMonth(month, true),
    ingresos: eur(m.incomeCents),
    gastos: eur(-m.totalExpensesCents),
    flujoNeto: eur(m.netCashFlowCents),
    tasaAhorro: pct(m.savingsRate),
    aAhorro: eur(m.toSavingsCents),
    aInversion: eur(m.toInvestmentsCents),
    gastosFijos: eur(-m.fixedCents),
    gastosVariables: eur(-m.variableCents),
    gastosExtraordinarios: eur(-m.extraordinaryCents),
    movimientos: m.txCount,
    gastosPorCategoria: byCat.slice(0, 20).map(([id, v]) => ({ categoria: id === NO_GROUP ? 'Sin categoría' : (catName(s, id) ?? id), gastado: eur(-v) })),
    gastosPorGrupo: byGroup.slice(0, 12).map(([id, v]) => ({ grupo: id === NO_GROUP ? 'Sin grupo' : (ctx.groupById.get(id)?.name ?? id), gastado: eur(-v) }))
  }
}

const SearchArgs = z
  .object({
    texto: z.string().trim().max(100).optional(),
    categoria: ref.optional(),
    cuenta: ref.optional(),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
    mes: monthKey.optional(),
    tipo: z.enum(['gasto', 'ingreso', 'reembolso', 'transferencia']).optional(),
    estado: STATUS_ARG.optional(),
    importeMin: euros.optional(),
    importeMax: euros.optional(),
    limite: z.number().int().min(1).max(AI_TX_SEARCH_MAX).optional()
  })
  .strict()

type SearchArgs = z.infer<typeof SearchArgs>

/** Movimientos que cumplen los filtros (con `listTransactions`, el mismo listado de la página). */
function search(s: AppState, a: SearchArgs): Transaction[] {
  const tipo = a.tipo === 'transferencia' ? 'TRANSFER' : a.tipo ? TYPE_OF_ARG[a.tipo] : undefined
  const r = txs.listTransactions(s, {
    search: a.texto || undefined,
    categoryId: a.categoria !== undefined ? category(s, a.categoria).id : undefined,
    accountId: a.cuenta !== undefined ? account(s, a.cuenta).id : undefined,
    from: a.desde,
    to: a.hasta,
    month: a.mes,
    type: tipo,
    status: a.estado ? STATUS_OF_ARG[a.estado] : undefined,
    sort: 'date',
    dir: 'desc'
  })
  const min = a.importeMin !== undefined ? eurosToCents(Math.abs(a.importeMin)) : null
  const max = a.importeMax !== undefined ? eurosToCents(Math.abs(a.importeMax)) : null
  return r.rows.filter((t) => (min === null || Math.abs(t.amountCents) >= min) && (max === null || Math.abs(t.amountCents) <= max))
}

function txRow(s: AppState, t: Transaction) {
  return {
    id: t.id,
    fecha: t.date,
    descripcion: t.description,
    importe: eur(t.amountCents),
    tipo: TYPE_LABEL[t.type],
    categoria: catName(s, t.categoryId),
    cuenta: accName(s, t.accountId),
    ...(t.status !== 'CONFIRMED' ? { estado: STATUS_LABEL[t.status] } : {}),
    ...(t.merchant ? { comercio: t.merchant } : {})
  }
}

const NoArgs = z.object({}).strict()

const readTools: AiToolDef[] = [
  readTool<CoreContext, z.infer<typeof MonthArgs>>({
    name: 'finanzas_resumen_mes',
    label: 'Consultando el resumen del mes',
    description:
      'Resumen de un mes (por defecto el actual): ingresos, gastos (en positivo), flujo neto, tasa de ahorro, gastos por categoría y por grupo, y el mismo resumen del mes anterior para comparar.',
    parameters: params({ mes: { type: 'string', description: 'Mes AAAA-MM (opcional).' } }),
    args: MonthArgs,
    run: (ctx, a) => {
      const s = st(ctx)
      const month = a.mes ?? monthOf(s.today())
      const prev = summaryView(s, addMonthsToMonth(month, -1))
      return {
        ...summaryView(s, month),
        ...(month === monthOf(s.today()) ? { nota: 'Mes en curso: aún no está completo.' } : {}),
        mesAnterior: { mes: prev.mes, ingresos: prev.ingresos, gastos: prev.gastos, flujoNeto: prev.flujoNeto, tasaAhorro: prev.tasaAhorro }
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'finanzas_alertas',
    label: 'Revisando los avisos de finanzas',
    description: 'Avisos que calcula la app: movimientos por revisar, presupuestos superados, objetivos con retraso, liquidez baja, recurrentes sin registrar…',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const all = computeAlerts(st(ctx).ctx())
      const l = limited(all, 30)
      return { avisos: l.items.map((x) => ({ nivel: x.level, texto: x.text })), total: l.total }
    }
  }),

  readTool<CoreContext, z.infer<typeof MonthArgs>>({
    name: 'finanzas_presupuestos',
    label: 'Consultando los presupuestos',
    description: 'Presupuestos de un mes (por defecto el actual) por categoría: presupuestado, gastado, restante, porcentaje usado y estado.',
    parameters: params({ mes: { type: 'string', description: 'Mes AAAA-MM (opcional).' } }),
    args: MonthArgs,
    run: (ctx, a) => {
      const s = st(ctx)
      const month = a.mes ?? monthOf(s.today())
      const r = planning.getBudgetReport(s, month)
      const lines = r.lines.filter((l) => l.budgetCents !== null || l.spentCents !== 0)
      const shown = limited(lines, 40)
      return {
        mes: month,
        transcurridoDelMes: pct(r.elapsedRatio),
        totalPresupuestado: eur(r.totalBudgetCents),
        gastadoEnLoPresupuestado: eur(r.totalSpentBudgetedCents),
        gastadoTotal: eur(r.totalSpentCents),
        usado: pct(r.usedPct),
        lineas: shown.items.map((l) => ({
          categoriaId: l.categoryId,
          categoria: catName(s, l.categoryId),
          presupuesto: l.budgetCents === null ? null : eur(l.budgetCents),
          gastado: eur(l.spentCents),
          restante: l.remainingCents === null ? null : eur(l.remainingCents),
          usado: pct(l.usedPct),
          estado: l.state
        })),
        ...(shown.recortado ? { recortado: `Solo ${shown.items.length} de ${shown.total} líneas.` } : {})
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'finanzas_objetivos',
    label: 'Consultando los objetivos de ahorro',
    description: 'Objetivos de ahorro con su progreso: objetivo, ahorrado, lo que falta, fecha límite, lo que hace falta al mes y estado de salud.',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const s = st(ctx)
      const l = limited(planning.listGoals(s), 30)
      return {
        objetivos: l.items.map(({ goal: g, progress: p }) => ({
          id: g.id,
          nombre: g.name,
          tipo: GOAL_TYPE_LABEL[g.type],
          prioridad: PRIORITY_LABEL[g.priority],
          estado: GOAL_STATUS_LABEL[g.status],
          objetivo: g.targetCents === null ? null : eur(g.targetCents),
          ahorrado: eur(p.currentCents),
          falta: p.remainingCents === null ? null : eur(p.remainingCents),
          progreso: pct(p.progress),
          fechaLimite: g.deadline,
          necesitaAlMes: p.monthlyNeededCents === null ? null : eur(p.monthlyNeededCents),
          ritmoMensual: eur(p.paceMonthlyCents),
          fechaPrevista: p.projectedDate,
          salud: GOAL_HEALTH_LABEL[p.health]
        })),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, { meses?: number }>({
    name: 'finanzas_patrimonio',
    label: 'Consultando el patrimonio',
    description: 'Evolución del patrimonio a fin de cada mes (el mes en curso, a hoy): patrimonio neto, liquidez, ahorro, inversiones, deudas y cambio frente al mes anterior.',
    parameters: params({ meses: { type: 'integer', description: 'Últimos N meses (de 1 a 36; por defecto 12).' } }),
    args: z.object({ meses: z.number().int().min(1).max(36).optional() }).strict(),
    run: (ctx, a) => {
      const s = st(ctx)
      const series = netWorthSeries(s.ctx())
      return {
        meses: series.slice(-(a.meses ?? 12)).map((p) => ({
          mes: p.month,
          patrimonio: eur(p.netWorthCents),
          liquidez: eur(p.liquidCents),
          ahorro: eur(p.savingsCents),
          inversiones: eur(p.investmentsCents),
          deudas: eur(p.liabilitiesCents),
          cambio: p.changeCents === null ? null : eur(p.changeCents)
        }))
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'finanzas_categorias',
    label: 'Consultando las categorías',
    description: 'Categorías con su id, grupo y si son de gasto o de ingreso (para resolver nombres a ids).',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const c = st(ctx).ctx()
      const l = limited(c.categories, 200)
      return {
        categorias: l.items.map((x) => {
          const g = c.groupById.get(x.groupId)
          return { id: x.id, nombre: x.name, grupo: g?.name ?? null, de: g?.kind === 'INCOME' ? 'ingreso' : 'gasto', ...(x.active ? {} : { inactiva: true }) }
        }),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'finanzas_cuentas',
    label: 'Consultando las cuentas',
    description: 'Cuentas con su id, tipo, si están activas y su saldo de hoy.',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const c = st(ctx).ctx()
      const bal = new Map(allBalances(c).map((b) => [b.accountId, b.balanceCents]))
      const l = limited(c.accounts, 100)
      return {
        cuentas: l.items.map((x) => ({ id: x.id, nombre: x.name, tipo: x.type, saldo: eur(bal.get(x.id) ?? 0), ...(x.active ? {} : { inactiva: true }) })),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, SearchArgs>({
    name: 'finanzas_movimientos_buscar',
    label: 'Buscando movimientos',
    description: `Busca movimientos con filtros (texto en descripción, comercio, notas, categoría o importe; categoría; cuenta; fechas; mes; tipo; estado; importe mínimo y máximo en euros, sin signo). Devuelve como mucho ${AI_TX_SEARCH_MAX}, de los más recientes a los más antiguos, con el total de coincidencias y su suma.`,
    parameters: params({
      texto: { type: 'string' },
      categoria: { type: 'string', description: 'Id o nombre de la categoría.' },
      cuenta: { type: 'string', description: 'Id o nombre de la cuenta.' },
      desde: { type: 'string', description: 'AAAA-MM-DD' },
      hasta: { type: 'string', description: 'AAAA-MM-DD' },
      mes: { type: 'string', description: 'AAAA-MM' },
      tipo: { type: 'string', enum: ['gasto', 'ingreso', 'reembolso', 'transferencia'] },
      estado: { type: 'string', enum: ['confirmado', 'pendiente', 'anulado'] },
      importeMin: { type: 'number' },
      importeMax: { type: 'number' },
      limite: { type: 'integer', description: `De 1 a ${AI_TX_SEARCH_MAX} (por defecto 20).` }
    }),
    args: SearchArgs,
    run: (ctx, a) => {
      const s = st(ctx)
      const found = search(s, a)
      const l = limited(found, a.limite ?? 20)
      const sum = found.filter((t) => t.status !== 'CANCELLED').reduce((acc, t) => acc + t.amountCents, 0)
      return {
        coincidencias: l.total,
        suma: eur(sum),
        movimientos: l.items.map((t) => txRow(s, t)),
        ...(l.recortado ? { recortado: `Solo los ${l.items.length} más recientes de ${l.total}.` } : {})
      }
    }
  })
]

// ---------------------------------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------------------------------

const CreateTxArgs = z
  .object({
    fecha: isoDate,
    descripcion: z.string().trim().min(1).max(200),
    importe: euros.refine((v) => v !== 0, 'El importe no puede ser 0'),
    tipo: TYPE_ARG,
    categoria: ref,
    cuenta: ref.optional(),
    comercio: z.string().trim().max(200).optional(),
    notas: z.string().trim().max(2000).optional(),
    estado: STATUS_ARG.optional()
  })
  .strict()

const EditTxArgs = z
  .object({
    id: z.string().trim().min(1),
    fecha: isoDate.optional(),
    descripcion: z.string().trim().min(1).max(200).optional(),
    importe: euros.refine((v) => v !== 0, 'El importe no puede ser 0').optional(),
    tipo: TYPE_ARG.optional(),
    categoria: ref.optional(),
    cuenta: ref.optional(),
    comercio: z.string().trim().max(200).nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional()
  })
  .strict()

const IdsArgs = z.array(z.string().trim().min(1)).min(1).max(ACTION_IDS_MAX)

const RecatArgs = z
  .object({
    categoriaNueva: ref,
    texto: z.string().trim().min(1).max(100).optional(),
    categoriaActual: ref.optional(),
    cuenta: ref.optional(),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
    tipo: z.enum(['gasto', 'ingreso', 'reembolso']).optional(),
    importeMin: euros.optional(),
    importeMax: euros.optional()
  })
  .strict()
  .refine((a) => a.texto || a.categoriaActual !== undefined || a.cuenta !== undefined || a.desde || a.hasta, {
    message: 'Indica al menos un criterio (texto, categoría actual, cuenta o fechas).'
  })

const BudgetArgs = z
  .object({
    mes: monthKey,
    categoria: ref,
    importe: z.number().finite().min(0).nullable(),
    alertaPct: z.number().int().min(1).max(100).nullable().optional()
  })
  .strict()

const GoalArgs = z
  .object({
    id: z.string().trim().min(1).optional(),
    nombre: z.string().trim().min(1).max(200).optional(),
    tipo: z.enum(GOAL_TYPES).optional(),
    prioridad: z.enum(PRIORITIES).optional(),
    objetivo: z.number().finite().min(0).nullable().optional(),
    fechaLimite: isoDate.nullable().optional(),
    estado: z.enum(GOAL_STATUSES).optional(),
    aportacionMensual: z.number().finite().min(0).nullable().optional(),
    cuentaVinculada: ref.nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional()
  })
  .strict()

function recatCriterion(s: AppState, a: z.infer<typeof RecatArgs>, target: Category): string {
  const parts: string[] = []
  if (a.texto) parts.push(`cuya descripción o comercio contiene «${a.texto}»`)
  if (a.categoriaActual !== undefined) parts.push(`de «${category(s, a.categoriaActual).name}»`)
  if (a.cuenta !== undefined) parts.push(`de la cuenta «${account(s, a.cuenta).name}»`)
  if (a.desde && a.hasta) parts.push(`del ${fecha(a.desde)} al ${fecha(a.hasta)}`)
  else if (a.desde) parts.push(`desde el ${fecha(a.desde)}`)
  else if (a.hasta) parts.push(`hasta el ${fecha(a.hasta)}`)
  const min = a.importeMin !== undefined ? eur(eurosToCents(Math.abs(a.importeMin))) : null
  const max = a.importeMax !== undefined ? eur(eurosToCents(Math.abs(a.importeMax))) : null
  if (min && max) parts.push(`de entre ${min} y ${max}`)
  else if (min) parts.push(`de ${min} o más`)
  else if (max) parts.push(`de hasta ${max}`)
  if (a.tipo) parts.push(`(${a.tipo === 'gasto' ? 'gastos' : a.tipo === 'ingreso' ? 'ingresos' : 'reembolsos'})`)
  return `pasar a «${target.name}» los movimientos ${parts.join(' ')}`
}

function budgetRow(s: AppState, month: string, categoryId: string) {
  return s.ctx().budgets.find((b) => b.month === month && b.categoryId === categoryId) ?? null
}

const actionTools: AiToolDef[] = [
  actionTool<CoreContext, z.infer<typeof CreateTxArgs>>({
    name: 'finanzas_movimiento_crear',
    label: 'Preparando un movimiento nuevo',
    description:
      'Propone apuntar un gasto, ingreso o reembolso. NO lo apunta: Michael lo confirma en la tarjeta. El importe va en euros y sin signo (el signo sale del tipo). Sin cuenta, se usa la última que usó.',
    parameters: params(
      {
        fecha: { type: 'string', description: 'AAAA-MM-DD' },
        descripcion: { type: 'string' },
        importe: { type: 'number', description: 'Euros, sin signo (p. ej. 12.99).' },
        tipo: { type: 'string', enum: ['gasto', 'ingreso', 'reembolso'] },
        categoria: { type: 'string', description: 'Id o nombre de la categoría.' },
        cuenta: { type: 'string', description: 'Id o nombre de la cuenta (opcional).' },
        comercio: { type: 'string' },
        notas: { type: 'string' },
        estado: { type: 'string', enum: ['confirmado', 'pendiente'] }
      },
      ['fecha', 'descripcion', 'importe', 'tipo', 'categoria']
    ),
    args: CreateTxArgs,
    plan: (ctx, a) => {
      const s = st(ctx)
      const type = TYPE_OF_ARG[a.tipo]
      const accountId = a.cuenta !== undefined ? account(s, a.cuenta).id : s.ctx().settings.lastAccountId
      if (!accountId) throw new UserError('Indica la cuenta del movimiento.')
      const input: TxInput = {
        id: null,
        date: a.fecha,
        accountId,
        description: a.descripcion,
        amountCents: eurosToCents(Math.abs(a.importe)) * (expectedSign(type) || 1),
        type,
        categoryId: category(s, a.categoria).id,
        merchant: a.comercio ?? null,
        notes: a.notas ?? null,
        status: a.estado ? STATUS_OF_ARG[a.estado] : 'CONFIRMED',
        source: 'Asistente'
      }
      const warnings = checkTxInput(s, input)
      const fields = txFields(s, null, viewOfInput(input))
      if (warnings.length) fields.push({ label: 'Aviso', before: null, after: warnings.join(' ') })
      return {
        criterion: null,
        changes: [{ entity: 'transaction', entityId: null, op: 'create', label: txLabel(input), fields, payload: input, fingerprint: null }]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'tx.save', (s) => txs.saveTransaction(s, change.payload as TxInput))
    },
    fingerprint: () => null
  }),

  actionTool<CoreContext, z.infer<typeof EditTxArgs>>({
    name: 'finanzas_movimiento_editar',
    label: 'Preparando un cambio en un movimiento',
    description:
      'Propone cambiar campos de un movimiento (fecha, descripción, importe en euros sin signo, tipo, categoría, cuenta, comercio, notas). Solo cambian los que indiques. NO lo cambia: Michael lo confirma. Las transferencias y los apuntes de inversión no se editan aquí.',
    parameters: params(
      {
        id: { type: 'string', description: 'Id del movimiento (de finanzas_movimientos_buscar).' },
        fecha: { type: 'string' },
        descripcion: { type: 'string' },
        importe: { type: 'number' },
        tipo: { type: 'string', enum: ['gasto', 'ingreso', 'reembolso'] },
        categoria: { type: 'string' },
        cuenta: { type: 'string' },
        comercio: { type: 'string' },
        notas: { type: 'string' }
      },
      ['id']
    ),
    args: EditTxArgs,
    plan: (ctx, a) => {
      const s = st(ctx)
      const t = editableTx(s, a.id)
      const input = txToInput(t)
      if (a.fecha) input.date = a.fecha
      if (a.descripcion) input.description = a.descripcion
      if (a.tipo) input.type = TYPE_OF_ARG[a.tipo]
      if (a.importe !== undefined || a.tipo) {
        const abs = a.importe !== undefined ? eurosToCents(Math.abs(a.importe)) : Math.abs(t.amountCents)
        // El signo sale del tipo; los que no tienen signo fijo (ajustes) conservan el del original.
        const sign = expectedSign(input.type) || Math.sign(t.amountCents) || 1
        input.amountCents = abs * sign
      }
      if (a.categoria !== undefined) {
        const c = category(s, a.categoria).id
        if (c !== t.categoryId) input.subcategoryId = null
        input.categoryId = c
      }
      if (a.cuenta !== undefined) input.accountId = account(s, a.cuenta).id
      if (a.comercio !== undefined) input.merchant = a.comercio
      if (a.notas !== undefined) input.notes = a.notas
      const draft = txUpdateDraft(s, t, input)
      return { criterion: null, changes: draft.fields.length ? [draft] : [] }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'tx.save', (s) => txs.saveTransaction(s, change.payload as TxInput))
    },
    fingerprint: txFingerprint
  }),

  actionTool<CoreContext, { ids: string[]; categoria: string | number }>({
    name: 'finanzas_movimientos_categoria',
    label: 'Preparando un cambio de categoría',
    description:
      'Propone cambiar la categoría de unos movimientos concretos (por id), cada uno por separado. Para aplicar el mismo cambio a todos los que cumplen un criterio (p. ej. «los de Steam a Ocio»), usa finanzas_movimientos_recategorizar.',
    parameters: params(
      { ids: { type: 'array', items: { type: 'string' }, description: `Ids de los movimientos (máx. ${ACTION_IDS_MAX}).` }, categoria: { type: 'string' } },
      ['ids', 'categoria']
    ),
    args: z.object({ ids: IdsArgs, categoria: ref }).strict(),
    plan: (ctx, a) => {
      const s = st(ctx)
      const c = category(s, a.categoria)
      const changes: AiChangeDraft[] = []
      for (const id of [...new Set(a.ids)]) {
        const t = editableTx(s, id)
        if (t.categoryId === c.id) continue
        changes.push(txUpdateDraft(s, t, { ...txToInput(t), categoryId: c.id, subcategoryId: null }))
      }
      return { criterion: null, changes }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'tx.save', (s) => txs.saveTransaction(s, change.payload as TxInput))
    },
    fingerprint: txFingerprint
  }),

  actionTool<CoreContext, z.infer<typeof RecatArgs>>({
    name: 'finanzas_movimientos_recategorizar',
    label: 'Buscando movimientos para recategorizar',
    description:
      'Propone pasar a una categoría TODOS los gastos, ingresos o reembolsos que cumplen un criterio (texto, categoría actual, cuenta, fechas, tipo, importe). Con 3 o más, Michael los confirma todos a la vez en una ventana. NO cambia nada por sí sola. No toca transferencias ni apuntes de inversión.',
    parameters: params(
      {
        categoriaNueva: { type: 'string', description: 'Id o nombre de la categoría de destino.' },
        texto: { type: 'string', description: 'Texto que tiene que estar en la descripción o el comercio.' },
        categoriaActual: { type: 'string' },
        cuenta: { type: 'string' },
        desde: { type: 'string' },
        hasta: { type: 'string' },
        tipo: { type: 'string', enum: ['gasto', 'ingreso', 'reembolso'] },
        importeMin: { type: 'number' },
        importeMax: { type: 'number' }
      },
      ['categoriaNueva']
    ),
    args: RecatArgs,
    plan: (ctx, a): AiActionPlan => {
      const s = st(ctx)
      const target = category(s, a.categoriaNueva)
      // El texto solo se busca en la descripción y el comercio («los de Steam»), no en la categoría, las
      // notas ni el importe como el buscador general: así el criterio dice exactamente qué se cambia.
      const q = a.texto ? norm(a.texto) : ''
      const found = search(s, {
        categoria: a.categoriaActual,
        cuenta: a.cuenta,
        desde: a.desde,
        hasta: a.hasta,
        tipo: a.tipo,
        importeMin: a.importeMin,
        importeMax: a.importeMax
      }).filter(
        (t) =>
          (EDITABLE_TYPES as readonly string[]).includes(t.type) &&
          !t.investmentOpId &&
          t.categoryId !== target.id &&
          (!q || norm(`${t.description} ${t.merchant ?? ''}`).includes(q))
      )
      const changes: AiChangeDraft[] = []
      let skipped = 0
      let firstError: string | null = null
      for (const t of found) {
        try {
          changes.push(txUpdateDraft(s, t, { ...txToInput(t), categoryId: target.id, subcategoryId: null }))
        } catch (e) {
          skipped++
          firstError ??= `${txLabel(t)}: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      if (!changes.length && firstError) throw new UserError(`No se puede: ${firstError}`)
      const omitted = skipped ? ` (${skipped === 1 ? 'se omite 1 que no admite' : `se omiten ${skipped} que no admiten`} el cambio; p. ej. ${firstError})` : ''
      return { criterion: recatCriterion(s, a, target) + omitted, changes }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'tx.save', (s) => txs.saveTransaction(s, change.payload as TxInput))
    },
    fingerprint: txFingerprint
  }),

  actionTool<CoreContext, { ids: string[]; estado: z.infer<typeof STATUS_ARG> }>({
    name: 'finanzas_movimientos_estado',
    label: 'Preparando un cambio de estado',
    description:
      'Propone cambiar el estado de unos movimientos (confirmado, pendiente de revisar o anulado), cada uno por separado. En una transferencia cambian sus dos apuntes. NO cambia nada: Michael lo confirma.',
    parameters: params(
      { ids: { type: 'array', items: { type: 'string' } }, estado: { type: 'string', enum: ['confirmado', 'pendiente', 'anulado'] } },
      ['ids', 'estado']
    ),
    args: z.object({ ids: IdsArgs, estado: STATUS_ARG }).strict(),
    plan: (ctx, a) => {
      const s = st(ctx)
      const status = STATUS_OF_ARG[a.estado]
      const changes: AiChangeDraft[] = []
      for (const id of [...new Set(a.ids)]) {
        const t = existingTx(s, id)
        if (t.investmentOpId) throw new UserError(`${id} lo genera una operación de inversión: se gestiona desde Inversiones.`)
        if (t.status === status) continue
        changes.push({
          entity: 'transaction',
          entityId: t.id,
          op: 'update',
          label: txLabel(t),
          fields: [{ label: 'Estado', before: STATUS_LABEL[t.status], after: STATUS_LABEL[status] }],
          payload: { ids: [t.id], status },
          fingerprint: fingerprintOf(t)
        })
      }
      return { criterion: null, changes }
    },
    apply: async (ctx, change, guard) => {
      const p = change.payload as { ids: string[]; status: TxStatus }
      if (!(TX_STATUSES as readonly string[]).includes(p.status)) throw new UserError('Estado no válido.')
      await write(ctx, guard, 'tx.setStatus', (s) => txs.setStatus(s, p.ids, p.status))
    },
    fingerprint: txFingerprint
  }),

  actionTool<CoreContext, { ids: string[] }>({
    name: 'finanzas_movimiento_borrar',
    label: 'Preparando el borrado de movimientos',
    description:
      'Propone borrar movimientos (por id), cada uno por separado. Borrar una transferencia borra sus dos apuntes. NO borra nada: Michael lo confirma. Si solo quiere que no cuente, mejor anularlo con finanzas_movimientos_estado.',
    parameters: params({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']),
    args: z.object({ ids: IdsArgs }).strict(),
    plan: (ctx, a) => {
      const s = st(ctx)
      const changes: AiChangeDraft[] = [...new Set(a.ids)].map((id) => {
        const t = existingTx(s, id)
        if (t.investmentOpId) throw new UserError(`${id} lo genera una operación de inversión: se gestiona desde Inversiones.`)
        const fields = txFields(s, viewOfInput(txToInput(t)), null)
        if (t.transferId) fields.push({ label: 'Aviso', before: null, after: 'Es una transferencia: se borran sus dos apuntes.' })
        return { entity: 'transaction', entityId: t.id, op: 'delete', label: txLabel(t), fields, payload: { id: t.id }, fingerprint: fingerprintOf(t) }
      })
      return { criterion: null, changes }
    },
    apply: async (ctx, change, guard) => {
      const p = change.payload as { id: string }
      await write(ctx, guard, 'tx.delete', (s) => txs.deleteTransaction(s, p.id))
    },
    fingerprint: txFingerprint
  }),

  actionTool<CoreContext, z.infer<typeof BudgetArgs>>({
    name: 'finanzas_presupuesto_fijar',
    label: 'Preparando un presupuesto',
    description:
      'Propone fijar (o quitar, con importe null) el presupuesto de una categoría en un mes. Importe en euros. NO lo cambia: Michael lo confirma.',
    parameters: params(
      {
        mes: { type: 'string', description: 'AAAA-MM' },
        categoria: { type: 'string', description: 'Id o nombre de la categoría.' },
        importe: { type: ['number', 'null'], description: 'Euros al mes; null para quitar el presupuesto.' },
        alertaPct: { type: ['integer', 'null'], description: 'Aviso al llegar a este % (sin poner: se queda como está; null: se quita).' }
      },
      ['mes', 'categoria', 'importe']
    ),
    args: BudgetArgs,
    plan: (ctx, a) => {
      const s = st(ctx)
      const c = category(s, a.categoria)
      const before = budgetRow(s, a.mes, c.id)
      const payload = { month: a.mes, categoryId: c.id, amountCents: a.importe === null ? null : eurosToCents(a.importe), alertPct: a.alertaPct === undefined ? (before?.alertPct ?? null) : a.alertaPct }
      const r = BudgetSetInput.safeParse(payload)
      if (!r.success) throw new UserError(r.error.issues[0]?.message ?? 'Presupuesto no válido.')
      if (!before && payload.amountCents === null) return { criterion: null, changes: [] }
      // Solo lo que cambia (al crear, todo).
      const fields: AiFieldDiff[] = []
      if (!before || before.amountCents !== payload.amountCents)
        fields.push({ label: 'Presupuesto', before: before ? eur(before.amountCents) : null, after: payload.amountCents === null ? null : eur(payload.amountCents) })
      if ((before?.alertPct ?? null) !== payload.alertPct && payload.amountCents !== null)
        fields.push({ label: 'Aviso al', before: before?.alertPct ? `${before.alertPct} %` : null, after: payload.alertPct ? `${payload.alertPct} %` : null })
      if (!fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'budget',
            entityId: before?.id ?? null,
            op: !before ? 'create' : payload.amountCents === null ? 'delete' : 'update',
            label: `Presupuesto de ${c.name} · ${formatMonth(a.mes, true)}`,
            fields,
            payload,
            fingerprint: fingerprintOf(before)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      const p = change.payload as { month: string; categoryId: string; amountCents: number | null; alertPct: number | null }
      await write(ctx, guard, 'budgets.set', (s) => planning.setBudget(s, p))
    },
    fingerprint: (ctx, change) => {
      const p = change.payload as { month: string; categoryId: string }
      return fingerprintOf(budgetRow(st(ctx), p.month, p.categoryId))
    }
  }),

  actionTool<CoreContext, z.infer<typeof GoalArgs>>({
    name: 'finanzas_objetivo_guardar',
    label: 'Preparando un objetivo de ahorro',
    description:
      'Propone crear un objetivo de ahorro (sin id) o cambiar uno (con id; solo cambian los campos que indiques). Importes en euros. Tipos: REQUIRED, PLANNED, OPTIONAL, LONG_TERM. Prioridad: HIGH, MEDIUM, LOW. Estado: ACTIVE, PAUSED, COMPLETED, CANCELLED. NO lo guarda: Michael lo confirma.',
    parameters: params({
      id: { type: 'string' },
      nombre: { type: 'string' },
      tipo: { type: 'string', enum: [...GOAL_TYPES] },
      prioridad: { type: 'string', enum: [...PRIORITIES] },
      objetivo: { type: 'number', description: 'Euros.' },
      fechaLimite: { type: 'string', description: 'AAAA-MM-DD' },
      estado: { type: 'string', enum: [...GOAL_STATUSES] },
      aportacionMensual: { type: 'number', description: 'Euros al mes previstos.' },
      cuentaVinculada: { type: 'string', description: 'Id o nombre de la cuenta hucha (opcional).' },
      notas: { type: 'string' }
    }),
    args: GoalArgs,
    plan: (ctx, a) => {
      const s = st(ctx)
      const before = a.id ? s.ctx().goals.find((g) => g.id === a.id) : undefined
      if (a.id && !before) throw new UserError(`El objetivo ${a.id} no existe.`)
      if (!before && !a.nombre) throw new UserError('Para crear un objetivo, indica el nombre.')
      const cents = (v: number | null | undefined, prev: number | null) => (v === undefined ? prev : v === null ? null : eurosToCents(v))
      const payload: GoalInput = {
        id: before?.id ?? null,
        name: a.nombre ?? before!.name,
        type: a.tipo ?? before?.type ?? 'PLANNED',
        priority: a.prioridad ?? before?.priority ?? 'MEDIUM',
        targetCents: cents(a.objetivo, before?.targetCents ?? null),
        deadline: a.fechaLimite === undefined ? (before?.deadline ?? null) : a.fechaLimite,
        status: a.estado ?? before?.status ?? 'ACTIVE',
        linkedAccountId:
          a.cuentaVinculada === undefined ? (before?.linkedAccountId ?? null) : a.cuentaVinculada === null ? null : account(s, a.cuentaVinculada).id,
        plannedMonthlyCents: cents(a.aportacionMensual, before?.plannedMonthlyCents ?? null),
        notes: a.notas === undefined ? (before?.notes ?? null) : a.notas,
        sortOrder: before?.sortOrder ?? 0
      }
      const r = GoalInput.safeParse(payload)
      if (!r.success) throw new UserError(r.error.issues[0]?.message ?? 'Objetivo no válido.')
      const rows: Array<[string, (g: GoalInput) => string | null]> = [
        ['Nombre', (g) => g.name],
        ['Tipo', (g) => GOAL_TYPE_LABEL[g.type]],
        ['Prioridad', (g) => PRIORITY_LABEL[g.priority]],
        ['Objetivo', (g) => (g.targetCents == null ? null : eur(g.targetCents))],
        ['Fecha límite', (g) => (g.deadline ? fecha(g.deadline) : null)],
        ['Estado', (g) => GOAL_STATUS_LABEL[g.status ?? 'ACTIVE']],
        ['Cuenta vinculada', (g) => accName(s, g.linkedAccountId)],
        ['Aportación mensual', (g) => (g.plannedMonthlyCents == null ? null : eur(g.plannedMonthlyCents))],
        ['Notas', (g) => g.notes ?? null]
      ]
      const fields: AiFieldDiff[] = []
      for (const [label, get] of rows) {
        const b = before ? get(before) : null
        const v = get(payload)
        if (before && b === v) continue
        if (b === null && v === null) continue
        fields.push({ label, before: b, after: v })
      }
      if (before && !fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'goal',
            entityId: before?.id ?? null,
            op: before ? 'update' : 'create',
            label: `Objetivo «${payload.name}»`,
            fields,
            payload,
            fingerprint: fingerprintOf(before ?? null)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'goals.save', (s) => planning.saveGoal(s, change.payload as GoalInput))
    },
    fingerprint: (ctx, change) => (change.entityId ? fingerprintOf(st(ctx).ctx().goals.find((g) => g.id === change.entityId) ?? null) : null)
  })
]

export const FINANZAS_AI_TOOLS: readonly AiToolDef[] = [...readTools, ...actionTools]
