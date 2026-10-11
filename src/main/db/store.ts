// Ajustes, semilla inicial, registro de auditoría y carga del snapshot completo.
import type {
  Account,
  AllocationBlock,
  Budget,
  Category,
  CategoryGroup,
  DataSnapshot,
  Goal,
  GoalAllocation,
  Instrument,
  InvestmentOp,
  Price,
  Reconciliation,
  RecurringRule,
  Scenario,
  Settings,
  Subcategory,
  Transaction
} from '@shared/types'
import type { Db } from './db'
import { insertRow, selectAll } from './tables'

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'EUR',
  trackingStart: new Date().toISOString().slice(0, 7) + '-01',
  minLiquidityCents: 0,
  emergencyMonths: 3,
  budgetAlertPct: 80,
  duplicateWindowDays: 3,
  costMethod: 'AVERAGE',
  theme: 'system',
  forecastScenarioId: 'SCN001',
  verifyStaleDays: 35,
  concentrationAlertPct: 10,
  investmentFeeCategoryId: null,
  investmentIncomeCategoryId: null,
  lastAccountId: null,
  lastCategoryId: null
}

export function getSettings(db: Db): Settings {
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM settings')
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) {
    try {
      s[r.key] = JSON.parse(r.value)
    } catch {
      s[r.key] = r.value
    }
  }
  return s as unknown as Settings
}

export function setSettings(db: Db, patch: Partial<Settings>): void {
  db.tx(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULT_SETTINGS)) continue
      db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
        k,
        JSON.stringify(v ?? null)
      ])
    }
  })
}

export function audit(
  db: Db,
  entity: string,
  entityId: string,
  action: string,
  summary: string | null,
  before: unknown,
  after: unknown
): void {
  db.run(
    'INSERT INTO audit_log (ts, entity, entity_id, action, summary, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      new Date().toISOString(),
      entity,
      entityId,
      action,
      summary,
      before === undefined || before === null ? null : JSON.stringify(before),
      after === undefined || after === null ? null : JSON.stringify(after)
    ]
  )
}

const DEFAULT_GROUPS: Array<[string, string, 'INCOME' | 'EXPENSE']> = [
  ['GRP001', 'Ingresos', 'INCOME'],
  ['GRP002', 'Esenciales', 'EXPENSE'],
  ['GRP003', 'Estilo de vida', 'EXPENSE'],
  ['GRP004', 'Financieros', 'EXPENSE'],
  ['GRP005', 'Otros', 'EXPENSE']
]

const DEFAULT_CATEGORIES: Array<[string, string, 'FIXED' | 'VARIABLE']> = [
  ['GRP001', 'Nómina', 'FIXED'],
  ['GRP001', 'Prácticas', 'FIXED'],
  ['GRP001', 'Intereses', 'VARIABLE'],
  ['GRP001', 'Rendimientos de inversión', 'VARIABLE'],
  ['GRP001', 'Otros ingresos', 'VARIABLE'],
  ['GRP002', 'Vivienda', 'FIXED'],
  ['GRP002', 'Alimentación', 'VARIABLE'],
  ['GRP002', 'Transporte', 'VARIABLE'],
  ['GRP002', 'Salud', 'VARIABLE'],
  ['GRP002', 'Formación', 'VARIABLE'],
  ['GRP002', 'Seguros', 'FIXED'],
  ['GRP002', 'Comunicaciones', 'FIXED'],
  ['GRP003', 'Gimnasio', 'FIXED'],
  ['GRP003', 'Salir fuera', 'VARIABLE'],
  ['GRP003', 'Entretenimiento', 'VARIABLE'],
  ['GRP003', 'Ropa', 'VARIABLE'],
  ['GRP003', 'Libros', 'VARIABLE'],
  ['GRP003', 'Cuidado personal', 'VARIABLE'],
  ['GRP003', 'Suscripciones', 'FIXED'],
  ['GRP003', 'Aficiones', 'VARIABLE'],
  ['GRP004', 'Comisiones bancarias', 'VARIABLE'],
  ['GRP004', 'Comisiones de inversión', 'VARIABLE'],
  ['GRP004', 'Pago de deudas', 'FIXED'],
  ['GRP005', 'Otros gastos', 'VARIABLE']
]

/** Datos mínimos para una base de datos nueva: grupos, categorías, escenarios y ajustes. */
export function seedIfEmpty(db: Db): boolean {
  const hasGroups = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM category_groups')!.n > 0
  if (hasGroups) return false
  db.tx(() => {
    DEFAULT_GROUPS.forEach(([id, name, kind], i) => insertRow(db, 'category_groups', { id, name, kind, sort_order: i }))
    DEFAULT_CATEGORIES.forEach(([group, name, nature], i) =>
      insertRow(db, 'categories', {
        id: `CAT${String(i + 1).padStart(3, '0')}`,
        name,
        group_id: group,
        default_nature: nature,
        active: 1,
        sort_order: i,
        notes: null
      })
    )
    seedScenarios(db, 20000)
    const fee = DEFAULT_CATEGORIES.findIndex((c) => c[1] === 'Comisiones de inversión')
    const inc = DEFAULT_CATEGORIES.findIndex((c) => c[1] === 'Rendimientos de inversión')
    setSettings(db, {
      investmentFeeCategoryId: `CAT${String(fee + 1).padStart(3, '0')}`,
      investmentIncomeCategoryId: `CAT${String(inc + 1).padStart(3, '0')}`,
      trackingStart: DEFAULT_SETTINGS.trackingStart
    })
  })
  return true
}

export function seedScenarios(db: Db, variableCents: number, factors?: Record<string, [string, string]>): void {
  const base = factors ?? { BASE: ['1', '1'], CONSERVATIVE: ['0.95', '1.1'], OPTIMISTIC: ['1.05', '0.95'] }
  const names: Record<string, string> = { BASE: 'Base', CONSERVATIVE: 'Conservador', OPTIMISTIC: 'Optimista' }
  ;['BASE', 'CONSERVATIVE', 'OPTIMISTIC'].forEach((k, i) =>
    insertRow(db, 'scenarios', {
      id: `SCN${String(i + 1).padStart(3, '0')}`,
      name: names[k],
      income_factor: base[k][0],
      expense_factor: base[k][1],
      variable_monthly_cents: variableCents,
      notes: null,
      sort_order: i
    })
  )
}

export function loadSnapshot(db: Db): DataSnapshot {
  return {
    settings: getSettings(db),
    groups: selectAll<CategoryGroup>(db, 'category_groups', 'sort_order, name'),
    categories: selectAll<Category>(db, 'categories', 'sort_order, name'),
    subcategories: selectAll<Subcategory>(db, 'subcategories', 'name'),
    accounts: selectAll<Account>(db, 'accounts', 'sort_order, id'),
    reconciliations: selectAll<Reconciliation>(db, 'reconciliations', 'date, id'),
    transactions: selectAll<Transaction>(db, 'transactions', 'date, id'),
    recurring: selectAll<RecurringRule>(db, 'recurring_rules', 'id'),
    goals: selectAll<Goal>(db, 'goals', 'sort_order, id'),
    allocations: selectAll<GoalAllocation>(db, 'goal_allocations', 'date, id'),
    budgets: selectAll<Budget>(db, 'budgets', 'month, category_id'),
    scenarios: selectAll<Scenario>(db, 'scenarios', 'sort_order, id'),
    blocks: selectAll<AllocationBlock>(db, 'allocation_blocks', 'sort_order, id'),
    instruments: selectAll<Instrument>(db, 'instruments', 'name'),
    ops: selectAll<InvestmentOp>(db, 'investment_ops', 'date, created_at, id'),
    prices: selectAll<Price>(db, 'prices', 'instrument_id, date'),
    dismissedDuplicates: db
      .all<{ tx_a: string; tx_b: string }>('SELECT tx_a, tx_b FROM duplicate_dismissals')
      .map((r) => [r.tx_a, r.tx_b] as [string, string])
  }
}
