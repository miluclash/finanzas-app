// Handlers IPC del núcleo: información de la app, auditoría, copias de seguridad y carpeta de datos.
// Los de cada módulo los construye su `ipc` (ver registry.ts) y se juntan en la raíz de composición.
// Los de lectura son síncronos y no pasan por la cola; los que escriben (o necesitan turno)
// devuelven una promesa de la cola de escritura.
//
// Asistente (`core:ai.*`, F6): las firmas son exactamente las de `AiHandlers` del contrato. Las
// respuestas llegan por eventos (`ai:event`) con `opts.aiEmit`, que conecta la raíz de la app.
import type { AiEvent, AiHandlers, AiSettings, AiSettingsPatch, AiAcceptInput, AiSendInput, LlmProvider } from '@shared/core/ai-types'
import type { ChartInput, ChartSpec, DashboardCard, DashboardId, MetricOptionKind, MetricQuery } from '@shared/core/metrics-types'
import { Assistant, collectSuggestions } from './ai/assistant'
import { CORE_AI_TOOLS } from './ai/coreTools'
import { OllamaProvider } from './ai/ollama'
import { createAiStore } from './aiStore'
import { autoBackup, createBackup, listBackups, restoreBackup } from './backup'
import { createChartsService, createDashboardsService } from './charts'
import type { CoreContext } from './context'
import { createAiSettingsStore } from './coreSettings'
import { UserError } from './errors'
import { createCoreMetrics } from './metrics'
import { schemaVersion } from './migrations'
import { checkAiTools } from './registry'

/** Diálogos nativos y acciones del sistema (en tests se sustituyen por unos falsos). */
export interface DialogProvider {
  openFile(title: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  saveFile(title: string, defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  openDir(title: string): Promise<string | null>
  showItem(p: string): void
  openPath(p: string): void
}

export interface CoreHandlerOptions {
  /** Eventos del asistente hacia la interfaz (canal `ai:event`). Sin él, los eventos se descartan. */
  aiEmit?: (event: AiEvent) => void
  /** Proveedor del asistente para unos ajustes (por defecto, Ollama con su URL). En tests, uno falso. */
  aiProvider?: (settings: AiSettings) => LlmProvider
  /** Recibe el asistente creado (la app lo usa para cancelar las respuestas al cerrar). */
  onAssistant?: (assistant: Assistant<CoreContext>) => void
}

/** Asistente del núcleo: herramientas `core_*` y las de los módulos del registro, sugerencias de todos. */
export function createCoreAssistant(ctx: CoreContext, opts: CoreHandlerOptions = {}): Assistant<CoreContext> {
  checkAiTools(CORE_AI_TOOLS, 'core', new Map(ctx.registry.aiTools.map((t) => [t.name, 'un módulo'])))
  return new Assistant<CoreContext>({
    ctx,
    store: createAiStore(ctx),
    settings: createAiSettingsStore(ctx),
    provider: opts.aiProvider ?? ((s) => new OllamaProvider({ baseUrl: s.baseUrl })),
    tools: [...CORE_AI_TOOLS, ...ctx.registry.aiTools],
    suggestions: () => collectSuggestions(ctx.registry.modules, ctx),
    emit: (e) => opts.aiEmit?.(e),
    today: () => ctx.today()
  })
}

export function createCoreHandlers(ctx: CoreContext, dialogs: DialogProvider, appVersion = '0.0.0', opts: CoreHandlerOptions = {}) {
  const metrics = createCoreMetrics(ctx)
  const charts = createChartsService(ctx, metrics)
  const dashboards = createDashboardsService(ctx)
  const assistant = createCoreAssistant(ctx, opts)
  opts.onAssistant?.(assistant)
  const aiStore = createAiStore(ctx)
  const aiSettings = createAiSettingsStore(ctx)
  const ai = {
    'ai.status': () => assistant.status(),
    'ai.settings.get': () => aiSettings.get(),
    'ai.settings.save': (patch: AiSettingsPatch) => aiSettings.save(patch),
    'ai.threads.list': () => aiStore.listThreads(),
    'ai.threads.get': (id: string) => aiStore.getThread(id),
    'ai.threads.delete': (id: string) => {
      assistant.cancelThread(id)
      return aiStore.deleteThread(id)
    },
    'ai.threads.deleteAll': () => {
      assistant.cancelAll()
      return aiStore.deleteAllThreads()
    },
    'ai.send': (input: AiSendInput) => assistant.send(input),
    'ai.cancel': (runId: string) => assistant.cancel(runId),
    'ai.proposals.accept': (input: AiAcceptInput) => assistant.acceptProposal(input?.proposalId),
    'ai.proposals.reject': (proposalId: string) => assistant.rejectProposal(proposalId),
    'ai.suggestions': () => assistant.suggestions()
  } satisfies AiHandlers
  return {
    ...ai,
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
