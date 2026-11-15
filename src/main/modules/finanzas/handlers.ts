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
import type { OpOptions } from '../../core/writeQueue'
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

/**
 * Handlers de finanzas. Los de lectura son síncronos y no pasan por la cola. Los que escriben
 * llaman al servicio (que sigue siendo síncrono) dentro de una operación de la cola de escritura,
 * con la etiqueta `finanzas:<handler>`, y devuelven su promesa.
 */
export function createFinanzasHandlers(s: AppState, dialogs: DialogProvider) {
  const write = <T>(name: string, fn: () => T, opts?: OpOptions): Promise<T> =>
    s.core.queue.enqueue(`finanzas:${name}`, fn, opts)
  const h = {
    // Catálogo y ajustes
    'catalog.get': () => catalog.getCatalog(s),
    'settings.update': (patch: Partial<Settings>) => write('settings.update', () => catalog.updateSettings(s, patch)),
    'accounts.list': () => catalog.listAccounts(s),
    'accounts.save': (input: AccountInput) => write('accounts.save', () => catalog.saveAccount(s, input)),
    'accounts.delete': (id: string) => write('accounts.delete', () => catalog.deleteAccount(s, id)),
    'accounts.reconcile': (input: ReconcileInput) => write('accounts.reconcile', () => catalog.reconcile(s, input)),
    'accounts.reconciliations': (accountId: string) => catalog.listReconciliations(s, accountId),
    'accounts.deleteReconciliation': (id: string) => write('accounts.deleteReconciliation', () => catalog.deleteReconciliation(s, id)),
    'groups.save': (input: GroupInput) => write('groups.save', () => catalog.saveGroup(s, input)),
    'groups.delete': (id: string) => write('groups.delete', () => catalog.deleteGroup(s, id)),
    'categories.save': (input: CategoryInput) => write('categories.save', () => catalog.saveCategory(s, input)),
    'categories.usage': (id: string) => catalog.categoryUsage(s, id),
    'categories.delete': (id: string, reassignTo?: string | null) => write('categories.delete', () => catalog.deleteCategory(s, id, reassignTo)),
    'subcategories.save': (input: SubcategoryInput) => write('subcategories.save', () => catalog.saveSubcategory(s, input)),
    'subcategories.delete': (id: string) => write('subcategories.delete', () => catalog.deleteSubcategory(s, id)),
    'subcategories.merge': (fromId: string, intoId: string) => write('subcategories.merge', () => catalog.mergeSubcategories(s, fromId, intoId)),

    // Movimientos
    'tx.list': (filter: TxFilter) => tx.listTransactions(s, filter),
    'tx.get': (id: string) => tx.getTransaction(s, id),
    'tx.validate': (draft: TxDraft) => tx.validateDraft(s, draft),
    'tx.save': (input: TxInput) => write('tx.save', () => tx.saveTransaction(s, input)),
    'tx.saveTransfer': (input: TransferInput) => write('tx.saveTransfer', () => tx.saveTransfer(s, input)),
    'tx.setStatus': (ids: string[], status: TxStatus) => write('tx.setStatus', () => tx.setStatus(s, ids, status)),
    'tx.delete': (id: string) => write('tx.delete', () => tx.deleteTransaction(s, id)),
    'tx.dismissDuplicate': (a: string, b: string) => write('tx.dismissDuplicate', () => tx.dismissDuplicate(s, a, b)),
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
      write('budgets.set', () => planning.setBudget(s, input)),
    'budgets.copy': (fromMonth: MonthKey, toMonth: MonthKey, overwrite?: boolean) => write('budgets.copy', () => planning.copyBudgets(s, fromMonth, toMonth, overwrite)),
    'recurring.list': () => planning.listRecurring(s),
    'recurring.save': (input: RecurringInput) => write('recurring.save', () => planning.saveRecurring(s, input)),
    'recurring.delete': (id: string) => write('recurring.delete', () => planning.deleteRecurring(s, id)),
    'goals.list': () => planning.listGoals(s),
    'goals.save': (input: GoalInput) => write('goals.save', () => planning.saveGoal(s, input)),
    'goals.delete': (id: string) => write('goals.delete', () => planning.deleteGoal(s, id)),
    'goals.allocate': (input: AllocationInput) => write('goals.allocate', () => planning.saveAllocation(s, input)),
    'goals.deleteAllocation': (id: string) => write('goals.deleteAllocation', () => planning.deleteAllocation(s, id)),
    'forecast.run': (months?: number) => planning.runForecasts(s, months),
    'scenarios.save': (input: ScenarioInput) => write('scenarios.save', () => planning.saveScenario(s, input)),
    'scenarios.delete': (id: string) => write('scenarios.delete', () => planning.deleteScenario(s, id)),

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
    'inv.saveBlock': (input: BlockInput) => write('inv.saveBlock', () => inv.saveBlock(s, input)),
    'inv.deleteBlock': (id: string) => write('inv.deleteBlock', () => inv.deleteBlock(s, id)),
    'inv.saveInstrument': (input: InstrumentInput) => write('inv.saveInstrument', () => inv.saveInstrument(s, input)),
    'inv.deleteInstrument': (id: string) => write('inv.deleteInstrument', () => inv.deleteInstrument(s, id)),
    'inv.saveOp': (input: OpInput) => write('inv.saveOp', () => inv.saveOp(s, input)),
    'inv.deleteOp': (id: string) => write('inv.deleteOp', () => inv.deleteOp(s, id)),
    'inv.savePrice': (input: PriceInput) => write('inv.savePrice', () => inv.savePrice(s, input)),
    'inv.deletePrice': (id: string) => write('inv.deletePrice', () => inv.deletePrice(s, id)),
    'inv.ops': () => s.snap().ops,
    'inv.prices': () => s.snap().prices,

    // Importar / exportar
    'import.pick': async () => {
      const f = await dialogs.openFile('Elige tu FINANCIAL_MASTER.xlsx', [{ name: 'Excel', extensions: ['xlsx'] }])
      if (!f) return null
      return previewImport(s, f)
    },
    'import.apply': (token: string, replaceExisting: boolean) => {
      let backup: string | null = null
      return write(
        'import.apply',
        () => {
          const res = applyImport(s, token, { replaceExisting })
          return { ...res, backup }
        },
        {
          // En su turno y fuera de la transacción: comprobar si hay datos y, si toca, la copia.
          before: () => {
            const hasData = !isEmpty(s)
            if (hasData && replaceExisting && s.paths.backupsDir) backup = createBackup(s, 'antes-de-importar').path
          }
        }
      )
    },
    'tr.pick': async () => {
      const f = await dialogs.openFile('Elige el CSV exportado de Trade Republic', [{ name: 'CSV', extensions: ['csv'] }])
      if (!f) return null
      return previewTradeRepublic(s, f)
    },
    'tr.apply': (token: string, opts: TrApplyOptions) => {
      let backup: string | null = null
      return write('tr.apply', () => ({ ...applyTradeRepublic(s, token, opts), backup }), {
        before: () => {
          backup = s.paths.backupsDir ? createBackup(s, 'antes-de-importar').path : null
        }
      })
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
