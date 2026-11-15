import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, nextExecutionDate, planReport } from '../src/shared/modules/finanzas/investmentPlan'
import { updateSettings } from '../src/main/modules/finanzas/catalog'
import { saveBlock, saveInstrument, saveOp } from '../src/main/modules/finanzas/investments'
import { account, escribir, memoryApp, transfer } from './helpers'

async function setup(today: string) {
  const s = await memoryApp(today)
  const bank = account(s, { name: 'Santander', openingBalanceCents: 200000 })
  const hucha = account(s, { name: 'Hucha colchón', openingBalanceCents: 25700 })
  const tr = account(s, { name: 'Trade Republic', type: 'INVESTMENT', openingDate: '2026-06-01' })
  const world = escribir(s, () => saveBlock(s, { name: 'World', targetPct: '70', maxPct: null }))
  const em = escribir(s, () => saveBlock(s, { name: 'Emergentes', targetPct: '10', maxPct: null }))
  const gold = escribir(s, () => saveBlock(s, { name: 'Oro', targetPct: '10', maxPct: null }))
  const sat = escribir(s, () => saveBlock(s, { name: 'Satélites', targetPct: '10', maxPct: '20', sortOrder: 3 }))
  const iW = escribir(s, () => saveInstrument(s, { name: 'MSCI World', assetClass: 'ETF', blockId: world.id, accountId: tr.id }))
  escribir(s, () => saveInstrument(s, { name: 'Emergentes', assetClass: 'ETF', blockId: em.id, accountId: tr.id }))
  escribir(s, () => saveInstrument(s, { name: 'Oro', assetClass: 'OTHER', blockId: gold.id, accountId: tr.id }))
  const iN = escribir(s, () => saveInstrument(s, { name: 'NVIDIA', assetClass: 'STOCK', blockId: sat.id, maxWeightPct: '10', accountId: tr.id }))
  transfer(s, bank.id, tr.id, 30000, '2026-06-02')
  escribir(s, () => saveOp(s, { date: '2026-06-03', accountId: tr.id, instrumentId: iW.id, type: 'BUY', quantity: '2', price: '100' }))
  escribir(s, () => saveOp(s, { date: '2026-06-03', accountId: tr.id, instrumentId: iN.id, type: 'BUY', quantity: '1', price: '100' }))
  escribir(s, () =>
    updateSettings(s, {
      investmentPlan: {
        ...DEFAULT_PLAN,
        enabled: true,
        coreBlockId: world.id,
        satelliteBlockId: sat.id,
        brokerAccountId: tr.id,
        cushionAccountId: hucha.id
      }
    })
  )
  return { s, bank, tr, iW, iN, sat }
}

describe('plan de inversión', () => {
  it('próxima ejecución en día 2 o 16', () => {
    expect(nextExecutionDate({ ...DEFAULT_PLAN, executionDay: 16 }, '2026-11-08')).toBe('2026-11-16')
    expect(nextExecutionDate({ ...DEFAULT_PLAN, executionDay: 16 }, '2026-10-20')).toBe('2026-11-16')
    expect(nextExecutionDate({ ...DEFAULT_PLAN, executionDay: 16, endDate: '2026-11-10' }, '2026-11-08')).toBe(null)
  })

  it('satélites por encima del 20 %: su parte va al núcleo', async () => {
    const { s, bank, tr } = await setup('2026-11-08')
    transfer(s, bank.id, tr.id, 20000, '2026-11-05')
    const r = planReport(s.ctx(), s.snap().settings.investmentPlan)
    expect(r.configured).toBe(true)
    const by = Object.fromEntries(r.split.map((x) => [x.blockName, x.amountCents]))
    // 200 € de efectivo → 140 + 20 + 20 + (20 → World)
    expect(by).toEqual({ World: 16000, Emergentes: 2000, Oro: 2000, Satélites: 0 })
    expect(r.rules.find((x) => x.id === 'sat-total')!.status).toBe('warn')
    expect(r.rules.find((x) => x.id === 'cushion')!.status).toBe('ok')
    expect(r.rules.find((x) => x.id === 'cash')!.status).toBe('ok')
  })

  it('detecta ventas, compras manuales y meses sin ejecutar', async () => {
    const { s, tr, iW, iN } = await setup('2026-12-20')
    escribir(s, () => saveOp(s, { date: '2026-11-16', accountId: tr.id, instrumentId: iW.id, type: 'BUY', quantity: '1', price: '100', feeCents: 100, affectsCash: false }))
    escribir(s, () => saveOp(s, { date: '2026-11-20', accountId: tr.id, instrumentId: iN.id, type: 'SELL', quantity: '0.5', price: '100', affectsCash: false }))
    escribir(s, () => saveOp(s, { date: '2026-11-21', accountId: tr.id, instrumentId: iN.id, type: 'BUY', quantity: '0.1', price: '100', affectsCash: false }))
    const r = planReport(s.ctx(), s.snap().settings.investmentPlan)
    const st = (id: string) => r.rules.find((x) => x.id === id)!.status
    expect(st('no-sell')).toBe('error')
    expect(st('no-manual')).toBe('warn')
    expect(st('thesis')).toBe('error')
    expect(r.executions.map((e) => e.status)).toEqual(['short', 'missing'])
  })
})
