// Cuentas, conciliaciones, grupos, categorías, subcategorías y ajustes.
import { accountCashBalance, allBalances } from '@shared/domain/ledger'
import { holdingsValueByAccount } from '@shared/domain/investments'
import {
  AccountInput,
  CategoryInput,
  GroupInput,
  ReconcileInput,
  SettingsInput,
  SubcategoryInput
} from '@shared/schemas'
import type { Account, Category, CategoryGroup, Reconciliation, Settings, Subcategory } from '@shared/types'
import { audit, getSettings, setSettings } from '../db/store'
import { insertRow, nextId } from '../db/tables'
import { deleteEntity, friendlySqlError, parseInput, saveEntity } from './crud'
import { UserError, type AppState } from './state'

export function getCatalog(s: AppState) {
  const snap = s.snap()
  return {
    settings: snap.settings,
    accounts: snap.accounts,
    groups: snap.groups,
    categories: snap.categories,
    subcategories: snap.subcategories,
    goals: snap.goals,
    recurring: snap.recurring,
    instruments: snap.instruments,
    blocks: snap.blocks,
    scenarios: snap.scenarios
  }
}

export function updateSettings(s: AppState, patch: Partial<Settings>): Settings {
  const data = parseInput(SettingsInput, patch)
  const before = getSettings(s.db)
  s.db.tx(() => {
    setSettings(s.db, data as Partial<Settings>)
    const keys = Object.keys(data).filter((k) => !k.startsWith('last'))
    if (keys.length) audit(s.db, 'settings', 'settings', 'update', keys.join(', '), before, data)
  })
  return getSettings(s.db)
}

// ---------- Cuentas ----------

export function listAccounts(s: AppState) {
  const ctx = s.ctx()
  const balances = new Map(allBalances(ctx).map((b) => [b.accountId, b]))
  const txCount = new Map<string, number>()
  for (const t of ctx.transactions) txCount.set(t.accountId, (txCount.get(t.accountId) ?? 0) + 1)
  return ctx.accounts.map((a) => ({ account: a, balance: balances.get(a.id)!, txCount: txCount.get(a.id) ?? 0 }))
}

export function saveAccount(s: AppState, input: AccountInput): Account {
  const d = parseInput(AccountInput, input)
  if (d.type === 'LIABILITY' && d.includeLiquidity) throw new UserError('Un pasivo no puede contar como liquidez.')
  return saveEntity<Account>(
    s,
    'accounts',
    d.id,
    (ex, id, now) => ({
      id,
      name: d.name,
      institution: d.institution,
      type: d.type,
      currency: d.currency.toUpperCase(),
      openingBalanceCents: d.openingBalanceCents,
      openingDate: d.openingDate,
      active: d.active,
      includeNetWorth: d.includeNetWorth,
      includeLiquidity: d.includeLiquidity,
      initialContributionsCents: d.initialContributionsCents,
      notes: d.notes,
      sortOrder: d.sortOrder ?? ex?.sortOrder ?? 0,
      createdAt: ex?.createdAt ?? now,
      updatedAt: now
    }),
    (a) => a.name
  )
}

export function deleteAccount(s: AppState, id: string): void {
  const n = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?', [id])!.n
  if (n > 0) throw new UserError(`La cuenta tiene ${n} movimientos. Desactívala en lugar de borrarla para conservar el historial.`)
  deleteEntity(s, 'accounts', id)
}

export function reconcile(s: AppState, input: ReconcileInput): Reconciliation & { differenceCents: number } {
  const d = parseInput(ReconcileInput, input)
  const ctx = s.ctx()
  if (!ctx.accountById.get(d.accountId)) throw new UserError('La cuenta no existe.')
  const computed = accountCashBalance(ctx, d.accountId, d.date) + (holdingsValueByAccount(ctx, d.date).get(d.accountId) ?? 0)
  const id = s.db.tx(() => {
    const id = nextId(s.db, 'reconciliations')
    insertRow(s.db, 'reconciliations', {
      id,
      account_id: d.accountId,
      date: d.date,
      bank_balance_cents: d.bankBalanceCents,
      computed_balance_cents: computed,
      notes: d.notes,
      created_at: s.now()
    })
    audit(s.db, 'reconciliations', id, 'create', `Saldo banco ${d.bankBalanceCents / 100} € el ${d.date}`, null, d)
    return id
  })
  const rec = s.snap().reconciliations.find((r) => r.id === id)!
  return { ...rec, differenceCents: computed - d.bankBalanceCents }
}

export function listReconciliations(s: AppState, accountId: string) {
  const ctx = s.ctx()
  return ctx.reconciliations
    .filter((r) => r.accountId === accountId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((r) => {
      const now = accountCashBalance(ctx, accountId, r.date) + (holdingsValueByAccount(ctx, r.date).get(accountId) ?? 0)
      return { ...r, computedNowCents: now, differenceCents: now - r.bankBalanceCents }
    })
}

export function deleteReconciliation(s: AppState, id: string): void {
  deleteEntity(s, 'reconciliations', id, `Conciliación ${id}`)
}

// ---------- Grupos y categorías ----------

export function saveGroup(s: AppState, input: GroupInput): CategoryGroup {
  const d = parseInput(GroupInput, input)
  if (d.id) {
    const used = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM categories WHERE group_id = ?', [d.id])!.n
    const old = s.snap().groups.find((g) => g.id === d.id)
    if (old && old.kind !== d.kind && used > 0)
      throw new UserError('No se puede cambiar de ingresos a gastos un grupo que ya tiene categorías.')
  }
  return saveEntity<CategoryGroup>(
    s,
    'category_groups',
    d.id,
    (ex, id) => ({ id, name: d.name, kind: d.kind, sortOrder: d.sortOrder ?? ex?.sortOrder ?? 0 }),
    (g) => g.name
  )
}

export function deleteGroup(s: AppState, id: string): void {
  const used = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM categories WHERE group_id = ?', [id])!.n
  if (used) throw new UserError('El grupo tiene categorías. Muévelas a otro grupo antes de borrarlo.')
  deleteEntity(s, 'category_groups', id)
}

export function saveCategory(s: AppState, input: CategoryInput): Category {
  const d = parseInput(CategoryInput, input)
  const snap = s.snap()
  const group = snap.groups.find((g) => g.id === d.groupId)
  if (!group) throw new UserError('El grupo no existe.')
  if (d.id) {
    const old = snap.categories.find((c) => c.id === d.id)
    const oldGroup = snap.groups.find((g) => g.id === old?.groupId)
    if (old && oldGroup && oldGroup.kind !== group.kind) {
      const used = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?', [d.id])!.n
      if (used) throw new UserError('No se puede pasar a un grupo de distinto tipo (ingresos/gastos) una categoría con movimientos.')
    }
  }
  return saveEntity<Category>(
    s,
    'categories',
    d.id,
    (ex, id) => ({
      id,
      name: d.name,
      groupId: d.groupId,
      defaultNature: d.defaultNature,
      active: d.active,
      sortOrder: d.sortOrder ?? ex?.sortOrder ?? 0,
      notes: d.notes
    }),
    (c) => c.name
  )
}

export function categoryUsage(s: AppState, id: string) {
  const q = (sql: string) => s.db.get<{ n: number }>(sql, [id])!.n
  return {
    transactions: q('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?'),
    recurring: q('SELECT COUNT(*) AS n FROM recurring_rules WHERE category_id = ?'),
    budgets: q('SELECT COUNT(*) AS n FROM budgets WHERE category_id = ?')
  }
}

/** Borra una categoría. Si tiene movimientos, se reasignan a `reassignTo` (obligatorio en ese caso). */
export function deleteCategory(s: AppState, id: string, reassignTo?: string | null): void {
  const usage = categoryUsage(s, id)
  if ((usage.transactions || usage.recurring) && !reassignTo)
    throw new UserError(`La categoría se usa en ${usage.transactions} movimientos y ${usage.recurring} recurrentes. Elige a qué categoría pasarlos.`)
  if (reassignTo === id) throw new UserError('Elige una categoría distinta.')
  try {
    s.db.tx(() => {
      if (reassignTo) {
        const now = s.now()
        s.db.run('UPDATE transactions SET category_id = ?, subcategory_id = NULL, updated_at = ? WHERE category_id = ?', [reassignTo, now, id])
        s.db.run('UPDATE recurring_rules SET category_id = ? WHERE category_id = ?', [reassignTo, id])
      }
      s.db.run('DELETE FROM budgets WHERE category_id = ?', [id])
      const before = s.snap().categories.find((c) => c.id === id)
      s.db.run('DELETE FROM subcategories WHERE category_id = ?', [id])
      s.db.run('DELETE FROM categories WHERE id = ?', [id])
      audit(s.db, 'categories', id, 'delete', `${before?.name}${reassignTo ? ` → ${reassignTo}` : ''}`, before, null)
    })
  } catch (e) {
    if (e instanceof UserError) throw e
    friendlySqlError(e)
  }
}

export function saveSubcategory(s: AppState, input: SubcategoryInput): Subcategory {
  const d = parseInput(SubcategoryInput, input)
  return saveEntity<Subcategory>(
    s,
    'subcategories',
    d.id,
    (_ex, id) => ({ id, categoryId: d.categoryId, name: d.name, active: d.active }),
    (c) => c.name
  )
}

export function deleteSubcategory(s: AppState, id: string): void {
  s.db.tx(() => {
    s.db.run('UPDATE transactions SET subcategory_id = NULL WHERE subcategory_id = ?', [id])
    deleteEntity(s, 'subcategories', id)
  })
}

/** Fusiona una subcategoría en otra (corrige variantes como "Cuota Gimasio" → "Cuota gimnasio"). */
export function mergeSubcategories(s: AppState, fromId: string, intoId: string): number {
  if (fromId === intoId) throw new UserError('Elige dos subcategorías distintas.')
  const snap = s.snap()
  const from = snap.subcategories.find((x) => x.id === fromId)
  const into = snap.subcategories.find((x) => x.id === intoId)
  if (!from || !into) throw new UserError('Alguna subcategoría no existe.')
  let moved = 0
  s.db.tx(() => {
    moved = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE subcategory_id = ?', [fromId])!.n
    s.db.run('UPDATE transactions SET subcategory_id = ?, category_id = ? WHERE subcategory_id = ?', [intoId, into.categoryId, fromId])
    s.db.run('DELETE FROM subcategories WHERE id = ?', [fromId])
    audit(s.db, 'subcategories', fromId, 'merge', `${from.name} → ${into.name} (${moved} movimientos)`, from, into)
  })
  return moved
}

export function createSubcategoryIfMissing(s: AppState, categoryId: string, name: string): string {
  const ex = s.db.get<{ id: string }>('SELECT id FROM subcategories WHERE category_id = ? AND name = ? COLLATE NOCASE', [categoryId, name])
  if (ex) return ex.id
  const id = nextId(s.db, 'subcategories')
  insertRow(s.db, 'subcategories', { id, category_id: categoryId, name, active: 1 })
  return id
}
