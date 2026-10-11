// Vuelca las métricas calculadas sobre el Excel real a un JSON local para revisarlas a mano.
// Solo se ejecuta con FINANCIAL_MASTER_PATH y METRICS_OUT definidos.
import fs from 'node:fs'
import { describe, it } from 'vitest'
import { dashboardData } from '../src/shared/domain/dashboard'
import { forecast } from '../src/shared/domain/forecast'
import { monthSummaries, netWorthSeries, trackedMonths } from '../src/shared/domain/ledger'
import { ruleStatus } from '../src/shared/domain/recurring'
import { goalProgress } from '../src/shared/domain/goals'
import { applyImport, previewImport } from '../src/main/services/importExcel'
import { memoryApp } from './helpers'

const file = process.env.FINANCIAL_MASTER_PATH
const out = process.env.METRICS_OUT
const run = file && out && fs.existsSync(file) ? describe : describe.skip

run('métricas sobre el Excel real', () => {
  it('vuelca métricas', async () => {
    const s = await memoryApp(process.env.TODAY ?? '2026-10-11')
    const p = await previewImport(s, file!)
    applyImport(s, p.token, { replaceExisting: false })
    const ctx = s.ctx()
    const months = trackedMonths(ctx)
    const sums = [...monthSummaries(ctx, months).values()]
    const dash = dashboardData(ctx)
    const fc = ctx.scenarios.map((sc) => forecast(ctx, sc))
    fs.writeFileSync(
      out!,
      JSON.stringify(
        {
          months: sums,
          netWorth: netWorthSeries(ctx).map((n) => ({ m: n.month, nw: n.netWorthCents, liq: n.liquidCents, sav: n.savingsCents })),
          available: dash.available,
          alerts: dash.alerts,
          upcoming: dash.upcoming,
          recurring: ctx.recurring.map((r) => ({ id: r.id, c: r.concept, ...ruleStatus(ctx, r) })),
          goals: ctx.goals.map((g) => ({ id: g.id, n: g.name, ...goalProgress(ctx, g) })),
          forecast: fc.map((f) => ({ s: f.scenario.name, start: f.startCashCents, end: f.endCents, min: f.minEndCents, rows: f.rows.map((r) => [r.month, r.incomeCents, r.fixedCents, r.transfersCents, r.variableCents, r.goalsCents, r.endCents]), a: f.assumptions }))
        },
        null,
        1
      )
    )
  })
})
