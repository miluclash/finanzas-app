// Contrato de la API que la interfaz llama por IPC. Todos los métodos se validan aquí o en sus servicios.
import { dashboardData, computeAlerts } from '@shared/domain/dashboard'
import { monthSummaries, netWorthSeries, trackedMonths } from '@shared/domain/ledger'
import { addMonthsToMonth, monthOf } from '@shared/dates'
import type {
  AccountInput,
  AllocationInput,
  BlockInput,
  CategoryInput,
  GoalInput,
  GroupInput,
  InstrumentInput,
  OpInput,
  PriceInput,
  ReconcileInput,
  RecurringInput,
  ScenarioInput,
  SubcategoryInput,
  TransferInput,
  TxFilter,
  TxInput
} from '@shared/schemas'
import type { MonthKey, Settings, TxStatus } from '@shared/types'
import type { TxDraft } from '@shared/domain/validation'
import { schemaVersion } from '../db/migrations'
import { autoBackup, createBackup, exportCsv, exportJson, exportXlsx, listBackups, restoreBackup } from './backup'
import * as catalog from './catalog'
import { applyImport, previewImport } from './importExcel'
import { applyTradeRepublic, previewTradeRepublic, type TrApplyOptions } from './importTradeRepublic'
import * as inv from './investments'
import * as planning from './planning'
import { UserError, type AppState } from './state'
import * as tx from './transactions'

export interface DialogProvider {
  openFile(title: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  saveFile(title: string, defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  openDir(title: string): Promise<string | null>
  showItem(p: string): void
  openPath(p: string): void
}

export function createHandlers(s: AppState, dialogs: DialogProvider, appVersion = '0.0.0') {
  const h = {
    'app.info': () => ({
      version: appVersion,
      dbPath: s.paths.dbPath,
      backupsDir: s.paths.backupsDir,
      schemaVersion: schemaVersion(s.db),
      today: s.today(),
      isEmpty: s.snap().accounts.length === 0 && s.snap().transactions.length === 0
    }),

    // Catálogo y ajustes
    'catalog.get': () => catalog.getCatalog(s),
    'settings.update': (patch: Partial<Settings>) => catalog.updateSettings(s, patch),
    'accounts.list': () => catalog.listAccounts(s),
    'accounts.save': (input: AccountInput) => catalog.saveAccount(s, input),
    'accounts.delete': (id: string) => catalog.deleteAccount(s, id),
    'accounts.reconcile': (input: ReconcileInput) => catalog.reconcile(s, input),
    'accounts.reconciliations': (accountId: string) => catalog.listReconciliations(s, accountId),
    'accounts.deleteReconciliation': (id: string) => catalog.deleteReconciliation(s, id),
    'groups.save': (input: GroupInput) => catalog.saveGroup(s, input),
    'groups.delete': (id: string) => catalog.deleteGroup(s, id),
    'categories.save': (input: CategoryInput) => catalog.saveCategory(s, input),
    'categories.usage': (id: string) => catalog.categoryUsage(s, id),
    'categories.delete': (id: string, reassignTo?: string | null) => catalog.deleteCategory(s, id, reassignTo),
    'subcategories.save': (input: SubcategoryInput) => catalog.saveSubcategory(s, input),
    'subcategories.delete': (id: string) => catalog.deleteSubcategory(s, id),
    'subcategories.merge': (fromId: string, intoId: string) => catalog.mergeSubcategories(s, fromId, intoId),

    // Movimientos
    'tx.list': (filter: TxFilter) => tx.listTransactions(s, filter),
    'tx.get': (id: string) => tx.getTransaction(s, id),
    'tx.validate': (draft: TxDraft) => tx.validateDraft(s, draft),
    'tx.save': (input: TxInput) => tx.saveTransaction(s, input),
    'tx.saveTransfer': (input: TransferInput) => tx.saveTransfer(s, input),
    'tx.setStatus': (ids: string[], status: TxStatus) => tx.setStatus(s, ids, status),
    'tx.delete': (id: string) => tx.deleteTransaction(s, id),
    'tx.dismissDuplicate': (a: string, b: string) => tx.dismissDuplicate(s, a, b),
    'tx.reviewQueue': () => tx.reviewQueue(s),
    'tx.suggest': (text: string) => tx.suggestFromHistory(s, text),

    // Panel, control mensual, patrimonio
    'dashboard.get': (month?: MonthKey) => dashboardData(s.ctx(), month),
    'alerts.get': () => computeAlerts(s.ctx()),
    'monthly.summaries': (count = 12, until?: MonthKey) => {
      const ctx = s.ctx()
      const last = until ?? monthOf(ctx.today)
      const months: MonthKey[] = []
      for (let i = count - 1; i >= 0; i--) months.push(addMonthsToMonth(last, -i))
      const first = trackedMonths(ctx)[0]
      return [...monthSummaries(ctx, months).values()].filter((m) => !first || m.month >= first || m.txCount > 0)
    },
    'networth.series': () => netWorthSeries(s.ctx()),

    // Planificación
    'budgets.report': (month: MonthKey) => planning.getBudgetReport(s, month),
    'budgets.set': (input: { month: string; categoryId: string; amountCents?: number | null; alertPct?: number | null }) =>
      planning.setBudget(s, input),
    'budgets.copy': (fromMonth: MonthKey, toMonth: MonthKey, overwrite?: boolean) => planning.copyBudgets(s, fromMonth, toMonth, overwrite),
    'recurring.list': () => planning.listRecurring(s),
    'recurring.save': (input: RecurringInput) => planning.saveRecurring(s, input),
    'recurring.delete': (id: string) => planning.deleteRecurring(s, id),
    'goals.list': () => planning.listGoals(s),
    'goals.save': (input: GoalInput) => planning.saveGoal(s, input),
    'goals.delete': (id: string) => planning.deleteGoal(s, id),
    'goals.allocate': (input: AllocationInput) => planning.saveAllocation(s, input),
    'goals.deleteAllocation': (id: string) => planning.deleteAllocation(s, id),
    'forecast.run': (months?: number) => planning.runForecasts(s, months),
    'scenarios.save': (input: ScenarioInput) => planning.saveScenario(s, input),
    'scenarios.delete': (id: string) => planning.deleteScenario(s, id),

    // Inversiones
    'inv.overview': () => inv.investmentsOverview(s),
    'inv.saveBlock': (input: BlockInput) => inv.saveBlock(s, input),
    'inv.deleteBlock': (id: string) => inv.deleteBlock(s, id),
    'inv.saveInstrument': (input: InstrumentInput) => inv.saveInstrument(s, input),
    'inv.deleteInstrument': (id: string) => inv.deleteInstrument(s, id),
    'inv.saveOp': (input: OpInput) => inv.saveOp(s, input),
    'inv.deleteOp': (id: string) => inv.deleteOp(s, id),
    'inv.savePrice': (input: PriceInput) => inv.savePrice(s, input),
    'inv.deletePrice': (id: string) => inv.deletePrice(s, id),
    'inv.ops': () => s.snap().ops,
    'inv.prices': () => s.snap().prices,

    // Auditoría
    'audit.list': (limit = 300, entity?: string) =>
      s.db.all<{
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

    // Importar / exportar / copias
    'import.pick': async () => {
      const f = await dialogs.openFile('Elige tu FINANCIAL_MASTER.xlsx', [{ name: 'Excel', extensions: ['xlsx'] }])
      if (!f) return null
      return previewImport(s, f)
    },
    'import.apply': (token: string, replaceExisting: boolean) => {
      const hasData = !h['app.info']().isEmpty
      let backup: string | null = null
      if (hasData && replaceExisting && s.paths.backupsDir) backup = createBackup(s, 'antes-de-importar').path
      const res = applyImport(s, token, { replaceExisting })
      return { ...res, backup }
    },
    'tr.pick': async () => {
      const f = await dialogs.openFile('Elige el CSV exportado de Trade Republic', [{ name: 'CSV', extensions: ['csv'] }])
      if (!f) return null
      return previewTradeRepublic(s, f)
    },
    'tr.apply': (token: string, opts: TrApplyOptions) => {
      const backup = s.paths.backupsDir ? createBackup(s, 'antes-de-importar').path : null
      return { ...applyTradeRepublic(s, token, opts), backup }
    },
    'export.json': async () => {
      const f = await dialogs.saveFile('Exportar todo (JSON)', `finanzas-${s.today()}.json`, [{ name: 'JSON', extensions: ['json'] }])
      if (!f) return null
      exportJson(s, f)
      dialogs.showItem(f)
      return f
    },
    'export.xlsx': async () => {
      const f = await dialogs.saveFile('Exportar a Excel', `finanzas-${s.today()}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }])
      if (!f) return null
      await exportXlsx(s, f)
      dialogs.showItem(f)
      return f
    },
    'export.csv': async () => {
      const d = await dialogs.openDir('Carpeta donde guardar los CSV')
      if (!d) return null
      const files = exportCsv(s, d)
      dialogs.openPath(d)
      return files
    },
    'backup.list': () => listBackups(s),
    'backup.create': () => createBackup(s, 'manual'),
    'backup.auto': () => autoBackup(s),
    'backup.restore': async (file?: string) => {
      const f =
        file ??
        (await dialogs.openFile('Elige una copia para restaurar', [{ name: 'Copia de Finanzas', extensions: ['sqlite', 'json'] }]))
      if (!f) return null
      return restoreBackup(s, f)
    },
    'backup.openFolder': () => {
      if (!s.paths.backupsDir) throw new UserError('No hay carpeta de copias.')
      dialogs.openPath(s.paths.backupsDir)
      return true
    },
    'data.openFolder': () => {
      if (s.paths.dbPath) dialogs.showItem(s.paths.dbPath)
      return true
    }
  }
  return h
}

export type Handlers = ReturnType<typeof createHandlers>
export type ApiMethod = keyof Handlers
export type ApiResult<K extends ApiMethod> = Awaited<ReturnType<Handlers[K]>>
export type ApiArgs<K extends ApiMethod> = Parameters<Handlers[K]>
