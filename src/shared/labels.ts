import type {
  AccountType,
  AssetClass,
  CostMethod,
  Frequency,
  GoalStatus,
  GoalType,
  GroupKind,
  InvestmentOpType,
  Nature,
  Priority,
  RecurringKind,
  TxStatus,
  TxType
} from './types'

export const TX_TYPE_LABEL: Record<TxType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  REFUND: 'Reembolso',
  TRANSFER: 'Transferencia',
  INVESTMENT_BUY: 'Compra inversión',
  INVESTMENT_SELL: 'Venta inversión',
  ADJUSTMENT: 'Ajuste'
}

export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  CONFIRMED: 'Confirmado',
  PENDING_REVIEW: 'Pendiente de revisar',
  CANCELLED: 'Anulado'
}

export const NATURE_LABEL: Record<Nature, string> = {
  FIXED: 'Fijo',
  VARIABLE: 'Variable',
  EXTRAORDINARY: 'Extraordinario'
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CHECKING: 'Cuenta corriente',
  SAVINGS: 'Ahorro / hucha',
  CASH: 'Efectivo',
  INVESTMENT: 'Inversión / bróker',
  CRYPTO: 'Criptomonedas',
  LIABILITY: 'Pasivo / deuda',
  OTHER: 'Otro activo'
}

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  INCOME: 'Ingresos',
  EXPENSE: 'Gastos'
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
  ONE_OFF: 'Una vez'
}

export const RECURRING_KIND_LABEL: Record<RecurringKind, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia a otra cuenta'
}

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  REQUIRED: 'Obligatorio',
  PLANNED: 'Planificado',
  OPTIONAL: 'Opcional',
  LONG_TERM: 'Largo plazo'
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja'
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  ACTIVE: 'Activo',
  PAUSED: 'En pausa',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado'
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  ETF: 'ETF',
  STOCK: 'Acción',
  FUND: 'Fondo',
  BOND: 'Bono',
  METAL: 'Metal',
  CRYPTO: 'Cripto',
  CASH: 'Liquidez',
  OTHER: 'Otro'
}

export const OP_TYPE_LABEL: Record<InvestmentOpType, string> = {
  BUY: 'Compra',
  SELL: 'Venta',
  DIVIDEND: 'Dividendo',
  INTEREST: 'Interés',
  FEE: 'Comisión',
  SPLIT: 'Split'
}

export const COST_METHOD_LABEL: Record<CostMethod, string> = {
  AVERAGE: 'Precio medio ponderado',
  FIFO: 'FIFO (primero en entrar, primero en salir)'
}
