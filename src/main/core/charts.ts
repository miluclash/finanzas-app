// Gráficos guardados (`core_charts`) y paneles (`core_dashboards`): `core:charts.*` y
// `core:dashboards.*`. Las lecturas son síncronas; las escrituras van por la cola (`core:<acción>`)
// y apuntan su fila en `audit_log` dentro de la misma operación (como los módulos, porque la entrada
// `audit` de la cola se fija al encolar y no tendría el id nuevo).
//
// `charts.data` nunca lanza por una especificación guardada que ya no cumple las reglas (métrica
// borrada, agrupación que ya no admite…): devuelve `{ ok: false, issues }` para que la tarjeta diga
// "Gráfico no válido · Editar" sin romper el panel.
import { buildChartData } from '@shared/core/charts/build'
import { ChartInputSchema, DashboardCardSchema, DashboardCardsSchema, DashboardIdSchema, firstZodMessage } from '@shared/core/charts/schema'
import type { ChartDataResult } from '@shared/core/charts/types'
import { parseSpec } from '@shared/core/charts/validate'
import type {
  ChartInput,
  ChartSpec,
  ChartValidationIssue,
  DashboardCard,
  DashboardId,
  DashboardLayout,
  MetricMeta,
  SavedChart
} from '@shared/core/metrics-types'
import type { ISODate } from '@shared/types'
import { audit } from './audit'
import type { CoreContext } from './context'
import { UserError } from './errors'
import type { CoreMetricsService } from './metrics'

interface ChartRow {
  id: number
  title: string
  module: string
  spec: string
  created_at: string
  updated_at: string
}

/** Gráfico tal como está en la base: la especificación sin validar (puede haber dejado de valer). */
export interface StoredChart extends Omit<SavedChart, 'spec'> {
  spec: unknown
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const rowToChart = (r: ChartRow): StoredChart => ({
  id: r.id,
  title: r.title,
  module: r.module,
  spec: parseJson(r.spec) ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

/** Tarjetas de una fila de panel; las que no tienen el formato esperado se descartan. */
export function readCards(text: string | null | undefined): DashboardCard[] {
  const raw = text == null ? null : parseJson(text)
  if (!Array.isArray(raw)) return []
  const out: DashboardCard[] = []
  for (const c of raw) {
    const r = DashboardCardSchema.safeParse(c)
    if (r.success) out.push(r.data)
  }
  return out
}

/** Módulo de un gráfico: el de sus métricas si todas son del mismo; si no, `core`. */
function moduleOf(spec: ChartSpec, metas: readonly MetricMeta[]): string {
  const mods = new Set(spec.series.map((s) => metas.find((m) => m.id === s.metricId)?.module ?? 'core'))
  return mods.size === 1 ? [...mods][0] : 'core'
}

export interface ChartsServiceOptions {
  /** Fecha de hoy para resolver los rangos (por defecto, `ctx.today()`). */
  now?: () => ISODate
}

export function createChartsService(ctx: CoreContext, metrics: CoreMetricsService, opts: ChartsServiceOptions = {}) {
  const now = opts.now ?? (() => ctx.today())
  const getRow = (id: number) => ctx.db.get<ChartRow>('SELECT * FROM core_charts WHERE id = ?', [id])
  const checkId = (id: unknown): number => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new UserError('Id de gráfico no válido.')
    return id
  }
  const nowIso = () => new Date().toISOString()

  const data = (arg: ChartSpec | number): ChartDataResult => {
    let raw: unknown = arg
    if (typeof arg === 'number') {
      const row = Number.isInteger(arg) && arg > 0 ? getRow(arg) : undefined
      if (!row) return { ok: false, issues: [{ rule: 'metric', message: 'Este gráfico ya no existe.' }] }
      raw = parseJson(row.spec)
      if (raw === undefined) return { ok: false, issues: [{ rule: 'schema', message: 'La configuración del gráfico está dañada.' }] }
    }
    const metas = metrics.list()
    const parsed = parseSpec(raw, metas)
    if (!parsed.ok) return { ok: false, issues: parsed.issues }
    try {
      return { ok: true, data: buildChartData(parsed.spec, metas, (id, q) => metrics.compute(id, q), now()) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const issue: ChartValidationIssue = { rule: 'metric', message: `No se han podido calcular los datos de este gráfico: ${msg}` }
      return { ok: false, issues: [issue] }
    }
  }

  return {
    list: (): StoredChart[] => ctx.db.all<ChartRow>('SELECT * FROM core_charts ORDER BY title COLLATE NOCASE, id').map(rowToChart),

    get: (id: number): StoredChart | null => {
      const row = getRow(checkId(id))
      return row ? rowToChart(row) : null
    },

    /** Crea o actualiza un gráfico. Rechaza con el primer aviso del esquema o de las reglas. */
    save: (input: ChartInput): Promise<SavedChart> => {
      const r = ChartInputSchema.safeParse(input)
      if (!r.success) return Promise.reject(new UserError(firstZodMessage(r.error, 'Gráfico no válido.')))
      const metas = metrics.list()
      const parsed = parseSpec(r.data.spec, metas)
      if (!parsed.ok) return Promise.reject(new UserError(parsed.issues[0].message))
      const spec = parsed.spec
      const title = r.data.title
      const module = moduleOf(spec, metas)
      const id = r.data.id
      return ctx.queue.enqueue('core:charts.save', () => {
        const ts = nowIso()
        const json = JSON.stringify(spec)
        if (id != null) {
          const before = getRow(id)
          if (!before) throw new UserError('Ese gráfico ya no existe.')
          ctx.db.run('UPDATE core_charts SET title = ?, module = ?, spec = ?, updated_at = ? WHERE id = ?', [title, module, json, ts, id])
          audit(ctx.db, 'core_charts', String(id), 'update', `Gráfico «${title}»`, rowToChart(before), { title, module, spec })
          return { id, title, module, spec, createdAt: before.created_at, updatedAt: ts }
        }
        ctx.db.run('INSERT INTO core_charts (title, module, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [title, module, json, ts, ts])
        const newId = ctx.db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id
        audit(ctx.db, 'core_charts', String(newId), 'create', `Gráfico «${title}»`, null, { title, module, spec })
        return { id: newId, title, module, spec, createdAt: ts, updatedAt: ts }
      })
    },

    /** Borra el gráfico y quita sus tarjetas de todos los paneles, en una sola operación. */
    delete: (id: number): Promise<{ id: number; removedCards: number }> => {
      const chartId = checkId(id)
      return ctx.queue.enqueue('core:charts.delete', () => {
        const before = getRow(chartId)
        if (!before) throw new UserError('Ese gráfico ya no existe.')
        ctx.db.run('DELETE FROM core_charts WHERE id = ?', [chartId])
        audit(ctx.db, 'core_charts', String(chartId), 'delete', `Gráfico «${before.title}»`, rowToChart(before), null)
        let removedCards = 0
        const ts = nowIso()
        for (const row of ctx.db.all<{ dashboard_id: string; cards: string }>('SELECT dashboard_id, cards FROM core_dashboards ORDER BY dashboard_id')) {
          const cards = readCards(row.cards)
          const kept = cards.filter((c) => !(c.type === 'chart' && c.ref === String(chartId)))
          if (kept.length === cards.length) continue
          removedCards += cards.length - kept.length
          ctx.db.run('UPDATE core_dashboards SET cards = ?, updated_at = ? WHERE dashboard_id = ?', [JSON.stringify(kept), ts, row.dashboard_id])
          audit(ctx.db, 'core_dashboards', row.dashboard_id, 'update', `Panel ${row.dashboard_id}: sin el gráfico «${before.title}»`, cards, kept)
        }
        return { id: chartId, removedCards }
      })
    },

    data
  }
}

export function createDashboardsService(ctx: CoreContext) {
  const checkDashboard = (id: unknown): DashboardId => {
    const r = DashboardIdSchema.safeParse(id)
    if (!r.success) throw new UserError('Ese panel no existe.')
    return r.data
  }
  const getRow = (id: DashboardId) => ctx.db.get<{ cards: string }>('SELECT cards FROM core_dashboards WHERE dashboard_id = ?', [id])

  return {
    /** La fila tal cual (sin fusionar con el diseño por defecto: eso lo hace la interfaz con `mergeDashboard`). */
    get: (id: DashboardId): DashboardLayout => {
      const dashboardId = checkDashboard(id)
      const row = getRow(dashboardId)
      return { dashboardId, cards: row ? readCards(row.cards) : [], saved: !!row }
    },

    save: (id: DashboardId, cards: DashboardCard[]): Promise<DashboardLayout> => {
      let dashboardId: DashboardId
      try {
        dashboardId = checkDashboard(id)
      } catch (e) {
        return Promise.reject(e)
      }
      const r = DashboardCardsSchema.safeParse(cards)
      if (!r.success) return Promise.reject(new UserError(firstZodMessage(r.error, 'Tarjetas del panel no válidas.')))
      const list = r.data
      return ctx.queue.enqueue('core:dashboards.save', () => {
        for (const c of list)
          if (c.type === 'chart' && !ctx.db.get('SELECT 1 AS x FROM core_charts WHERE id = ?', [Number(c.ref)]))
            throw new UserError('Una de las tarjetas apunta a un gráfico que ya no existe.')
        const before = getRow(dashboardId)
        const json = JSON.stringify(list)
        ctx.db.run(
          `INSERT INTO core_dashboards (dashboard_id, cards, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(dashboard_id) DO UPDATE SET cards = excluded.cards, updated_at = excluded.updated_at`,
          [dashboardId, json, new Date().toISOString()]
        )
        audit(ctx.db, 'core_dashboards', dashboardId, before ? 'update' : 'create', `Panel ${dashboardId}`, before ? readCards(before.cards) : null, list)
        return { dashboardId, cards: list, saved: true }
      })
    },

    /** "Restaurar diseño": borra la fila (el panel vuelve al diseño por defecto). */
    reset: (id: DashboardId): Promise<DashboardLayout> => {
      let dashboardId: DashboardId
      try {
        dashboardId = checkDashboard(id)
      } catch (e) {
        return Promise.reject(e)
      }
      return ctx.queue.enqueue('core:dashboards.reset', () => {
        const before = getRow(dashboardId)
        if (before) {
          ctx.db.run('DELETE FROM core_dashboards WHERE dashboard_id = ?', [dashboardId])
          audit(ctx.db, 'core_dashboards', dashboardId, 'delete', `Panel ${dashboardId}: diseño por defecto`, readCards(before.cards), null)
        }
        return { dashboardId, cards: [], saved: false }
      })
    }
  }
}
