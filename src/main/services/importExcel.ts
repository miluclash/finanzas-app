// Importación del FINANCIAL_MASTER.xlsx con vista previa.
// Solo se importan datos de entrada; los valores calculados por fórmulas se recalculan en la app
// (se leen únicamente para comprobar que los saldos cuadran).
import ExcelJS from 'exceljs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildCtx } from '@shared/domain/ctx'
import { accountCashBalance } from '@shared/domain/ledger'
import { allDuplicatePairs, transactionIssues } from '@shared/domain/validation'
import { isISODate } from '@shared/dates'
import { eurosToCents, formatEur } from '@shared/money'
import type {
  Account,
  AccountType,
  Budget,
  Category,
  CategoryGroup,
  DataSnapshot,
  Frequency,
  Goal,
  GoalAllocation,
  GoalStatus,
  GoalType,
  Nature,
  Priority,
  Reconciliation,
  RecurringRule,
  Scenario,
  Settings,
  Subcategory,
  Transaction,
  TxStatus,
  TxType
} from '@shared/types'
import { TX_TYPES } from '@shared/types'
import { audit, DEFAULT_SETTINGS, getSettings, setSettings } from '../db/store'
import { entityToRow, insertRow, TABLE_ORDER, type TableName } from '../db/tables'
import { UserError, type AppState } from './state'

type Cell = string | number | boolean | Date | null

function cellValue(c: ExcelJS.Cell | undefined): Cell {
  if (!c) return null
  const v = c.value as unknown
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) {
      const r = o.result as unknown
      if (r === undefined || r === null) return null
      if (r instanceof Date) return r
      if (typeof r === 'object' && r && 'error' in (r as object)) return null
      return r as Cell
    }
    if ('richText' in o) return (o.richText as Array<{ text: string }>).map((t) => t.text).join('')
    if ('text' in o) return String(o.text)
    if ('error' in o) return null
    return null
  }
  return v as Cell
}

function str(v: Cell): string | null {
  if (v === null) return null
  if (v instanceof Date) return toISO(v)
  const s = String(v).trim()
  return s === '' ? null : s
}

function num(v: Cell): number | null {
  if (v === null || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function date(v: Cell): string | null {
  if (v === null) return null
  if (v instanceof Date) return toISO(v)
  if (typeof v === 'number') {
    // número de serie de Excel
    const ms = Math.round((v - 25569) * 86400000)
    return toISO(new Date(ms))
  }
  const s = String(v).trim()
  if (isISODate(s.slice(0, 10))) return s.slice(0, 10)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function yes(v: Cell): boolean {
  return String(v ?? '').trim().toUpperCase() === 'YES'
}

/** Lee una tabla a partir de la fila de cabecera que contiene `firstHeader` en la columna A. */
function readTable(ws: ExcelJS.Worksheet, firstHeader: string): Array<{ row: number; get: (h: string) => Cell }> {
  let headerRow = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    if (str(cellValue(ws.getCell(r, 1))) === firstHeader) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) throw new UserError(`No encuentro la cabecera "${firstHeader}" en la hoja ${ws.name}.`)
  const cols = new Map<string, number>()
  ws.getRow(headerRow).eachCell((c, col) => {
    const h = str(cellValue(c))
    if (h) cols.set(h, col)
  })
  const out: Array<{ row: number; get: (h: string) => Cell }> = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const first = cellValue(ws.getCell(r, 1))
    const row = r
    const get = (h: string) => {
      const col = cols.get(h)
      return col ? cellValue(ws.getCell(row, col)) : null
    }
    if (first === null || first === '') {
      // fila vacía (puede haber fórmulas calculadas sin datos): se ignora
      continue
    }
    out.push({ row, get })
  }
  return out
}

const GROUP_MAP: Record<string, { name: string; kind: 'INCOME' | 'EXPENSE' }> = {
  income: { name: 'Ingresos', kind: 'INCOME' },
  essential: { name: 'Esenciales', kind: 'EXPENSE' },
  lifestyle: { name: 'Estilo de vida', kind: 'EXPENSE' },
  financial: { name: 'Financieros', kind: 'EXPENSE' },
  other: { name: 'Otros', kind: 'EXPENSE' }
}

const FIXED_CATEGORIES = new Set([
  'salary',
  'internship',
  'housing',
  'insurance',
  'communications',
  'gym',
  'subscriptions',
  'debt repayment'
])

const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  checking: 'CHECKING',
  savings: 'SAVINGS',
  cash: 'CASH',
  investment: 'INVESTMENT',
  crypto: 'CRYPTO',
  liability: 'LIABILITY',
  other: 'OTHER'
}

const FREQ_MAP: Record<string, Frequency> = {
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  quarterly: 'QUARTERLY',
  yearly: 'YEARLY',
  'one-off': 'ONE_OFF',
  oneoff: 'ONE_OFF'
}

const GOAL_TYPE_MAP: Record<string, GoalType> = {
  required: 'REQUIRED',
  planned: 'PLANNED',
  optional: 'OPTIONAL',
  'long-term': 'LONG_TERM',
  longterm: 'LONG_TERM'
}

const PRIORITY_MAP: Record<string, Priority> = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }

export interface ImportData {
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
  settings: Partial<Settings>
}

export interface ImportPreview {
  token: string
  fileName: string
  counts: Record<string, number>
  errors: string[]
  warnings: string[]
  skipped: Array<{ sheet: string; row: number; reason: string }>
  duplicates: Array<{ a: string; b: string; text: string }>
  balanceCheck: Array<{ accountId: string; name: string; appCents: number; excelCents: number | null; ok: boolean }>
  recurringLinked: number
  recurringUnlinked: number
  issueCount: { errors: number; warnings: number }
  existing: { accounts: number; transactions: number }
  months: { from: string | null; to: string | null }
}

const pending = new Map<string, { data: ImportData; fileName: string }>()

export async function parseFinancialMaster(filePath: string, today: string): Promise<{ data: ImportData; preview: Omit<ImportPreview, 'token' | 'existing'> }> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(filePath)
  } catch (e) {
    throw new UserError(`No se pudo abrir el Excel: ${e instanceof Error ? e.message : String(e)}`)
  }
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name)
    if (!ws) throw new UserError(`Falta la hoja ${name}. ¿Es un FINANCIAL_MASTER?`)
    return ws
  }
  const errors: string[] = []
  const warnings: string[] = []
  const skipped: ImportPreview['skipped'] = []
  const now = new Date().toISOString()

  // ---------- 00_CONFIG ----------
  const cfg = sheet('00_CONFIG')
  const params = new Map<string, Cell>()
  for (let r = 1; r <= Math.min(cfg.rowCount, 60); r++) {
    const k = str(cellValue(cfg.getCell(r, 1)))
    if (k) params.set(k, cellValue(cfg.getCell(r, 2)))
  }
  // lista de categorías: cabecera "Category" / "Group"
  let catCol = -1
  let catHeaderRow = -1
  for (let r = 1; r <= 10 && catCol < 0; r++) {
    cfg.getRow(r).eachCell((c, col) => {
      if (str(cellValue(c)) === 'Category' && str(cellValue(cfg.getCell(r, col + 1))) === 'Group') {
        catCol = col
        catHeaderRow = r
      }
    })
  }
  if (catCol < 0) throw new UserError('No encuentro la lista de categorías en 00_CONFIG.')
  const groups: CategoryGroup[] = []
  const groupByExcel = new Map<string, CategoryGroup>()
  const categories: Category[] = []
  const catByName = new Map<string, Category>()
  for (let r = catHeaderRow + 1; r <= cfg.rowCount; r++) {
    const cname = str(cellValue(cfg.getCell(r, catCol)))
    const gname = str(cellValue(cfg.getCell(r, catCol + 1)))
    if (!cname || !gname) continue
    const gkey = gname.toLowerCase()
    if (gkey === 'internal') continue // transferencias/ajustes: en la app no llevan categoría
    let g = groupByExcel.get(gkey)
    if (!g) {
      const mapped = GROUP_MAP[gkey] ?? { name: gname, kind: 'EXPENSE' as const }
      g = { id: `GRP${String(groups.length + 1).padStart(3, '0')}`, name: mapped.name, kind: mapped.kind, sortOrder: groups.length }
      groups.push(g)
      groupByExcel.set(gkey, g)
    }
    if (catByName.has(cname.toLowerCase())) continue
    const c: Category = {
      id: `CAT${String(categories.length + 1).padStart(3, '0')}`,
      name: cname,
      groupId: g.id,
      defaultNature: (FIXED_CATEGORIES.has(cname.toLowerCase()) ? 'FIXED' : 'VARIABLE') as Nature,
      active: true,
      sortOrder: categories.length,
      notes: null
    }
    categories.push(c)
    catByName.set(cname.toLowerCase(), c)
  }

  const trackingStart = date(params.get('Tracking Start') ?? null) ?? DEFAULT_SETTINGS.trackingStart
  const settings: Partial<Settings> = {
    trackingStart,
    minLiquidityCents: eurosToCents(num(params.get('Minimum Liquidity Threshold (€)') ?? null) ?? 0),
    emergencyMonths: Math.round(num(params.get('Emergency Fund Target (months)') ?? null) ?? 3),
    investmentIncomeCategoryId: catByName.get('investment income')?.id ?? null,
    investmentFeeCategoryId: catByName.get('bank fees')?.id ?? null
  }
  const variableBase = eurosToCents(num(params.get('Variable Expenses — base (€/month)') ?? null) ?? 0)
  const scenarioRows: Array<[string, string, string]> = []
  for (const key of ['BASE', 'CONSERVATIVE', 'OPTIMISTIC']) {
    for (let r = 1; r <= Math.min(cfg.rowCount, 60); r++) {
      if (str(cellValue(cfg.getCell(r, 1))) === key && num(cellValue(cfg.getCell(r, 2))) !== null) {
        scenarioRows.push([key, String(num(cellValue(cfg.getCell(r, 2)))), String(num(cellValue(cfg.getCell(r, 3))) ?? 1)])
        break
      }
    }
  }
  const scenarioNames: Record<string, string> = { BASE: 'Base', CONSERVATIVE: 'Conservador', OPTIMISTIC: 'Optimista' }
  const scenarios: Scenario[] = (scenarioRows.length ? scenarioRows : [
    ['BASE', '1', '1'],
    ['CONSERVATIVE', '0.95', '1.1'],
    ['OPTIMISTIC', '1.05', '0.95']
  ]).map(([k, inc, exp], i) => ({
    id: `SCN${String(i + 1).padStart(3, '0')}`,
    name: scenarioNames[k] ?? k,
    incomeFactor: inc,
    expenseFactor: exp,
    variableMonthlyCents: variableBase,
    notes: null,
    sortOrder: i
  }))
  const chosen = str(params.get('Forecast Scenario') ?? null)?.toUpperCase()
  const chosenIdx = scenarioRows.findIndex((s) => s[0] === chosen)
  settings.forecastScenarioId = scenarios[Math.max(chosenIdx, 0)].id
  const goalMonthly = num(params.get('Monthly Goal Contributions (€)') ?? null) ?? 0
  const invMonthly = num(params.get('Monthly Investment Budget (€)') ?? null) ?? 0
  if (goalMonthly > 0)
    warnings.push(`El Excel tenía ${formatEur(eurosToCents(goalMonthly))}/mes de aportación a objetivos: indícalo en cada objetivo ("aportación mensual prevista").`)
  if (invMonthly > 0)
    warnings.push(`El Excel tenía ${formatEur(eurosToCents(invMonthly))}/mes de inversión: créalo como transferencia recurrente a tu cuenta de bróker.`)

  // ---------- 01_ACCOUNTS ----------
  const accounts: Account[] = []
  const excelBalance = new Map<string, number | null>()
  const verified: Array<{ accountId: string; date: string; cents: number }> = []
  for (const r of readTable(sheet('01_ACCOUNTS'), 'Account_ID')) {
    const id = str(r.get('Account_ID'))!
    const name = str(r.get('Account'))
    if (!name) {
      skipped.push({ sheet: '01_ACCOUNTS', row: r.row, reason: 'Cuenta sin nombre' })
      continue
    }
    const t = ACCOUNT_TYPE_MAP[(str(r.get('Type')) ?? 'other').toLowerCase()]
    if (!t) warnings.push(`Cuenta ${id}: tipo "${str(r.get('Type'))}" desconocido, se importa como "Otro activo".`)
    const opening = date(r.get('Opening_Date')) ?? trackingStart
    const type = t ?? 'OTHER'
    accounts.push({
      id,
      name,
      institution: str(r.get('Institution')) === '—' ? null : str(r.get('Institution')),
      type,
      currency: str(r.get('Currency')) ?? 'EUR',
      openingBalanceCents: eurosToCents(num(r.get('Opening_Balance (€)')) ?? 0),
      openingDate: opening,
      active: yes(r.get('Active')),
      includeNetWorth: yes(r.get('Include_Net_Worth')),
      includeLiquidity: type !== 'LIABILITY' && yes(r.get('Include_Liquidity')),
      initialContributionsCents: 0,
      notes: str(r.get('Notes')),
      sortOrder: accounts.length,
      createdAt: now,
      updatedAt: now
    })
    const cb = num(r.get('Current_Balance (€)'))
    excelBalance.set(id, cb === null ? null : eurosToCents(cb))
    const vd = date(r.get('Last_Verified'))
    const vb = num(r.get('Verified_Balance (€)'))
    if (vd && vb !== null) verified.push({ accountId: id, date: vd, cents: eurosToCents(vb) })
  }
  const accIds = new Set(accounts.map((a) => a.id))

  // ---------- 04_GOALS ----------
  const goals: Goal[] = []
  for (const r of readTable(sheet('04_GOALS'), 'Goal_ID')) {
    const id = str(r.get('Goal_ID'))!
    const name = str(r.get('Goal'))
    if (!name) {
      skipped.push({ sheet: '04_GOALS', row: r.row, reason: 'Objetivo sin nombre' })
      continue
    }
    const linked = str(r.get('Linked_Account_ID'))
    if (linked && !accIds.has(linked)) warnings.push(`Objetivo ${id}: la cuenta vinculada ${linked} no existe; se importa sin vincular.`)
    const target = num(r.get('Target (€)'))
    goals.push({
      id,
      name,
      type: GOAL_TYPE_MAP[(str(r.get('Goal_Type')) ?? 'planned').toLowerCase()] ?? 'PLANNED',
      priority: PRIORITY_MAP[(str(r.get('Priority')) ?? 'medium').toLowerCase()] ?? 'MEDIUM',
      targetCents: target === null ? null : eurosToCents(target),
      deadline: date(r.get('Deadline')),
      status: (yes(r.get('Active')) ? 'ACTIVE' : 'PAUSED') as GoalStatus,
      linkedAccountId: linked && accIds.has(linked) ? linked : null,
      plannedMonthlyCents: null,
      notes: str(r.get('Notes')),
      sortOrder: goals.length,
      createdAt: now,
      updatedAt: now
    })
  }
  const goalIds = new Set(goals.map((g) => g.id))

  // ---------- 03_RECURRING ----------
  const recurring: RecurringRule[] = []
  for (const r of readTable(sheet('03_RECURRING'), 'Recurring_ID')) {
    const id = str(r.get('Recurring_ID'))!
    const concept = str(r.get('Concept'))
    const amount = num(r.get('Amount (€)'))
    if (!concept || amount === null || amount === 0) {
      skipped.push({ sheet: '03_RECURRING', row: r.row, reason: 'Recurrente sin concepto o importe' })
      continue
    }
    const freq = FREQ_MAP[(str(r.get('Frequency')) ?? '').toLowerCase()]
    if (!freq) {
      skipped.push({ sheet: '03_RECURRING', row: r.row, reason: `Frecuencia desconocida "${str(r.get('Frequency'))}"` })
      continue
    }
    const acc = str(r.get('Account_ID'))
    if (!acc || !accIds.has(acc)) {
      skipped.push({ sheet: '03_RECURRING', row: r.row, reason: `${id}: cuenta ${acc ?? '(vacía)'} no existe` })
      continue
    }
    const start = date(r.get('Next_Date'))
    if (freq === 'ONE_OFF' && !start) {
      skipped.push({ sheet: '03_RECURRING', row: r.row, reason: `${id}: cobro único sin fecha` })
      continue
    }
    const cat = catByName.get((str(r.get('Category')) ?? '').toLowerCase())
    if (!cat) warnings.push(`Recurrente ${id}: categoría "${str(r.get('Category'))}" no encontrada.`)
    const min = num(r.get('Minimum (€)'))
    const max = num(r.get('Maximum (€)'))
    recurring.push({
      id,
      concept,
      kind: amount > 0 ? 'INCOME' : 'EXPENSE',
      amountCents: Math.abs(eurosToCents(amount)),
      frequency: freq,
      startDate: start,
      endDate: date(r.get('End_Date')),
      categoryId: cat?.id ?? null,
      accountId: acc,
      toAccountId: null,
      essential: yes(r.get('Essential')),
      active: yes(r.get('Active')),
      minCents: min === null ? null : Math.abs(eurosToCents(min)),
      maxCents: max === null ? null : Math.abs(eurosToCents(max)),
      notes: str(r.get('Notes')),
      createdAt: now,
      updatedAt: now
    })
    if (!start && freq !== 'ONE_OFF')
      warnings.push(`Recurrente "${concept}" sin próxima fecha: en la previsión se cuenta su equivalente mensual.`)
  }

  // ---------- 02_TRANSACTIONS ----------
  const transactions: Transaction[] = []
  const subcategories: Subcategory[] = []
  const subByKey = new Map<string, Subcategory>()
  const allocations: GoalAllocation[] = []
  let allocSeq = 1
  const txIds = new Set<string>()
  const linkLater: Array<{ tx: Transaction; recurring: boolean }> = []
  for (const r of readTable(sheet('02_TRANSACTIONS'), 'Transaction_ID')) {
    const id = str(r.get('Transaction_ID'))
    const d = date(r.get('Date'))
    const acc = str(r.get('Account_ID'))
    const amount = num(r.get('Amount (€)'))
    const typeRaw = (str(r.get('Type')) ?? '').toUpperCase() as TxType
    if (!id || !d || amount === null) {
      skipped.push({ sheet: '02_TRANSACTIONS', row: r.row, reason: `${id ?? 'Fila'}: falta fecha o importe` })
      continue
    }
    if (txIds.has(id)) {
      skipped.push({ sheet: '02_TRANSACTIONS', row: r.row, reason: `${id}: ID repetido` })
      continue
    }
    if (!acc || !accIds.has(acc)) {
      skipped.push({ sheet: '02_TRANSACTIONS', row: r.row, reason: `${id}: la cuenta ${acc ?? '(vacía)'} no existe` })
      continue
    }
    if (!(TX_TYPES as readonly string[]).includes(typeRaw)) {
      skipped.push({ sheet: '02_TRANSACTIONS', row: r.row, reason: `${id}: tipo "${typeRaw}" desconocido` })
      continue
    }
    const cents = eurosToCents(amount)
    const goalId = str(r.get('Goal_ID'))
    const goalAmount = num(r.get('Goal_Amount (€)'))
    // Reserva virtual del Excel: fila de 0 € con Goal_Amount -> asignación al objetivo
    if (goalId && goalAmount && goalIds.has(goalId) && (cents === 0 || goalAmount > 0)) {
      allocations.push({
        id: `GA${String(allocSeq++).padStart(4, '0')}`,
        goalId,
        date: d,
        amountCents: eurosToCents(goalAmount),
        accountId: acc,
        notes: `Importado de ${id}`,
        createdAt: now
      })
      if (cents === 0) continue
    }
    const signOk =
      (['INCOME', 'REFUND', 'INVESTMENT_SELL'].includes(typeRaw) && cents > 0) ||
      (['EXPENSE', 'INVESTMENT_BUY'].includes(typeRaw) && cents < 0) ||
      (typeRaw === 'TRANSFER' && cents !== 0) ||
      typeRaw === 'ADJUSTMENT'
    if (!signOk) {
      skipped.push({ sheet: '02_TRANSACTIONS', row: r.row, reason: `${id}: el signo del importe no corresponde al tipo ${typeRaw}` })
      continue
    }
    const transferId = str(r.get('Transfer_ID'))
    if (typeRaw === 'TRANSFER' && !transferId) {
      skipped.push({ sheet: '02_TRANSACTIONS', row: r.row, reason: `${id}: transferencia sin Transfer_ID` })
      continue
    }
    const needsCat = typeRaw === 'INCOME' || typeRaw === 'EXPENSE' || typeRaw === 'REFUND'
    const catName = str(r.get('Category'))
    const cat = needsCat && catName ? catByName.get(catName.toLowerCase()) : undefined
    let status = ((str(r.get('Status')) ?? 'CONFIRMED').toUpperCase() as TxStatus) || 'CONFIRMED'
    if (!['CONFIRMED', 'PENDING_REVIEW', 'CANCELLED'].includes(status)) status = 'PENDING_REVIEW'
    if (needsCat && !cat) {
      warnings.push(`${id}: categoría "${catName ?? '(vacía)'}" no encontrada; queda pendiente de revisar.`)
      if (status === 'CONFIRMED') status = 'PENDING_REVIEW'
    }
    let subId: string | null = null
    const subName = str(r.get('Subcategory'))
    if (needsCat && cat && subName) {
      const key = `${cat.id}|${subName.toLowerCase()}`
      let sub = subByKey.get(key)
      if (!sub) {
        sub = { id: `SUB${String(subcategories.length + 1).padStart(3, '0')}`, categoryId: cat.id, name: subName, active: true }
        subcategories.push(sub)
        subByKey.set(key, sub)
      }
      subId = sub.id
    }
    const tx: Transaction = {
      id,
      date: d,
      accountId: acc,
      description: str(r.get('Description')) ?? '(sin descripción)',
      amountCents: cents,
      currency: str(r.get('Currency')) ?? 'EUR',
      type: typeRaw,
      categoryId: cat?.id ?? null,
      subcategoryId: subId,
      merchant: str(r.get('Merchant')),
      recurringId: null,
      goalId: goalId && goalIds.has(goalId) ? goalId : null,
      transferId: transferId,
      linkedTxId: str(r.get('Linked_TX_ID')),
      investmentOpId: null,
      status,
      nature: null,
      source: str(r.get('Source')) ?? 'Excel',
      notes: str(r.get('Notes')),
      createdAt: now,
      updatedAt: now
    }
    if (goalId && !goalIds.has(goalId)) warnings.push(`${id}: el objetivo ${goalId} no existe; se ignora.`)
    transactions.push(tx)
    txIds.add(id)
    linkLater.push({ tx, recurring: yes(r.get('Recurring')) })
  }
  // Enlaces a movimientos inexistentes
  for (const t of transactions)
    if (t.linkedTxId && !txIds.has(t.linkedTxId)) {
      warnings.push(`${t.id}: el movimiento relacionado ${t.linkedTxId} no existe; se quita el enlace.`)
      t.linkedTxId = null
    }
  // Enlazar movimientos marcados como recurrentes con su regla (misma cuenta, categoría y rango de importe)
  let linked = 0
  let unlinked = 0
  for (const { tx, recurring: isRec } of linkLater) {
    if (!isRec || !tx.categoryId) continue
    const abs = Math.abs(tx.amountCents)
    const cands = recurring.filter((rule) => {
      if (rule.accountId !== tx.accountId || rule.categoryId !== tx.categoryId) return false
      if (rule.kind === 'INCOME' && tx.type !== 'INCOME') return false
      if (rule.kind === 'EXPENSE' && tx.type !== 'EXPENSE') return false
      const lo = rule.minCents ?? Math.round(rule.amountCents * 0.8)
      const hi = rule.maxCents ?? Math.round(rule.amountCents * 1.2)
      return abs >= lo && abs <= hi
    })
    if (cands.length === 1) {
      tx.recurringId = cands[0].id
      tx.nature = null
      linked++
    } else {
      tx.nature = 'FIXED'
      unlinked++
    }
  }

  // Gastos grandes pagados con dinero recién sacado de una hucha -> extraordinarios
  const accType = new Map(accounts.map((a) => [a.id, a]))
  let extraordinary = 0
  for (const t of transactions) {
    if (t.type !== 'EXPENSE' || t.status === 'CANCELLED' || t.nature) continue
    const funded = transactions.find((o) => {
      if (o.type !== 'TRANSFER' || o.accountId !== t.accountId || o.amountCents <= 0 || o.status === 'CANCELLED') return false
      const days = Math.abs(Date.parse(o.date) - Date.parse(t.date)) / 86400000
      if (days > 3) return false
      if (Math.abs(o.amountCents + t.amountCents) > Math.abs(t.amountCents) * 0.05) return false
      const src = transactions.find((x) => x.transferId === o.transferId && x.id !== o.id)
      const srcAcc = src ? accType.get(src.accountId) : undefined
      return !!srcAcc && !srcAcc.includeLiquidity && srcAcc.type !== 'INVESTMENT'
    })
    if (funded) {
      t.nature = 'EXTRAORDINARY'
      extraordinary++
      warnings.push(`${t.id} (${t.description}, ${formatEur(t.amountCents)}) se marca como gasto extraordinario: se pagó con dinero de una hucha.`)
    }
  }
  void extraordinary

  // ---------- 05_MONTHLY: presupuestos ----------
  const budgets: Budget[] = []
  const monthly = wb.getWorksheet('05_MONTHLY')
  if (monthly) {
    let budgetMonth: string | null = null
    let headerRow = -1
    for (let r = 1; r <= monthly.rowCount; r++) {
      const a = str(cellValue(monthly.getCell(r, 1)))
      if (a && a.startsWith('B.')) {
        for (let c = 2; c <= 8; c++) {
          const dv = date(cellValue(monthly.getCell(r, c)))
          if (dv) budgetMonth = dv.slice(0, 7)
        }
      }
      if (a === 'Category' && str(cellValue(monthly.getCell(r, 3)))?.startsWith('Budget')) headerRow = r
    }
    if (headerRow > 0 && budgetMonth) {
      for (let r = headerRow + 1; r <= monthly.rowCount; r++) {
        const cname = str(cellValue(monthly.getCell(r, 1)))
        if (!cname || cname === 'TOTAL') continue
        const b = num(cellValue(monthly.getCell(r, 3)))
        const cat = catByName.get(cname.toLowerCase())
        if (b !== null && b > 0 && cat)
          budgets.push({ id: `BUD${String(budgets.length + 1).padStart(5, '0')}`, month: budgetMonth, categoryId: cat.id, amountCents: eurosToCents(b), alertPct: null })
      }
    }
  }

  const data: ImportData = {
    groups,
    categories,
    subcategories,
    accounts,
    reconciliations: [],
    transactions,
    recurring,
    goals,
    allocations,
    budgets,
    scenarios,
    settings
  }

  // ---------- Comprobaciones con el contexto resultante ----------
  const snapshot = toSnapshot(data)
  const ctx = buildCtx(snapshot, today)
  const balanceCheck: ImportPreview['balanceCheck'] = accounts.map((a) => {
    const app = accountCashBalance(ctx, a.id)
    const xl = excelBalance.get(a.id) ?? null
    return { accountId: a.id, name: a.name, appCents: app, excelCents: xl, ok: xl === null || xl === app }
  })
  for (const b of balanceCheck)
    if (!b.ok) errors.push(`${b.name}: la app calcula ${formatEur(b.appCents)} y el Excel decía ${formatEur(b.excelCents)}.`)

  // Saldos verificados -> conciliaciones (con la fecha corregida si el Excel la tenía desfasada)
  for (const v of verified) {
    const acc = accounts.find((a) => a.id === v.accountId)!
    let when = v.date
    const atDate = accountCashBalance(ctx, v.accountId, v.date)
    if (atDate !== v.cents) {
      const dates = [...new Set((ctx.countedByAccount.get(v.accountId) ?? []).map((t) => t.date).filter((x) => x > v.date && x <= today))].sort()
      const match = dates.find((x) => accountCashBalance(ctx, v.accountId, x) === v.cents && !dates.some((y) => y > x && accountCashBalance(ctx, v.accountId, y) !== v.cents))
      if (match) {
        warnings.push(
          `${acc.name}: el saldo verificado (${formatEur(v.cents)}) no cuadra con su fecha (${v.date}) pero sí con el saldo al ${match}. Se registra la verificación con fecha ${match}.`
        )
        when = match
      } else warnings.push(`${acc.name}: el saldo verificado no cuadra con el calculado a ${v.date} (${formatEur(atDate - v.cents)} de diferencia).`)
    }
    data.reconciliations.push({
      id: `RCN${String(data.reconciliations.length + 1).padStart(4, '0')}`,
      accountId: v.accountId,
      date: when,
      bankBalanceCents: v.cents,
      computedBalanceCents: accountCashBalance(ctx, v.accountId, when),
      notes: 'Importado del Excel (Verified_Balance)',
      createdAt: now
    })
  }

  const dupPairs = allDuplicatePairs(ctx)
  const duplicates = dupPairs.map(([a, b]) => {
    const ta = ctx.txById.get(a)!
    const tb = ctx.txById.get(b)!
    return { a, b, text: `${ta.date} ${ta.description} / ${tb.date} ${tb.description} (${formatEur(ta.amountCents)})` }
  })
  let issueErrors = 0
  let issueWarnings = 0
  for (const t of transactions) {
    const v = transactionIssues(ctx, t)
    if (v.errors.length) issueErrors++
    if (v.warnings.some((w) => w.code !== 'POSSIBLE_DUPLICATE')) issueWarnings++
  }
  const dates = transactions.map((t) => t.date).sort()
  return {
    data,
    preview: {
      fileName: path.basename(filePath),
      counts: {
        Cuentas: accounts.length,
        Movimientos: transactions.length,
        'Grupos de categorías': groups.length,
        Categorías: categories.length,
        Subcategorías: subcategories.length,
        Recurrentes: recurring.length,
        Objetivos: goals.length,
        'Reservas de objetivos': allocations.length,
        Presupuestos: budgets.length,
        Conciliaciones: data.reconciliations.length,
        Escenarios: scenarios.length
      },
      errors,
      warnings,
      skipped,
      duplicates,
      balanceCheck,
      recurringLinked: linked,
      recurringUnlinked: unlinked,
      issueCount: { errors: issueErrors, warnings: issueWarnings },
      months: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null }
    }
  }
}

export function toSnapshot(d: ImportData): DataSnapshot {
  return {
    settings: { ...DEFAULT_SETTINGS, ...d.settings },
    groups: d.groups,
    categories: d.categories,
    subcategories: d.subcategories,
    accounts: d.accounts,
    reconciliations: d.reconciliations,
    transactions: d.transactions,
    recurring: d.recurring,
    goals: d.goals,
    allocations: d.allocations,
    budgets: d.budgets,
    scenarios: d.scenarios,
    blocks: [],
    instruments: [],
    ops: [],
    prices: [],
    dismissedDuplicates: []
  }
}

export async function previewImport(s: AppState, filePath: string): Promise<ImportPreview> {
  const { data, preview } = await parseFinancialMaster(filePath, s.today())
  const token = randomUUID()
  pending.clear()
  pending.set(token, { data, fileName: preview.fileName })
  const existing = {
    accounts: s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM accounts')!.n,
    transactions: s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions')!.n
  }
  return { ...preview, token, existing }
}

/** Tablas que se vacían al reemplazar todos los datos. */
const DATA_TABLES: TableName[] = [...TABLE_ORDER].reverse()

export function wipeData(s: AppState): void {
  for (const t of DATA_TABLES) s.db.run(`DELETE FROM ${t}`)
  s.db.run('DELETE FROM duplicate_dismissals')
  s.db.run('DELETE FROM sequences')
}

/**
 * Aplica la importación. Si ya hay datos, exige `replaceExisting` (la capa IPC hace antes una copia de seguridad).
 */
export function applyImport(s: AppState, token: string, opts: { replaceExisting: boolean }): { counts: Record<string, number> } {
  const p = pending.get(token)
  if (!p) throw new UserError('La vista previa ha caducado. Vuelve a elegir el archivo.')
  const hasData =
    s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM accounts')!.n > 0 ||
    s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions')!.n > 0
  if (hasData && !opts.replaceExisting)
    throw new UserError('Ya hay datos en la app. Confirma que quieres reemplazarlos (se hará una copia de seguridad antes).')
  const d = p.data
  const keep = getSettings(s.db)
  s.db.tx(() => {
    wipeData(s)
    const insertAll = <T>(table: TableName, rows: T[]) => {
      for (const r of rows) insertRow(s.db, table, entityToRow(table, r as unknown as Record<string, unknown>))
    }
    insertAll('category_groups', d.groups)
    insertAll('categories', d.categories)
    insertAll('subcategories', d.subcategories)
    insertAll('accounts', d.accounts)
    insertAll('reconciliations', d.reconciliations)
    insertAll('recurring_rules', d.recurring)
    insertAll('goals', d.goals)
    insertAll('goal_allocations', d.allocations)
    // los movimientos se insertan en dos pasadas para respetar los enlaces entre ellos
    const links = new Map<string, string | null>()
    for (const t of d.transactions) {
      links.set(t.id, t.linkedTxId)
      insertRow(s.db, 'transactions', entityToRow('transactions', { ...t, linkedTxId: null } as unknown as Record<string, unknown>))
    }
    for (const [id, link] of links) if (link) s.db.run('UPDATE transactions SET linked_tx_id = ? WHERE id = ?', [link, id])
    insertAll('budgets', d.budgets)
    insertAll('scenarios', d.scenarios)
    setSettings(s.db, { ...d.settings, theme: keep.theme, lastAccountId: null, lastCategoryId: null })
    audit(s.db, 'import', p.fileName, 'import', `Importados ${d.transactions.length} movimientos y ${d.accounts.length} cuentas`, null, null)
  })
  pending.delete(token)
  return {
    counts: {
      accounts: d.accounts.length,
      transactions: d.transactions.length,
      recurring: d.recurring.length,
      goals: d.goals.length
    }
  }
}
