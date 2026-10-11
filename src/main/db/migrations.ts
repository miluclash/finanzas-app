// Migraciones del esquema. Cada una se aplica una sola vez, en orden, dentro de una transacción.
import type { Db } from './db'

export interface Migration {
  version: number
  name: string
  up: string
}

const DATE_CHECK = (col: string) => `CHECK (${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`
const NULLABLE_DATE_CHECK = (col: string) => `CHECK (${col} IS NULL OR ${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`
const BOOL = (col: string, def: 0 | 1) => `${col} INTEGER NOT NULL DEFAULT ${def} CHECK (${col} IN (0,1))`

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'esquema inicial',
    up: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sequences (
  name TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL CHECK (next_value > 0)
);

CREATE TABLE category_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  group_id TEXT NOT NULL REFERENCES category_groups(id) ON UPDATE CASCADE,
  default_nature TEXT NOT NULL DEFAULT 'VARIABLE' CHECK (default_nature IN ('FIXED','VARIABLE','EXTRAORDINARY')),
  ${BOOL('active', 1)},
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
  ${BOOL('active', 1)},
  UNIQUE (category_id, name)
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  institution TEXT,
  type TEXT NOT NULL CHECK (type IN ('CHECKING','SAVINGS','CASH','INVESTMENT','CRYPTO','LIABILITY','OTHER')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date TEXT NOT NULL ${DATE_CHECK('opening_date')},
  ${BOOL('active', 1)},
  ${BOOL('include_net_worth', 1)},
  ${BOOL('include_liquidity', 0)},
  initial_contributions_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE reconciliations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL ${DATE_CHECK('date')},
  bank_balance_cents INTEGER NOT NULL,
  computed_balance_cents INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_reconciliations_account ON reconciliations(account_id, date);

CREATE TABLE recurring_rules (
  id TEXT PRIMARY KEY,
  concept TEXT NOT NULL CHECK (length(trim(concept)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE','TRANSFER')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY','YEARLY','ONE_OFF')),
  start_date TEXT ${NULLABLE_DATE_CHECK('start_date')},
  end_date TEXT ${NULLABLE_DATE_CHECK('end_date')},
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  ${BOOL('essential', 0)},
  ${BOOL('active', 1)},
  min_cents INTEGER CHECK (min_cents IS NULL OR min_cents >= 0),
  max_cents INTEGER CHECK (max_cents IS NULL OR max_cents >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind <> 'TRANSFER' OR (to_account_id IS NOT NULL AND to_account_id <> account_id)),
  CHECK (frequency <> 'ONE_OFF' OR start_date IS NOT NULL),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('REQUIRED','PLANNED','OPTIONAL','LONG_TERM')),
  priority TEXT NOT NULL CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  target_cents INTEGER CHECK (target_cents IS NULL OR target_cents >= 0),
  deadline TEXT ${NULLABLE_DATE_CHECK('deadline')},
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  linked_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  planned_monthly_cents INTEGER CHECK (planned_monthly_cents IS NULL OR planned_monthly_cents >= 0),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE goal_allocations (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date TEXT NOT NULL ${DATE_CHECK('date')},
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE allocation_blocks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  target_pct TEXT NOT NULL DEFAULT '0',
  max_pct TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE instruments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  ticker TEXT,
  isin TEXT,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('ETF','STOCK','FUND','BOND','METAL','CRYPTO','CASH','OTHER')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  region TEXT,
  sector TEXT,
  block_id TEXT REFERENCES allocation_blocks(id) ON DELETE SET NULL,
  max_weight_pct TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  ${BOOL('active', 1)},
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE investment_ops (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL ${DATE_CHECK('date')},
  account_id TEXT NOT NULL REFERENCES accounts(id),
  instrument_id TEXT REFERENCES instruments(id),
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','DIVIDEND','INTEREST','FEE','SPLIT')),
  quantity TEXT,
  price TEXT,
  amount_cents INTEGER,
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  split_ratio TEXT,
  ${BOOL('affects_cash', 1)},
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (type NOT IN ('BUY','SELL','SPLIT') OR instrument_id IS NOT NULL),
  CHECK (type NOT IN ('BUY','SELL') OR (quantity IS NOT NULL AND price IS NOT NULL)),
  CHECK (type <> 'SPLIT' OR split_ratio IS NOT NULL)
);
CREATE INDEX idx_ops_instrument ON investment_ops(instrument_id, date);

CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  date TEXT NOT NULL ${DATE_CHECK('date')},
  price TEXT NOT NULL,
  notes TEXT,
  UNIQUE (instrument_id, date)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL ${DATE_CHECK('date')},
  account_id TEXT NOT NULL REFERENCES accounts(id),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  type TEXT NOT NULL CHECK (type IN ('INCOME','EXPENSE','REFUND','TRANSFER','INVESTMENT_BUY','INVESTMENT_SELL','ADJUSTMENT')),
  category_id TEXT REFERENCES categories(id),
  subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
  merchant TEXT,
  recurring_id TEXT REFERENCES recurring_rules(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  transfer_id TEXT,
  linked_tx_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  investment_op_id TEXT REFERENCES investment_ops(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','PENDING_REVIEW','CANCELLED')),
  nature TEXT CHECK (nature IS NULL OR nature IN ('FIXED','VARIABLE','EXTRAORDINARY')),
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (type IN ('INCOME','REFUND','INVESTMENT_SELL') AND amount_cents > 0) OR
    (type IN ('EXPENSE','INVESTMENT_BUY') AND amount_cents < 0) OR
    (type = 'TRANSFER' AND amount_cents <> 0 AND transfer_id IS NOT NULL) OR
    (type = 'ADJUSTMENT')
  )
);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_account ON transactions(account_id, date);
CREATE INDEX idx_tx_category ON transactions(category_id);
CREATE INDEX idx_tx_transfer ON transactions(transfer_id);
CREATE INDEX idx_tx_op ON transactions(investment_op_id);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  alert_pct INTEGER CHECK (alert_pct IS NULL OR (alert_pct BETWEEN 1 AND 100)),
  UNIQUE (month, category_id)
);

CREATE TABLE scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  income_factor TEXT NOT NULL DEFAULT '1',
  expense_factor TEXT NOT NULL DEFAULT '1',
  variable_monthly_cents INTEGER NOT NULL DEFAULT 0 CHECK (variable_monthly_cents >= 0),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE duplicate_dismissals (
  tx_a TEXT NOT NULL,
  tx_b TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tx_a, tx_b)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT,
  before_json TEXT,
  after_json TEXT
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
`
  }
]

export function migrate(db: Db): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`)
  const done = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version))
  let applied = 0
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue
    db.tx(() => {
      db.exec(m.up)
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString()
      ])
    })
    applied++
  }
  return applied
}

export function schemaVersion(db: Db): number {
  const r = db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations')
  return r?.v ?? 0
}
