// Añade una cartera de ejemplo (cifras inventadas) a una base de datos local para revisar la pantalla de inversiones.
import fs from 'node:fs'
import { describe, it } from 'vitest'
import { Db } from '../src/main/core/db'
import { saveAccount } from '../src/main/modules/finanzas/catalog'
import { saveBlock, saveInstrument, saveOp, savePrice } from '../src/main/modules/finanzas/investments'
import { saveRecurring } from '../src/main/modules/finanzas/planning'
import { saveTransfer } from '../src/main/modules/finanzas/transactions'
import { escribir } from './helpers'
import { AppState } from '../src/main/modules/finanzas/state'
const file = process.env.DEMO_DB_PATH
const run = file && fs.existsSync(file) ? describe : describe.skip
run('demo inversiones', () => {
  it('añade bróker, bloques, activos y operaciones', async () => {
    const s = AppState.init(await Db.open(file!), { dbPath: file!, backupsDir: null })
    s.todayOverride = '2026-10-11'
    const b = escribir(s, () => saveAccount(s, { name: 'Bróker demo', institution: 'Demo', type: 'INVESTMENT', openingBalanceCents: 200, openingDate: '2026-10-01', active: true, includeNetWorth: true, includeLiquidity: false, initialContributionsCents: 30000 }))
    const core = escribir(s, () => saveBlock(s, { name: 'Núcleo', targetPct: '80', maxPct: null }))
    const em = escribir(s, () => saveBlock(s, { name: 'Emergentes', targetPct: '10', maxPct: null }))
    const sat = escribir(s, () => saveBlock(s, { name: 'Satélites', targetPct: '10', maxPct: '20' }))
    const w = escribir(s, () => saveInstrument(s, { name: 'ETF mundial demo', isin: 'XX0000000001', assetClass: 'ETF', region: 'Global desarrollados', sector: 'Diversificado', currency: 'USD', blockId: core.id, accountId: b.id }))
    const e = escribir(s, () => saveInstrument(s, { name: 'ETF emergentes demo', isin: 'XX0000000002', assetClass: 'ETF', region: 'Emergentes', sector: 'Diversificado', blockId: em.id, accountId: b.id }))
    const a = escribir(s, () => saveInstrument(s, { name: 'Acción tecnológica demo', ticker: 'DEMO', assetClass: 'STOCK', region: 'EE. UU.', sector: 'Tecnología', currency: 'USD', blockId: sat.id, maxWeightPct: '10', accountId: b.id }))
    escribir(s, () => saveOp(s, { date: '2026-03-01', accountId: b.id, instrumentId: w.id, type: 'BUY', quantity: '1.6', price: '100', feeCents: 100 }))
    escribir(s, () => saveOp(s, { date: '2026-04-01', accountId: b.id, instrumentId: a.id, type: 'BUY', quantity: '0.5', price: '140', feeCents: 100 }))
    const acc = s.snap().accounts.find((x) => x.includeLiquidity)!
    escribir(s, () => saveTransfer(s, { date: '2026-10-05', fromAccountId: acc.id, toAccountId: b.id, amountCents: 5000, description: 'Aportación demo' }))
    escribir(s, () => saveOp(s, { date: '2026-10-06', accountId: b.id, instrumentId: e.id, type: 'BUY', quantity: '1', price: '45' }))
    escribir(s, () => saveOp(s, { date: '2026-09-15', accountId: b.id, instrumentId: a.id, type: 'DIVIDEND', amountCents: 50, taxCents: 15 }))
    escribir(s, () => savePrice(s, { instrumentId: w.id, date: '2026-10-10', price: '118.4' }))
    escribir(s, () => savePrice(s, { instrumentId: a.id, date: '2026-10-10', price: '171.2' }))
    escribir(s, () => savePrice(s, { instrumentId: e.id, date: '2026-10-10', price: '46.1' }))
    escribir(s, () => saveRecurring(s, { concept: 'Plan de inversión demo', kind: 'TRANSFER', amountCents: 20000, frequency: 'MONTHLY', startDate: '2026-10-16', accountId: acc.id, toAccountId: b.id }))
  })
})
