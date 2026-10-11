import ExcelJS from 'exceljs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Db } from '../src/main/db/db'
import { createBackup, exportCsv, exportJsonObject, exportXlsx, restoreBackup, restoreFromJson } from '../src/main/services/backup'
import { applyImport, previewImport } from '../src/main/services/importExcel'
import { AppState } from '../src/main/services/state'
import { accountBalance } from '../src/shared/domain/ledger'
import { account, memoryApp, transfer, tx } from './helpers'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-test-'))
}

describe('persistencia y copias', () => {
  it('los datos persisten al cerrar y abrir', async () => {
    const dir = tmp()
    const file = path.join(dir, 'finanzas.sqlite')
    const s1 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: path.join(dir, 'backups') })
    const a = account(s1, { name: 'Corriente', openingBalanceCents: 1000 })
    tx(s1, { accountId: a.id, amountCents: -250 })
    s1.db.close()
    const s2 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: null })
    expect(accountBalance(s2.ctx(), a.id)).toBe(750)
  })

  it('una transacción fallida no deja datos a medias', async () => {
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente' })
    expect(() =>
      s.db.tx(() => {
        tx(s, { accountId: a.id, amountCents: -100 })
        throw new Error('fallo')
      })
    ).toThrow('fallo')
    expect(s.ctx().transactions.length).toBe(0)
  })

  it('exporta y restaura (JSON y SQLite) conservando IDs y relaciones', async () => {
    const dir = tmp()
    const file = path.join(dir, 'finanzas.sqlite')
    const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: path.join(dir, 'backups') })
    const a = account(s, { name: 'Corriente', openingBalanceCents: 5000 })
    const h = account(s, { name: 'Hucha', type: 'SAVINGS', includeLiquidity: false })
    transfer(s, a.id, h.id, 1000)
    const json = exportJsonObject(s)
    const backup = createBackup(s, 'manual')
    tx(s, { accountId: a.id, amountCents: -999 })
    expect(s.ctx().transactions.length).toBe(3)
    restoreFromJson(s, JSON.parse(JSON.stringify(json)))
    expect(s.ctx().transactions.length).toBe(2)
    expect(s.ctx().transactions[0].transferId).toBe(s.ctx().transactions[1].transferId)
    tx(s, { accountId: a.id, amountCents: -999 })
    await restoreBackup(s, backup.path)
    expect(s.ctx().transactions.length).toBe(2)
    expect(accountBalance(s.ctx(), h.id)).toBe(1000)
    // exportaciones a Excel y CSV
    const xlsx = path.join(dir, 'export.xlsx')
    await exportXlsx(s, xlsx)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(xlsx)
    expect(wb.getWorksheet('Movimientos')!.rowCount).toBe(3)
    const csvs = exportCsv(s, path.join(dir, 'csv'))
    expect(fs.readFileSync(csvs.find((f) => f.endsWith('movimientos.csv'))!, 'utf8')).toContain('-10,00')
  })
})

/** Excel mínimo con la misma estructura que FINANCIAL_MASTER (datos inventados). */
async function buildFixture(file: string) {
  const wb = new ExcelJS.Workbook()
  const cfg = wb.addWorksheet('00_CONFIG')
  cfg.getCell('A4').value = 'Parameter'
  cfg.getCell('A7').value = 'Tracking Start'
  cfg.getCell('B7').value = new Date(Date.UTC(2026, 5, 1))
  cfg.getCell('A10').value = 'Minimum Liquidity Threshold (€)'
  cfg.getCell('B10').value = 50
  cfg.getCell('A13').value = 'Variable Expenses — base (€/month)'
  cfg.getCell('B13').value = 150
  cfg.getCell('N4').value = 'Category'
  cfg.getCell('O4').value = 'Group'
  const cats = [
    ['Salary', 'Income'],
    ['Food', 'Essential'],
    ['Eating out', 'Lifestyle'],
    ['Gym', 'Lifestyle'],
    ['Transfer', 'Internal']
  ]
  cats.forEach(([c, g], i) => {
    cfg.getCell(5 + i, 14).value = c
    cfg.getCell(5 + i, 15).value = g
  })
  const head = (ws: ExcelJS.Worksheet, cols: string[]) => cols.forEach((c, i) => (ws.getCell(4, i + 1).value = c))
  const acc = wb.addWorksheet('01_ACCOUNTS')
  head(acc, ['Account_ID', 'Account', 'Institution', 'Type', 'Currency', 'Active', 'Include_Net_Worth', 'Include_Liquidity', 'Opening_Balance (€)', 'Opening_Date', 'Current_Balance (€)', 'Available_Balance (€)', 'Last_Verified', 'Verified_Balance (€)'])
  const accRows = [
    ['ACC001', 'Corriente', 'Banco', 'Checking', 'EUR', 'YES', 'YES', 'YES', 100, new Date(Date.UTC(2026, 5, 1)), { formula: 'X', result: 999.55 }, null, new Date(Date.UTC(2026, 6, 31)), 999.55],
    ['ACC002', 'Hucha', 'Banco', 'Savings', 'EUR', 'YES', 'YES', 'NO', 0, new Date(Date.UTC(2026, 5, 1)), { formula: 'X', result: 50 }, null, null, null]
  ]
  accRows.forEach((r, i) => r.forEach((v, j) => (acc.getCell(5 + i, j + 1).value = v as ExcelJS.CellValue)))
  const txs = wb.addWorksheet('02_TRANSACTIONS')
  head(txs, ['Transaction_ID', 'Date', 'Account_ID', 'Description', 'Amount (€)', 'Currency', 'Type', 'Category', 'Subcategory', 'Merchant', 'Recurring', 'Goal_ID', 'Goal_Amount (€)', 'Transfer_ID', 'Linked_TX_ID', 'Status', 'Source', 'Notes'])
  const d = (m: number, day: number) => new Date(Date.UTC(2026, m - 1, day))
  const rows = [
    ['TX00001', d(7, 4), 'ACC001', 'Nómina', 1000, 'EUR', 'INCOME', 'Salary', null, null, 'NO', null, null, null, null, 'CONFIRMED', 'Banco', null],
    ['TX00002', d(7, 5), 'ACC001', 'Cena', -20.5, 'EUR', 'EXPENSE', 'Eating out', 'Restaurante', null, 'NO', null, null, null, null, 'CONFIRMED', 'Banco', null],
    ['TX00003', d(7, 5), 'ACC001', 'Bizum cena', 10, 'EUR', 'REFUND', 'Eating out', null, null, 'NO', null, null, null, 'TX00002', 'CONFIRMED', 'Banco', null],
    ['TX00004', d(7, 3), 'ACC001', 'Gimnasio', -39.95, 'EUR', 'EXPENSE', 'Gym', null, null, 'YES', null, null, null, null, 'CONFIRMED', 'Banco', null],
    ['TX00005', d(7, 10), 'ACC001', 'A hucha', -50, 'EUR', 'TRANSFER', 'Transfer', null, null, 'NO', null, null, 'TR001', null, 'CONFIRMED', 'Banco', null],
    ['TX00006', d(7, 10), 'ACC002', 'Desde corriente', 50, 'EUR', 'TRANSFER', 'Transfer', null, null, 'NO', null, null, 'TR001', null, 'CONFIRMED', 'Banco', null],
    ['TX00007', d(7, 11), 'ACC001', 'Duplicado', -30.05, 'EUR', 'EXPENSE', 'Food', null, null, 'NO', null, null, null, null, 'CANCELLED', 'Banco', null],
    ['TX00008', d(7, 12), 'ACC009', 'Cuenta rara', -1, 'EUR', 'EXPENSE', 'Food', null, null, 'NO', null, null, null, null, 'CONFIRMED', 'Banco', null]
  ]
  rows.forEach((r, i) => r.forEach((v, j) => (txs.getCell(5 + i, j + 1).value = v as ExcelJS.CellValue)))
  const rec = wb.addWorksheet('03_RECURRING')
  head(rec, ['Recurring_ID', 'Concept', 'Amount (€)', 'Frequency', 'Next_Date', 'End_Date', 'Category', 'Account_ID', 'Essential', 'Active', 'Minimum (€)', 'Maximum (€)', 'Notes'])
  ;['REC001', 'Gimnasio', -39.95, 'Monthly', d(8, 3), null, 'Gym', 'ACC001', 'NO', 'YES', null, null, null].forEach((v, j) => (rec.getCell(5, j + 1).value = v as ExcelJS.CellValue))
  const goals = wb.addWorksheet('04_GOALS')
  head(goals, ['Goal_ID', 'Goal', 'Goal_Type', 'Priority', 'Target (€)', 'Deadline', 'Active', 'Linked_Account_ID', 'Current_Allocated (€)'])
  ;['G001', 'Viaje', 'Planned', 'High', 500, d(12, 1), 'YES', 'ACC002', { formula: 'X', result: 50 }].forEach((v, j) => (goals.getCell(5, j + 1).value = v as ExcelJS.CellValue))
  await wb.xlsx.writeFile(file)
}

describe('importación del Excel', () => {
  it('vista previa con recuentos, saldos, avisos y filas descartadas; luego importa', async () => {
    const dir = tmp()
    const file = path.join(dir, 'fixture.xlsx')
    await buildFixture(file)
    const s = await memoryApp('2026-08-01')
    const p = await previewImport(s, file)
    expect(p.counts.Cuentas).toBe(2)
    expect(p.counts.Movimientos).toBe(7)
    expect(p.counts.Categorías).toBe(4) // "Transfer" (Internal) no se importa
    expect(p.skipped.map((x) => x.reason).join(' ')).toContain('ACC009')
    expect(p.errors).toEqual([])
    expect(p.balanceCheck.every((b) => b.ok)).toBe(true)
    expect(p.recurringLinked).toBe(1)
    applyImport(s, p.token, { replaceExisting: false })
    const ctx = s.ctx()
    expect(accountBalance(ctx, 'ACC001')).toBe(99955)
    expect(ctx.transactions.find((t) => t.id === 'TX00003')!.linkedTxId).toBe('TX00002')
    expect(ctx.transactions.find((t) => t.id === 'TX00005')!.categoryId).toBeNull()
    expect(ctx.reconciliations.length).toBe(1)
    expect(ctx.goals[0].linkedAccountId).toBe('ACC002')
    expect(ctx.settings.minLiquidityCents).toBe(5000)
    expect(ctx.scenarios[0].variableMonthlyCents).toBe(15000)
    // segunda importación: exige confirmar el reemplazo
    const p2 = await previewImport(s, file)
    expect(() => applyImport(s, p2.token, { replaceExisting: false })).toThrow(/reemplazar/)
  })
})
