// Añade una cartera de ejemplo (cifras inventadas) a una base de datos local para revisar la pantalla de inversiones.
import fs from 'node:fs'
import { describe, it } from 'vitest'
import { Db } from '../src/main/db/db'
import { saveAccount } from '../src/main/services/catalog'
import { saveBlock, saveInstrument, saveOp, savePrice } from '../src/main/services/investments'
import { saveRecurring } from '../src/main/services/planning'
import { saveTransfer } from '../src/main/services/transactions'
import { AppState } from '../src/main/services/state'
const file = process.env.DEMO_DB_PATH
const run = file && fs.existsSync(file) ? describe : describe.skip
run('demo inversiones', () => {
  it('añade bróker, bloques, activos y operaciones', async () => {
    const s = AppState.init(await Db.open(file!), { dbPath: file!, backupsDir: null })
    s.todayOverride = '2026-10-11'
    const b = saveAccount(s, { name: 'Bróker demo', institution: 'Demo', type: 'INVESTMENT', openingBalanceCents: 200, openingDate: '2026-10-01', active: true, includeNetWorth: true, includeLiquidity: false, initialContributionsCents: 30000 })
    const core = saveBlock(s, { name: 'Núcleo', targetPct: '80', maxPct: null })
    const em = saveBlock(s, { name: 'Emergentes', targetPct: '10', maxPct: null })
    const sat = saveBlock(s, { name: 'Satélites', targetPct: '10', maxPct: '20' })
    const w = saveInstrument(s, { name: 'ETF mundial demo', isin: 'XX0000000001', assetClass: 'ETF', region: 'Global desarrollados', sector: 'Diversificado', currency: 'USD', blockId: core.id, accountId: b.id })
    const e = saveInstrument(s, { name: 'ETF emergentes demo', isin: 'XX0000000002', assetClass: 'ETF', region: 'Emergentes', sector: 'Diversificado', blockId: em.id, accountId: b.id })
    const a = saveInstrument(s, { name: 'Acción tecnológica demo', ticker: 'DEMO', assetClass: 'STOCK', region: 'EE. UU.', sector: 'Tecnología', currency: 'USD', blockId: sat.id, maxWeightPct: '10', accountId: b.id })
    saveOp(s, { date: '2026-03-01', accountId: b.id, instrumentId: w.id, type: 'BUY', quantity: '1.6', price: '100', feeCents: 100 })
    saveOp(s, { date: '2026-04-01', accountId: b.id, instrumentId: a.id, type: 'BUY', quantity: '0.5', price: '140', feeCents: 100 })
    const acc = s.snap().accounts.find((x) => x.includeLiquidity)!
    saveTransfer(s, { date: '2026-10-05', fromAccountId: acc.id, toAccountId: b.id, amountCents: 5000, description: 'Aportación demo' })
    saveOp(s, { date: '2026-10-06', accountId: b.id, instrumentId: e.id, type: 'BUY', quantity: '1', price: '45' })
    saveOp(s, { date: '2026-09-15', accountId: b.id, instrumentId: a.id, type: 'DIVIDEND', amountCents: 50, taxCents: 15 })
    savePrice(s, { instrumentId: w.id, date: '2026-10-10', price: '118.4' })
    savePrice(s, { instrumentId: a.id, date: '2026-10-10', price: '171.2' })
    savePrice(s, { instrumentId: e.id, date: '2026-10-10', price: '46.1' })
    saveRecurring(s, { concept: 'Plan de inversión demo', kind: 'TRANSFER', amountCents: 20000, frequency: 'MONTHLY', startDate: '2026-10-16', accountId: acc.id, toAccountId: b.id })
  })
})
