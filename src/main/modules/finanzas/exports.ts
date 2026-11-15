// Exportaciones de finanzas (JSON, Excel, CSV) y restauración desde una exportación JSON.
// Las copias de seguridad (.sqlite) son del núcleo: core/backup.ts.
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { monthSummaries, trackedMonths } from '@shared/modules/finanzas/ledger'
import { UserError } from '../../core/errors'
import { MIGRATION_RANGES, schemaVersion } from '../../core/migrations'
import { audit } from './store'
import { insertRow, TABLE_ORDER, TABLES, type TableName } from './tables'
import { wipeData } from './importExcel'
import type { AppState } from './state'

// ---------- Exportación ----------

function rawTable(s: AppState, t: TableName): Record<string, unknown>[] {
  return s.db.all(`SELECT * FROM ${t} ORDER BY id`)
}

export function exportJsonObject(s: AppState) {
  const tables: Record<string, unknown[]> = {}
  for (const t of TABLE_ORDER) tables[t] = rawTable(s, t)
  return {
    app: 'finanzas-app',
    format: 1,
    schemaVersion: schemaVersion(s.db, MIGRATION_RANGES.finanzas),
    exportedAt: new Date().toISOString(),
    settings: s.db.all('SELECT key, value FROM settings ORDER BY key'),
    duplicateDismissals: s.db.all('SELECT tx_a, tx_b, created_at FROM duplicate_dismissals'),
    tables
  }
}

export function exportJson(s: AppState, file: string): string {
  fs.writeFileSync(file, JSON.stringify(exportJsonObject(s), null, 2), 'utf8')
  return file
}

export function restoreFromJson(s: AppState, obj: unknown): void {
  const o = obj as ReturnType<typeof exportJsonObject>
  if (!o || o.app !== 'finanzas-app' || !o.tables) throw new UserError('El JSON no es una exportación de esta app.')
  s.db.tx(() => {
    wipeData(s)
    s.db.run('DELETE FROM settings')
    for (const t of TABLE_ORDER) {
      const rows = (o.tables[t] ?? []) as Record<string, string | number | null>[]
      const cols = Object.keys(TABLES[t])
      const links: Array<[string, string]> = []
      for (const r of rows) {
        const row: Record<string, string | number | null> = {}
        for (const c of cols) row[c] = (r[c] ?? null) as string | number | null
        if (t === 'transactions' && row.linked_tx_id) {
          links.push([String(row.id), String(row.linked_tx_id)])
          row.linked_tx_id = null
        }
        insertRow(s.db, t, row)
      }
      for (const [id, link] of links) s.db.run('UPDATE transactions SET linked_tx_id = ? WHERE id = ?', [link, id])
    }
    for (const kv of (o.settings ?? []) as Array<{ key: string; value: string }>)
      s.db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [kv.key, kv.value])
    for (const d of (o.duplicateDismissals ?? []) as Array<{ tx_a: string; tx_b: string; created_at: string }>)
      s.db.run('INSERT OR IGNORE INTO duplicate_dismissals (tx_a, tx_b, created_at) VALUES (?, ?, ?)', [d.tx_a, d.tx_b, d.created_at])
    audit(s.db, 'backup', 'json', 'restore', 'Restaurado desde exportación JSON', null, null)
  })
}

const SHEET_NAMES: Record<TableName, string> = {
  category_groups: 'Grupos',
  categories: 'Categorias',
  subcategories: 'Subcategorias',
  accounts: 'Cuentas',
  reconciliations: 'Conciliaciones',
  recurring_rules: 'Recurrentes',
  goals: 'Objetivos',
  goal_allocations: 'Reservas',
  allocation_blocks: 'Bloques',
  instruments: 'Activos',
  investment_ops: 'Operaciones',
  prices: 'Precios',
  transactions: 'Movimientos',
  budgets: 'Presupuestos',
  scenarios: 'Escenarios'
}

const isMoneyCol = (c: string) => c.endsWith('_cents')

export async function exportXlsx(s: AppState, file: string): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finanzas'
  wb.created = new Date()
  // Resumen mensual calculado
  const ctx = s.ctx()
  const sums = [...monthSummaries(ctx, trackedMonths(ctx)).values()]
  const sum = wb.addWorksheet('Resumen mensual')
  sum.columns = [
    { header: 'Mes', key: 'month', width: 10 },
    { header: 'Ingresos', key: 'inc', width: 12 },
    { header: 'Gastos', key: 'exp', width: 12 },
    { header: 'Flujo neto', key: 'net', width: 12 },
    { header: 'A ahorro', key: 'sav', width: 12 },
    { header: 'A inversión', key: 'inv', width: 12 },
    { header: 'Tasa de ahorro', key: 'rate', width: 14 }
  ]
  for (const m of sums)
    sum.addRow({
      month: m.month,
      inc: m.incomeCents / 100,
      exp: m.totalExpensesCents / 100,
      net: m.netCashFlowCents / 100,
      sav: m.toSavingsCents / 100,
      inv: m.toInvestmentsCents / 100,
      rate: m.savingsRate
    })
  sum.getColumn('rate').numFmt = '0.0%'
  for (const k of ['inc', 'exp', 'net', 'sav', 'inv']) sum.getColumn(k).numFmt = '#,##0.00 €'
  sum.getRow(1).font = { bold: true }
  for (const t of TABLE_ORDER) {
    const ws = wb.addWorksheet(SHEET_NAMES[t])
    const cols = Object.keys(TABLES[t])
    ws.columns = cols.map((c) => ({ header: isMoneyCol(c) ? c.replace('_cents', '_eur') : c, key: c, width: Math.max(10, Math.min(40, c.length + 4)) }))
    for (const r of rawTable(s, t)) {
      const row: Record<string, unknown> = {}
      for (const c of cols) row[c] = isMoneyCol(c) && r[c] !== null && r[c] !== undefined ? Number(r[c]) / 100 : r[c]
      ws.addRow(row)
    }
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  await wb.xlsx.writeFile(file)
  return file
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV por tabla (separador ";" y coma decimal, para que Excel en español lo abra bien). */
export function exportCsv(s: AppState, dir: string): string[] {
  fs.mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (const t of TABLE_ORDER) {
    const cols = Object.keys(TABLES[t])
    const lines = [cols.map((c) => (isMoneyCol(c) ? c.replace('_cents', '_eur') : c)).join(';')]
    for (const r of rawTable(s, t))
      lines.push(
        cols
          .map((c) => (isMoneyCol(c) && r[c] !== null && r[c] !== undefined ? (Number(r[c]) / 100).toFixed(2).replace('.', ',') : csvCell(r[c])))
          .join(';')
      )
    const f = path.join(dir, `${SHEET_NAMES[t].toLowerCase()}.csv`)
    fs.writeFileSync(f, '﻿' + lines.join('\r\n'), 'utf8')
    files.push(f)
  }
  return files
}
