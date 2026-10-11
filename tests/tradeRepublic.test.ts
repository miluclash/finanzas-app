import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { allBalances } from '../src/shared/domain/ledger'
import { portfolioSummary } from '../src/shared/domain/investments'
import { applyTradeRepublic, parseCsv, previewTradeRepublicText } from '../src/main/services/importTradeRepublic'
import { account, memoryApp } from './helpers'

const sample = fs.readFileSync(path.join(__dirname, 'fixtures/tr-sample.csv'), 'utf8')

describe('importador de Trade Republic', () => {
  it('lee CSV con comillas y comas dentro de campos', () => {
    expect(parseCsv('"a","b, c"\n"1","2"')).toEqual([['a', 'b, c'], ['1', '2']])
  })

  it('vista previa: tipos, activos nuevos, efectivo y filas no soportadas', async () => {
    const s = await memoryApp()
    const p = previewTradeRepublicText(s, sample, 'x.csv')
    expect(p.rows.map((r) => r.kind)).toEqual(['DEPOSIT', 'BUY', 'BUY', 'DIVIDEND', 'INTEREST'])
    expect(p.skipped).toHaveLength(1)
    expect(p.newInstruments.map((i) => [i.name, i.assetClass])).toEqual([
      ['Xtrackers MSCI World UCITS ETF 1C', 'ETF'],
      ['CHEVRON', 'STOCK']
    ])
    // 100 netos − 51 − 21 + 0,15 + 0,01
    expect(p.totals.cashCents).toBe(10000 - 5100 - 2100 + 15 + 1)
  })

  it('aplica: crea bróker, transferencias, operaciones, y no duplica al reimportar', async () => {
    const s = await memoryApp()
    const santander = account(s, { name: 'Santander', openingBalanceCents: 100000, openingDate: '2026-06-01' })
    const p = previewTradeRepublicText(s, sample, 'x.csv')
    const r = applyTradeRepublic(s, p.token, { brokerAccountId: null, sourceAccountId: santander.id })
    expect(r.created).toBe(5)
    const ctx = s.ctx()
    const bal = new Map(allBalances(ctx).map((b) => [b.accountId, b.cashCents]))
    expect(bal.get(santander.id)).toBe(100000 - 10100)
    expect(bal.get(r.brokerAccountId)).toBe(10000 - 5100 - 2100 + 15 + 1)
    expect(ctx.instruments).toHaveLength(2)
    expect(portfolioSummary(ctx).cashCents).toBe(2816)
    const again = previewTradeRepublicText(s, sample, 'x.csv')
    expect(again.rows.every((x) => x.duplicate)).toBe(true)
    expect(applyTradeRepublic(s, again.token, { brokerAccountId: r.brokerAccountId, sourceAccountId: santander.id }).created).toBe(0)
  })

  it('lo anterior a la cuenta de origen va al saldo inicial del bróker', async () => {
    const s = await memoryApp()
    const santander = account(s, { name: 'Santander', openingBalanceCents: 0, openingDate: '2026-07-01' })
    const p = previewTradeRepublicText(s, sample, 'x.csv')
    const r = applyTradeRepublic(s, p.token, { brokerAccountId: null, sourceAccountId: santander.id })
    const ctx = s.ctx()
    const broker = ctx.accountById.get(r.brokerAccountId)!
    expect(broker.openingDate).toBe('2026-07-01')
    expect(broker.openingBalanceCents).toBe(10000 - 5100 - 2100)
    expect(broker.initialContributionsCents).toBe(10100)
    expect(allBalances(ctx).find((b) => b.accountId === santander.id)!.balanceCents).toBe(0)
    expect(allBalances(ctx).find((b) => b.accountId === broker.id)!.cashCents).toBe(2816)
  })
})
