import fs from 'node:fs'
import path from 'node:path'
// Handlers IPC de finanzas. Todos los métodos se validan aquí o en sus servicios.
// Los del núcleo (app.info, audit.list, backup.*, data.openFolder) están en core/handlers.ts.
import { dashboardData, computeAlerts } from '@shared/modules/finanzas/dashboard'
import { monthSummaries, netWorthSeries, trackedMonths } from '@shared/modules/finanzas/ledger'
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
} from '@shared/modules/finanzas/schemas'
import type { MonthKey, Settings, TxStatus } from '@shared/modules/finanzas/types'
import type { TxDraft } from '@shared/modules/finanzas/validation'
import { createBackup } from '../../core/backup'
import type { DialogProvider } from '../../core/handlers'
import { exportCsv, exportJson, exportXlsx } from './exports'
import * as catalog from './catalog'
import { applyImport, previewImport } from './importExcel'
import { applyTradeRepublic, previewTradeRepublic, type TrApplyOptions } from './importTradeRepublic'
import * as inv from './investments'
import { planReport } from '@shared/modules/finanzas/investmentPlan'
import * as planning from './planning'
import type { AppState } from './state'
import * as tx from './transactions'

/** Finanzas no tiene datos del usuario (ni cuentas ni movimientos). */
export function isEmpty(s: AppState): boolean {
  return s.snap().accounts.length === 0 && s.snap().transactions.length === 0
}

export function createFinanzasHandlers(s: AppState, dialogs: DialogProvider) {
  const h = {
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
    'mcp.config': () => {
      // Claude Desktop lanza el ejecutable de la app como si fuera Node (ELECTRON_RUN_AS_NODE=1),
      // así no hace falta tener Node instalado. El script va fuera de app.asar (asarUnpack).
      const res = (process as { resourcesPath?: string }).resourcesPath ?? ''
      const packaged = path.join(res, 'app.asar.unpacked', 'out', 'mcp', 'server.cjs')
      const script = fs.existsSync(packaged) ? packaged : path.resolve('out', 'mcp', 'server.cjs')
      const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' }
      if (s.paths.dbPath) env.FINANZAS_DB = s.paths.dbPath
      return { mcpServers: { finanzas: { command: process.execPath, args: [script], env } } }
    },
    'inv.plan': () => planReport(s.ctx(), s.snap().settings.investmentPlan),
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

    // Importar / exportar
    'import.pick': async () => {
      const f = await dialogs.openFile('Elige tu FINANCIAL_MASTER.xlsx', [{ name: 'Excel', extensions: ['xlsx'] }])
      if (!f) return null
      return previewImport(s, f)
    },
    'import.apply': (token: string, replaceExisting: boolean) => {
      const hasData = !isEmpty(s)
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
    }
  }
  return h
}

export type FinanzasHandlers = ReturnType<typeof createFinanzasHandlers>
