// Solo en local: tu CSV real de Trade Republic en ../private/trade_republic.csv
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { allBalances } from '../src/shared/domain/ledger'
import { applyTradeRepublic, previewTradeRepublicText } from '../src/main/services/importTradeRepublic'
import { account, memoryApp } from './helpers'

const file = '/home/claude/private/trade_republic.csv'
describe.skipIf(!fs.existsSync(file))('CSV real de Trade Republic', () => {
  it('cuadra participaciones y efectivo', async () => {
    const s = await memoryApp()
    const san = account(s, { name: 'Santander', openingBalanceCents: 0, openingDate: '2026-09-01' })
    const p = previewTradeRepublicText(s, fs.readFileSync(file, 'utf8'), 'tr.csv')
    expect(p.skipped).toEqual([])
    expect(Object.fromEntries(p.holdings.map((h) => [h.isin, h.quantity]))).toEqual({
      IE00BJ0KDQ92: '1.416744',
      US67066G1040: '0.41966',
      IE0007Y8Y157: '2.035416',
      US1667641005: '0.136351'
    })
    expect(p.totals.cashCents).toBe(155)
    const r = applyTradeRepublic(s, p.token, { brokerAccountId: null, sourceAccountId: san.id })
    const ctx = s.ctx()
    const b = ctx.accountById.get(r.brokerAccountId)!
    expect(b.initialContributionsCents).toBe(32017)
    expect(allBalances(ctx).find((x) => x.accountId === b.id)!.cashCents).toBe(155)
    console.info(p.newInstruments)
  })
})
