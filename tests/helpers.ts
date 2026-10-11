import { Db } from '../src/main/db/db'
import { saveAccount } from '../src/main/services/catalog'
import { AppState } from '../src/main/services/state'
import { saveTransaction, saveTransfer } from '../src/main/services/transactions'
import type { AccountInput, TxInput } from '../src/shared/schemas'

/** App en memoria (sin archivo) con la fecha de hoy fijada. */
export async function memoryApp(today = '2026-10-11'): Promise<AppState> {
  const db = await Db.open(null)
  const s = AppState.init(db, { dbPath: null, backupsDir: null })
  s.todayOverride = today
  return s
}

export function account(s: AppState, a: Partial<AccountInput> & { name: string }) {
  return saveAccount(s, {
    type: 'CHECKING',
    openingBalanceCents: 0,
    openingDate: '2026-06-01',
    active: true,
    includeNetWorth: true,
    includeLiquidity: a.type === undefined || a.type === 'CHECKING' || a.type === 'CASH',
    ...a
  })
}

export function cat(s: AppState, name: string): string {
  const c = s.snap().categories.find((x) => x.name === name)
  if (!c) throw new Error(`categoría ${name} no encontrada`)
  return c.id
}

export function tx(s: AppState, t: Partial<TxInput> & Pick<TxInput, 'accountId' | 'amountCents'>) {
  return saveTransaction(s, {
    date: '2026-10-01',
    description: 'Movimiento',
    type: t.amountCents >= 0 ? 'INCOME' : 'EXPENSE',
    categoryId: t.amountCents >= 0 ? cat(s, 'Nómina') : cat(s, 'Alimentación'),
    ...t
  })
}

export function transfer(s: AppState, from: string, to: string, amountCents: number, date = '2026-10-01') {
  return saveTransfer(s, { date, fromAccountId: from, toAccountId: to, amountCents, description: 'Traspaso' })
}
