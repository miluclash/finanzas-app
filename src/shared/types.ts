// Tipos de dominio compartidos entre el proceso principal, el preload y la interfaz.
// Todos los importes monetarios van en céntimos enteros (number entero) para evitar
// errores de coma flotante. Cantidades y precios de inversión van como string decimal.

export type ISODate = string // 'YYYY-MM-DD'
export type MonthKey = string // 'YYYY-MM'

export const TX_TYPES = [
  'INCOME',
  'EXPENSE',
  'REFUND',
  'TRANSFER',
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
  'ADJUSTMENT'
] as const
export type TxType = (typeof TX_TYPES)[number]

export const TX_STATUSES = ['CONFIRMED', 'PENDING_REVIEW', 'CANCELLED'] as const
export type TxStatus = (typeof TX_STATUSES)[number]

export const NATURES = ['FIXED', 'VARIABLE', 'EXTRAORDINARY'] as const
export type Nature = (typeof NATURES)[number]

export const ACCOUNT_TYPES = [
  'CHECKING',
  'SAVINGS',
  'CASH',
  'INVESTMENT',
  'CRYPTO',
  'LIABILITY',
  'OTHER'
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const GROUP_KINDS = ['INCOME', 'EXPENSE'] as const
export type GroupKind = (typeof GROUP_KINDS)[number]

export const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_OFF'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const RECURRING_KINDS = ['INCOME', 'EXPENSE', 'TRANSFER'] as const
export type RecurringKind = (typeof RECURRING_KINDS)[number]

export const GOAL_TYPES = ['REQUIRED', 'PLANNED', 'OPTIONAL', 'LONG_TERM'] as const
export type GoalType = (typeof GOAL_TYPES)[number]

export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const
export type Priority = (typeof PRIORITIES)[number]

export const GOAL_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const ASSET_CLASSES = ['ETF', 'STOCK', 'FUND', 'BOND', 'METAL', 'CRYPTO', 'CASH', 'OTHER'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

export const INVESTMENT_OP_TYPES = ['BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'SPLIT'] as const
export type InvestmentOpType = (typeof INVESTMENT_OP_TYPES)[number]

export const COST_METHODS = ['AVERAGE', 'FIFO'] as const
export type CostMethod = (typeof COST_METHODS)[number]

export interface CategoryGroup {
  id: string
  name: string
  kind: GroupKind
  sortOrder: number
}

export interface Category {
  id: string
  name: string
  groupId: string
  defaultNature: Nature
  active: boolean
  sortOrder: number
  notes: string | null
}

export interface Subcategory {
  id: string
  categoryId: string
  name: string
  active: boolean
}

export interface Account {
  id: string
  name: string
  institution: string | null
  type: AccountType
  currency: string
  openingBalanceCents: number
  openingDate: ISODate
  active: boolean
  includeNetWorth: boolean
  includeLiquidity: boolean
  initialContributionsCents: number
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Reconciliation {
  id: string
  accountId: string
  date: ISODate
  bankBalanceCents: number
  computedBalanceCents: number
  notes: string | null
  createdAt: string
}

export interface Transaction {
  id: string
  date: ISODate
  accountId: string
  description: string
  amountCents: number
  currency: string
  type: TxType
  categoryId: string | null
  subcategoryId: string | null
  merchant: string | null
  recurringId: string | null
  goalId: string | null
  transferId: string | null
  linkedTxId: string | null
  investmentOpId: string | null
  status: TxStatus
  nature: Nature | null
  source: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface RecurringRule {
  id: string
  concept: string
  kind: RecurringKind
  amountCents: number // siempre positivo; el signo lo da `kind`
  frequency: Frequency
  startDate: ISODate | null // fecha ancla (primer cargo / próximo cargo conocido)
  endDate: ISODate | null
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  essential: boolean
  active: boolean
  minCents: number | null
  maxCents: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  name: string
  type: GoalType
  priority: Priority
  targetCents: number | null
  deadline: ISODate | null
  status: GoalStatus
  linkedAccountId: string | null
  plannedMonthlyCents: number | null
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface GoalAllocation {
  id: string
  goalId: string
  date: ISODate
  amountCents: number // + reserva, − liberación
  accountId: string
  notes: string | null
  createdAt: string
}

export interface Budget {
  id: string
  month: MonthKey
  categoryId: string
  amountCents: number
  alertPct: number | null
}

export interface Scenario {
  id: string
  name: string
  incomeFactor: string
  expenseFactor: string
  variableMonthlyCents: number
  notes: string | null
  sortOrder: number
}

export interface AllocationBlock {
  id: string
  name: string
  targetPct: string
  maxPct: string | null
  notes: string | null
  sortOrder: number
}

export interface Instrument {
  id: string
  name: string
  ticker: string | null
  isin: string | null
  assetClass: AssetClass
  currency: string
  region: string | null
  sector: string | null
  blockId: string | null
  maxWeightPct: string | null
  accountId: string | null
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface InvestmentOp {
  id: string
  date: ISODate
  accountId: string
  instrumentId: string | null
  type: InvestmentOpType
  quantity: string | null
  price: string | null
  amountCents: number | null // importe bruto para dividendos/intereses/comisiones
  feeCents: number
  taxCents: number
  splitRatio: string | null
  affectsCash: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Price {
  id: string
  instrumentId: string
  date: ISODate
  price: string
  notes: string | null
}

export interface AuditEntry {
  id: number
  ts: string
  entity: string
  entityId: string
  action: string
  summary: string | null
  beforeJson: string | null
  afterJson: string | null
}

export interface Settings {
  baseCurrency: string
  trackingStart: ISODate
  minLiquidityCents: number
  emergencyMonths: number
  budgetAlertPct: number
  duplicateWindowDays: number
  costMethod: CostMethod
  theme: 'system' | 'light' | 'dark'
  forecastScenarioId: string
  verifyStaleDays: number
  concentrationAlertPct: number
  investmentFeeCategoryId: string | null
  investmentIncomeCategoryId: string | null
  lastAccountId: string | null
  lastCategoryId: string | null
}

/** Todo el estado de la base de datos cargado en memoria para los cálculos. */
export interface DataSnapshot {
  settings: Settings
  groups: CategoryGroup[]
  categories: Category[]
  subcategories: Subcategory[]
  accounts: Account[]
  reconciliations: Reconciliation[]
  transactions: Transaction[]
  recurring: RecurringRule[]
  goals: Goal[]
  allocations: GoalAllocation[]
  budgets: Budget[]
  scenarios: Scenario[]
  blocks: AllocationBlock[]
  instruments: Instrument[]
  ops: InvestmentOp[]
  prices: Price[]
  dismissedDuplicates: Array<[string, string]>
}
