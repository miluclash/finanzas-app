// Definición de columnas por tabla para mapear filas SQL <-> objetos (snake_case <-> camelCase).
import type { Db } from './db'

type ColType = 'text' | 'int' | 'bool'

export const TABLES = {
  category_groups: { id: 'text', name: 'text', kind: 'text', sort_order: 'int' },
  categories: { id: 'text', name: 'text', group_id: 'text', default_nature: 'text', active: 'bool', sort_order: 'int', notes: 'text' },
  subcategories: { id: 'text', category_id: 'text', name: 'text', active: 'bool' },
  accounts: {
    id: 'text',
    name: 'text',
    institution: 'text',
    type: 'text',
    currency: 'text',
    opening_balance_cents: 'int',
    opening_date: 'text',
    active: 'bool',
    include_net_worth: 'bool',
    include_liquidity: 'bool',
    initial_contributions_cents: 'int',
    notes: 'text',
    sort_order: 'int',
    created_at: 'text',
    updated_at: 'text'
  },
  reconciliations: {
    id: 'text',
    account_id: 'text',
    date: 'text',
    bank_balance_cents: 'int',
    computed_balance_cents: 'int',
    notes: 'text',
    created_at: 'text'
  },
  recurring_rules: {
    id: 'text',
    concept: 'text',
    kind: 'text',
    amount_cents: 'int',
    frequency: 'text',
    start_date: 'text',
    end_date: 'text',
    category_id: 'text',
    account_id: 'text',
    to_account_id: 'text',
    essential: 'bool',
    active: 'bool',
    min_cents: 'int',
    max_cents: 'int',
    notes: 'text',
    created_at: 'text',
    updated_at: 'text'
  },
  goals: {
    id: 'text',
    name: 'text',
    type: 'text',
    priority: 'text',
    target_cents: 'int',
    deadline: 'text',
    status: 'text',
    linked_account_id: 'text',
    planned_monthly_cents: 'int',
    notes: 'text',
    sort_order: 'int',
    created_at: 'text',
    updated_at: 'text'
  },
  goal_allocations: { id: 'text', goal_id: 'text', date: 'text', amount_cents: 'int', account_id: 'text', notes: 'text', created_at: 'text' },
  allocation_blocks: { id: 'text', name: 'text', target_pct: 'text', max_pct: 'text', notes: 'text', sort_order: 'int' },
  instruments: {
    id: 'text',
    name: 'text',
    ticker: 'text',
    isin: 'text',
    asset_class: 'text',
    currency: 'text',
    region: 'text',
    sector: 'text',
    block_id: 'text',
    max_weight_pct: 'text',
    account_id: 'text',
    active: 'bool',
    notes: 'text',
    created_at: 'text',
    updated_at: 'text'
  },
  investment_ops: {
    id: 'text',
    date: 'text',
    account_id: 'text',
    instrument_id: 'text',
    type: 'text',
    quantity: 'text',
    price: 'text',
    amount_cents: 'int',
    fee_cents: 'int',
    tax_cents: 'int',
    split_ratio: 'text',
    affects_cash: 'bool',
    notes: 'text',
    created_at: 'text',
    updated_at: 'text'
  },
  prices: { id: 'text', instrument_id: 'text', date: 'text', price: 'text', notes: 'text' },
  transactions: {
    id: 'text',
    date: 'text',
    account_id: 'text',
    description: 'text',
    amount_cents: 'int',
    currency: 'text',
    type: 'text',
    category_id: 'text',
    subcategory_id: 'text',
    merchant: 'text',
    recurring_id: 'text',
    goal_id: 'text',
    transfer_id: 'text',
    linked_tx_id: 'text',
    investment_op_id: 'text',
    status: 'text',
    nature: 'text',
    source: 'text',
    notes: 'text',
    created_at: 'text',
    updated_at: 'text'
  },
  budgets: { id: 'text', month: 'text', category_id: 'text', amount_cents: 'int', alert_pct: 'int' },
  scenarios: {
    id: 'text',
    name: 'text',
    income_factor: 'text',
    expense_factor: 'text',
    variable_monthly_cents: 'int',
    notes: 'text',
    sort_order: 'int'
  }
} as const satisfies Record<string, Record<string, ColType>>

export type TableName = keyof typeof TABLES

/** Orden de inserción que respeta las claves foráneas (para importar/restaurar). */
export const TABLE_ORDER: TableName[] = [
  'category_groups',
  'categories',
  'subcategories',
  'accounts',
  'reconciliations',
  'recurring_rules',
  'goals',
  'goal_allocations',
  'allocation_blocks',
  'instruments',
  'investment_ops',
  'prices',
  'transactions',
  'budgets',
  'scenarios'
]

export const ID_PREFIX: Record<TableName, { prefix: string; pad: number }> = {
  category_groups: { prefix: 'GRP', pad: 3 },
  categories: { prefix: 'CAT', pad: 3 },
  subcategories: { prefix: 'SUB', pad: 3 },
  accounts: { prefix: 'ACC', pad: 3 },
  reconciliations: { prefix: 'RCN', pad: 4 },
  recurring_rules: { prefix: 'REC', pad: 3 },
  goals: { prefix: 'G', pad: 3 },
  goal_allocations: { prefix: 'GA', pad: 4 },
  allocation_blocks: { prefix: 'BLK', pad: 3 },
  instruments: { prefix: 'INS', pad: 3 },
  investment_ops: { prefix: 'OP', pad: 5 },
  prices: { prefix: 'PRC', pad: 5 },
  transactions: { prefix: 'TX', pad: 5 },
  budgets: { prefix: 'BUD', pad: 5 },
  scenarios: { prefix: 'SCN', pad: 3 }
}

export function camel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function snake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

export function rowToEntity<T>(table: TableName, row: Record<string, unknown>): T {
  const cols = TABLES[table] as Record<string, ColType>
  const out: Record<string, unknown> = {}
  for (const [col, type] of Object.entries(cols)) {
    const v = row[col]
    const key = camel(col)
    if (v === undefined || v === null) out[key] = type === 'bool' ? false : null
    else if (type === 'bool') out[key] = v === 1 || v === true
    else if (type === 'int') out[key] = Number(v)
    else out[key] = String(v)
  }
  return out as T
}

export function entityToRow(table: TableName, entity: Record<string, unknown>): Record<string, string | number | null> {
  const cols = TABLES[table] as Record<string, ColType>
  const out: Record<string, string | number | null> = {}
  for (const [col, type] of Object.entries(cols)) {
    const key = camel(col)
    if (!(key in entity)) continue
    const v = entity[key]
    if (v === undefined || v === null || v === '') out[col] = type === 'bool' ? 0 : v === '' && type === 'text' ? null : null
    else if (type === 'bool') out[col] = v ? 1 : 0
    else if (type === 'int') out[col] = Math.round(Number(v))
    else out[col] = String(v)
  }
  return out
}

export function selectAll<T>(db: Db, table: TableName, orderBy = 'id'): T[] {
  return db.all(`SELECT * FROM ${table} ORDER BY ${orderBy}`).map((r) => rowToEntity<T>(table, r))
}

export function selectById<T>(db: Db, table: TableName, id: string): T | null {
  const r = db.get(`SELECT * FROM ${table} WHERE id = ?`, [id])
  return r ? rowToEntity<T>(table, r) : null
}

export function insertRow(db: Db, table: TableName, row: Record<string, string | number | null>): void {
  const cols = Object.keys(row)
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  db.run(
    sql,
    cols.map((c) => row[c])
  )
}

export function updateRow(db: Db, table: TableName, id: string, row: Record<string, string | number | null>): void {
  const cols = Object.keys(row).filter((c) => c !== 'id' && c !== 'created_at')
  if (!cols.length) return
  db.run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => row[c]), id])
}

/** Siguiente ID libre con prefijo (nunca se reutiliza aunque se borren registros). */
export function nextId(db: Db, table: TableName): string {
  const { prefix, pad } = ID_PREFIX[table]
  return nextSequence(db, table, prefix, pad)
}

export function nextSequence(db: Db, name: string, prefix: string, pad: number): string {
  const r = db.get<{ next_value: number }>('SELECT next_value FROM sequences WHERE name = ?', [name])
  let n = r?.next_value ?? 1
  // asegurar que no choca con IDs existentes (por ejemplo tras importar)
  if (name in TABLES) {
    const like = `${prefix}%`
    const rows = db.all<{ id: string }>(`SELECT id FROM ${name} WHERE id LIKE ?`, [like])
    let max = 0
    for (const row of rows) {
      const num = Number(row.id.slice(prefix.length))
      if (Number.isInteger(num) && num > max) max = num
    }
    if (max >= n) n = max + 1
  }
  db.run('INSERT INTO sequences (name, next_value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET next_value = excluded.next_value', [
    name,
    n + 1
  ])
  return `${prefix}${String(n).padStart(pad, '0')}`
}
