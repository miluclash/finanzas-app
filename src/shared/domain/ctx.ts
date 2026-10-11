import type {
  Account,
  Category,
  CategoryGroup,
  DataSnapshot,
  GroupKind,
  ISODate,
  Instrument,
  RecurringRule,
  Subcategory,
  Transaction
} from '../types'

/** Snapshot + índices para cálculos rápidos. Se reconstruye tras cada cambio. */
export interface Ctx extends DataSnapshot {
  today: ISODate
  accountById: Map<string, Account>
  categoryById: Map<string, Category>
  groupById: Map<string, CategoryGroup>
  subcategoryById: Map<string, Subcategory>
  txById: Map<string, Transaction>
  ruleById: Map<string, RecurringRule>
  instrumentById: Map<string, Instrument>
  /** Movimientos que cuentan: no anulados y con fecha >= apertura de su cuenta. Ordenados por fecha. */
  counted: Transaction[]
  countedByAccount: Map<string, Transaction[]>
}

export function buildCtx(s: DataSnapshot, today: ISODate): Ctx {
  const accountById = new Map(s.accounts.map((a) => [a.id, a]))
  const counted = s.transactions
    .filter((t) => isCounted(t, accountById.get(t.accountId)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
  const countedByAccount = new Map<string, Transaction[]>()
  for (const t of counted) {
    const list = countedByAccount.get(t.accountId)
    if (list) list.push(t)
    else countedByAccount.set(t.accountId, [t])
  }
  return {
    ...s,
    today,
    accountById,
    categoryById: new Map(s.categories.map((c) => [c.id, c])),
    groupById: new Map(s.groups.map((g) => [g.id, g])),
    subcategoryById: new Map(s.subcategories.map((c) => [c.id, c])),
    txById: new Map(s.transactions.map((t) => [t.id, t])),
    ruleById: new Map(s.recurring.map((r) => [r.id, r])),
    instrumentById: new Map(s.instruments.map((i) => [i.id, i])),
    counted,
    countedByAccount
  }
}

/** Regla del Excel conservada: un movimiento cuenta si no está anulado y su fecha es >= la apertura de la cuenta. */
export function isCounted(t: Transaction, acc: Account | undefined): boolean {
  if (!acc) return false
  if (t.status === 'CANCELLED') return false
  return t.date >= acc.openingDate
}

export function categoryKind(ctx: Ctx, categoryId: string | null): GroupKind | null {
  if (!categoryId) return null
  const c = ctx.categoryById.get(categoryId)
  if (!c) return null
  return ctx.groupById.get(c.groupId)?.kind ?? null
}

export type AccountRole = 'LIQUID' | 'SAVINGS' | 'INVESTMENT' | 'LIABILITY'

/**
 * Papel de la cuenta en las métricas:
 *  - LIQUID: dinero que puedes gastar hoy (Include_Liquidity)
 *  - INVESTMENT: bróker, inversión, cripto
 *  - LIABILITY: deudas
 *  - SAVINGS: el resto (huchas, efectivo reservado, ahorro)
 */
export function accountRole(a: Account): AccountRole {
  if (a.type === 'LIABILITY') return 'LIABILITY'
  if (a.includeLiquidity) return 'LIQUID'
  if (a.type === 'INVESTMENT' || a.type === 'CRYPTO') return 'INVESTMENT'
  return 'SAVINGS'
}
