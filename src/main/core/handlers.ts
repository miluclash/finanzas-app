// Handlers IPC del núcleo: información de la app, auditoría, copias de seguridad y carpeta de datos.
// Los de cada módulo los construye su `ipc` (ver registry.ts) y se juntan en la raíz de composición.
// Los de lectura son síncronos y no pasan por la cola; los que escriben (o necesitan turno)
// devuelven una promesa de la cola de escritura.
import type { ChartInput, ChartSpec, DashboardCard, DashboardId, MetricOptionKind, MetricQuery } from '@shared/core/metrics-types'
import { autoBackup, createBackup, listBackups, restoreBackup } from './backup'
import { createChartsService, createDashboardsService } from './charts'
import type { CoreContext } from './context'
import { UserError } from './errors'
import { createCoreMetrics } from './metrics'
import { schemaVersion } from './migrations'

/** Diálogos nativos y acciones del sistema (en tests se sustituyen por unos falsos). */
export interface DialogProvider {
  openFile(title: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  saveFile(title: string, defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  openDir(title: string): Promise<string | null>
  showItem(p: string): void
  openPath(p: string): void
}

export function createCoreHandlers(ctx: CoreContext, dialogs: DialogProvider, appVersion = '0.0.0') {
  const metrics = createCoreMetrics(ctx)
  const charts = createChartsService(ctx, metrics)
  const dashboards = createDashboardsService(ctx)
  return {
    'app.info': () => ({
      version: appVersion,
      dbPath: ctx.paths.dbPath,
      backupsDir: ctx.paths.backupsDir,
      schemaVersion: schemaVersion(ctx.db),
      today: ctx.today(),
      isEmpty: ctx.registry.modules.every((m) => (m.isEmpty ? m.isEmpty(ctx) : true))
    }),

    // Auditoría
    'audit.list': (limit = 300, entity?: string) =>
      ctx.db.all<{
        id: number
        ts: string
        entity: string
        entity_id: string
        action: string
        summary: string | null
        before_json: string | null
        after_json: string | null
      }>(
        `SELECT * FROM audit_log ${entity ? 'WHERE entity = ?' : ''} ORDER BY id DESC LIMIT ${Math.min(Math.max(1, limit), 5000)}`,
        entity ? [entity] : undefined
      ),

    // Copias. No escriben en la base, pero van en un turno exclusivo de la cola para no ver nunca
    // una base a medio restaurar. Restaurar se encola sola (ver backup.ts).
    'backup.list': () => listBackups(ctx),
    'backup.create': () => ctx.queue.enqueueTask('core:backup.create', async () => createBackup(ctx, 'manual')),
    'backup.auto': () => ctx.queue.enqueueTask('core:backup.auto', async () => autoBackup(ctx)),
    'backup.restore': async (file?: string) => {
      const f =
        file ??
        (await dialogs.openFile('Elige una copia para restaurar', [{ name: 'Copia de Finanzas', extensions: ['sqlite', 'json'] }]))
      if (!f) return null
      return restoreBackup(ctx, f)
    },
    'backup.openFolder': () => {
      if (!ctx.paths.backupsDir) throw new UserError('No hay carpeta de copias.')
      dialogs.openPath(ctx.paths.backupsDir)
      return true
    },
    'data.openFolder': () => {
      if (ctx.paths.dbPath) dialogs.showItem(ctx.paths.dbPath)
      return true
    },

    // Métricas del registro (solo leen; las calcula el módulo dueño)
    'metrics.list': () => metrics.list(),
    'metrics.compute': (id: string, query: MetricQuery) => metrics.compute(id, query),
    'metrics.options': (kind: MetricOptionKind) => metrics.options(kind),

    // Gráficos guardados (las escrituras van por la cola, con auditoría)
    'charts.list': () => charts.list(),
    'charts.get': (id: number) => charts.get(id),
    'charts.save': (input: ChartInput) => charts.save(input),
    'charts.delete': (id: number) => charts.delete(id),
    'charts.data': (specOrId: ChartSpec | number) => charts.data(specOrId),

    // Paneles editables (la fusión con el diseño por defecto la hace la interfaz)
    'dashboards.get': (id: DashboardId) => dashboards.get(id),
    'dashboards.save': (id: DashboardId, cards: DashboardCard[]) => dashboards.save(id, cards),
    'dashboards.reset': (id: DashboardId) => dashboards.reset(id)
  }
}

export type CoreHandlers = ReturnType<typeof createCoreHandlers>
