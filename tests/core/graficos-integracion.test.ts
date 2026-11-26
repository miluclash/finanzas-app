// F5, huecos de integración: cifras de Finanzas por `core:metrics.compute` frente a los métodos de siempre,
// `last` y `ratio` de Finanzas en el motor (año, apilado, totales, comparación), lecturas sin escritura,
// borrado atómico, panel con referencia muerta, migración sobre una base de F4 con Finanzas y Entreno,
// copia completa con tablas core_ y diseños por defecto frente al registro de tarjetas.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../../src/main/core/backup'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { createRegistry } from '../../src/main/core/registry'
import { APP_MODULES } from '../../src/main/app'
import { AppState } from '../../src/main/modules/finanzas/state'
import { mergeDashboard } from '../../src/shared/core/charts'
import type { ChartSpec, DashboardCard } from '../../src/shared/core/metrics-types'
import { monthEnd } from '../../src/shared/dates'
import { entrenoApp, escribir, type EntrenoApp } from '../entreno/helpers'
import { buildSyntheticApp } from '../golden/synthetic'

const HOY = '2026-11-25'
const RANGO = { from: '2026-01-01', to: '2026-12-31' }
let app: EntrenoApp
let s: AppState
const dirs: string[] = []
const tmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-f5i-'))
  dirs.push(d)
  return d
}
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
})

beforeAll(async () => {
  app = await entrenoApp()
  app.ctx.todayOverride = HOY
  s = AppState.for(app.ctx)
  buildSyntheticApp(s)
  app.ctx.todayOverride = HOY
}, 120_000)

const compute = (id: string, q: Record<string, unknown> = {}) => app.h['core:metrics.compute'](`finanzas.${id}`, { groupBy: 'month', ...RANGO, ...q } as never)
const byKey = <T extends { key: string }>(b: T[]) => new Map(b.map((x) => [x.key, x]))
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  version: 1,
  type: 'bar',
  series: [{ metricId: 'finanzas.patrimonio' }],
  groupBy: 'year',
  range: { kind: 'absolute', from: '2025-01-01', to: '2026-12-31' },
  ...over
})
const data = (sp: ChartSpec) => {
  const r = app.h['core:charts.data'](sp)
  if (!r.ok) throw new Error(r.issues[0].message)
  return r.data
}

describe('cifras de Finanzas por core:metrics.compute', () => {
  it('flujos = monthly.summaries', () => {
    const sums = app.h['finanzas:monthly.summaries'](12, '2026-11').filter((m) => m.txCount > 0)
    expect(sums.length).toBeGreaterThan(2)
    const pick: Record<string, (m: (typeof sums)[number]) => number> = {
      ingresos: (m) => m.incomeCents,
      gastos: (m) => -m.totalExpensesCents,
      'flujo-neto': (m) => m.netCashFlowCents
    }
    for (const [id, f] of Object.entries(pick)) {
      const got = byKey(compute(id))
      for (const m of sums) expect(got.get(m.month)?.value, `${id} ${m.month}`).toBe(f(m))
    }
    const tasa = byKey(compute('tasa-ahorro'))
    for (const m of sums) if (m.savingsRate !== null) expect(tasa.get(m.month)!.value).toBe(m.savingsRate)
  })

  it('patrimonio = networth.series', () => {
    const got = byKey(compute('patrimonio', { from: '2020-01-01' }))
    const ser = app.h['finanzas:networth.series']()
    expect(ser.length).toBeGreaterThan(2)
    for (const p of ser) expect(got.get(p.month)!.value).toBe(p.netWorthCents)
  })

  it('presupuesto y gasto presupuestado = budgets.report', () => {
    let vistos = 0
    for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) {
      const r = app.h['finanzas:budgets.report'](m)
      if (!r.lines.some((l) => l.budgetCents !== null)) continue
      const q = { from: `${m}-01`, to: monthEnd(m) }
      expect(compute('presupuesto', q)[0].value).toBe(r.totalBudgetCents)
      expect(compute('gasto-presupuestado', q)[0].value).toBe(r.totalSpentBudgetedCents)
      vistos++
    }
    expect(vistos).toBeGreaterThan(0)
  })

  it('valor de las inversiones = inv.overview', () => {
    const ov = app.h['finanzas:inv.overview']()
    expect(ov.series.length).toBeGreaterThan(1)
    const got = byKey(compute('valor-inversiones', { from: `${ov.series[0].month}-01` }))
    for (const p of ov.series) expect(got.get(p.month)!.value).toBe(p.valueCents)
  })
})

describe('last y ratio de Finanzas en el motor (datos del dorado sintético)', () => {
  it('patrimonio (last) por año: el último mes del año, nunca la suma, también en el total', () => {
    const ser = app.h['finanzas:networth.series']()
    const ult = (y: string) => ser.filter((p) => p.month.startsWith(y)).pop()!.netWorthCents
    const d = data(spec())
    const anual = new Map(d.points.map((p) => [p.key, p.values.s0]))
    expect(anual.get('2026')).toBe(ult('2026'))
    const meses = data(spec({ groupBy: 'month', range: { kind: 'absolute', from: '2026-01-01', to: '2026-12-31' } }))
    expect(d.series[0].total).toBe(ult('2026'))
    expect(meses.series[0].total).toBe(ult('2026'))
    // El último punto no es la suma de los meses.
    const suma = meses.points.reduce((a, p) => a + (p.values.s0 ?? 0), 0)
    expect(suma).not.toBe(ult('2026'))
  })

  it('patrimonio al comparar con el periodo anterior: valores de saldo, sin sumar', () => {
    const d = data(spec({ groupBy: 'month', comparePrevious: true, range: { kind: 'this', unit: 'year' } }))
    expect(d.previous).not.toBeNull()
    const ant = d.series.find((x) => x.previous)!
    expect(ant.aggregation).toBe('last')
    const ser = byKey(app.h['finanzas:networth.series']().map((p) => ({ key: p.month, v: p.netWorthCents })))
    const ultimoConDato = [...d.points].reverse().map((p) => p.values[ant.id]).find((v) => v !== null && v !== undefined)
    if (ultimoConDato !== undefined) expect(ant.total).toBe(ultimoConDato)
    for (const p of d.points) if (p.prevKey && p.values[ant.id] != null) expect(p.values[ant.id]).toBe(ser.get(p.prevKey)?.v)
  })

  it('tasa de ahorro (ratio) por año: Σnum/Σden, no la media de las tasas, también en el total', () => {
    const sums = app.h['finanzas:monthly.summaries'](12, '2026-11').filter((m) => m.txCount > 0 && m.month.startsWith('2026'))
    const num = sums.reduce((a, m) => a + m.netCashFlowCents, 0)
    const den = sums.reduce((a, m) => a + m.incomeCents, 0)
    const media = sums.filter((m) => m.savingsRate !== null).reduce((a, m) => a + m.savingsRate!, 0) / sums.filter((m) => m.savingsRate !== null).length
    expect(den).toBeGreaterThan(0)
    const d = data(spec({ type: 'line', series: [{ metricId: 'finanzas.tasa-ahorro' }], groupBy: 'year', range: { kind: 'absolute', from: '2026-01-01', to: '2026-12-31' } }))
    expect(d.points.map((p) => p.key)).toEqual(['2026'])
    expect(d.points[0].values.s0).toBeCloseTo(num / den, 12)
    expect(d.series[0].total).toBeCloseTo(num / den, 12)
    if (Math.abs(media - num / den) > 1e-9) expect(d.points[0].values.s0).not.toBeCloseTo(media, 9)
  })

  it('las métricas last y ratio de Finanzas no se pueden apilar', () => {
    const r = app.h['core:charts.data'](spec({ type: 'stacked', groupBy: 'month' }))
    expect(r).toMatchObject({ ok: false, issues: [{ rule: 'stack' }] })
    const r2 = app.h['core:charts.data'](spec({ type: 'stacked', groupBy: 'month', series: [{ metricId: 'finanzas.tasa-ahorro' }] }))
    expect(r2).toMatchObject({ ok: false, issues: [{ rule: 'stack' }] })
  })

  it('saldo por cuenta (last) por dimensión: el total suma cuentas distintas, cada cuenta su último saldo', () => {
    const d = data(spec({ series: [{ metricId: 'finanzas.saldo-cuenta' }], groupBy: 'account', range: { kind: 'this', unit: 'year' } }))
    const ult = app.h['finanzas:networth.series']().pop()!
    expect(d.axis).toBe('dimension')
    for (const a of ult.byAccount) expect(d.points.find((p) => p.key === a.accountId)?.values.s0).toBe(a.balanceCents)
    expect(d.series[0].total).toBe(ult.byAccount.reduce((a, x) => a + x.balanceCents, 0))
  })
})

describe('las lecturas no escriben nada', () => {
  it('metrics.*, charts.data, charts.list, charts.get y dashboards.get: ni cola, ni audit_log, ni guardado', async () => {
    const h = app.h
    const g = await h['core:charts.save']({ title: 'Lectura', spec: spec() })
    const audit = () => app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n
    const filas = () => JSON.stringify(app.db.all('SELECT * FROM core_charts ORDER BY id')) + JSON.stringify(app.db.all('SELECT * FROM core_dashboards'))
    const antes = { cola: app.ctx.queue.committedCount, audit: audit(), filas: filas() }
    h['core:metrics.list']()
    h['core:metrics.compute']('finanzas.ingresos', { groupBy: 'month', ...RANGO })
    h['core:metrics.options']('account')
    h['core:metrics.options']('category')
    h['core:charts.data'](g.id)
    h['core:charts.data'](spec({ comparePrevious: true }))
    h['core:charts.list']()
    h['core:charts.get'](g.id)
    h['core:dashboards.get']('inicio')
    h['core:dashboards.get']('finanzas')
    expect(app.ctx.queue.committedCount).toBe(antes.cola)
    expect(audit()).toBe(antes.audit)
    expect(filas()).toBe(antes.filas)
    expect(app.db.hasPendingSave).toBe(false)
  })
})

describe('borrado y paneles con referencias', () => {
  it('si el borrado falla a mitad, no queda nada a medias', async () => {
    const h = app.h
    const g = await h['core:charts.save']({ title: 'Atómico', spec: spec() })
    const ref = String(g.id)
    const tarjeta: DashboardCard = { id: `chart:${ref}`, type: 'chart', ref, size: 'm', hidden: false }
    await h['core:dashboards.save']('inicio', [tarjeta])
    await h['core:dashboards.save']('entreno', [tarjeta])
    const snap = () => JSON.stringify([app.db.all('SELECT * FROM core_charts ORDER BY id'), app.db.all('SELECT * FROM core_dashboards ORDER BY dashboard_id')])
    const antes = snap()
    const auditAntes = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n
    // Falla al actualizar el segundo panel (entreno), con el gráfico y el primer panel ya tocados.
    escribir(app.ctx, () => app.db.exec(`CREATE TRIGGER falla_entreno BEFORE UPDATE ON core_dashboards WHEN OLD.dashboard_id = 'inicio' BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END`))
    await expect(h['core:charts.delete'](g.id)).rejects.toThrow()
    escribir(app.ctx, () => app.db.exec('DROP TRIGGER falla_entreno'))
    expect(snap()).toBe(antes)
    expect(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n).toBe(auditAntes)
    expect(h['core:charts.get'](g.id)).not.toBeNull()
    // Y la cola sigue viva: ahora se borra bien.
    expect(await h['core:charts.delete'](g.id)).toEqual({ id: g.id, removedCards: 2 })
  })

  it('cargar un panel con una referencia muerta: la fila la conserva y la fusión la ignora', async () => {
    const h = app.h
    const g = await h['core:charts.save']({ title: 'Efímero', spec: spec() })
    const ref = String(g.id)
    await h['core:dashboards.save']('finanzas', [
      { id: 'fixed:finanzas.mes', type: 'fixed', ref: 'finanzas.mes', size: 'l', hidden: false },
      { id: `chart:${ref}`, type: 'chart', ref, size: 'm', hidden: false }
    ])
    // Referencia muerta sin pasar por el borrado (p. ej. una copia a mano).
    escribir(app.ctx, () => app.db.run('DELETE FROM core_charts WHERE id = ?', [g.id]))
    const cargado = h['core:dashboards.get']('finanzas')
    expect(cargado.cards.map((c) => c.id)).toContain(`chart:${ref}`)
    const vivos = h['core:charts.list']().map((c) => String(c.id))
    const def = { dashboardId: 'finanzas' as const, cards: [{ ref: 'finanzas.mes', size: 'l' as const }, { ref: 'finanzas.avisos', size: 's' as const }] }
    const m = mergeDashboard(cargado.cards, def, ['finanzas.mes', 'finanzas.avisos'], vivos)
    expect(m.map((c) => c.id)).toEqual(['fixed:finanzas.mes', 'fixed:finanzas.avisos'])
    await h['core:dashboards.reset']('finanzas')
  })

  it('una fija oculta sigue oculta al cargar y las nuevas entran al final visibles', () => {
    const def = { dashboardId: 'inicio' as const, cards: [{ ref: 'a', size: 'm' as const }, { ref: 'b', size: 's' as const }, { ref: 'c', size: 'l' as const }] }
    const saved: DashboardCard[] = [{ id: 'fixed:b', type: 'fixed', ref: 'b', size: 's', hidden: true }]
    const m = mergeDashboard(saved, def, ['a', 'b', 'c'], [])
    expect(m.map((c) => [c.ref, c.hidden])).toEqual([['b', true], ['a', false], ['c', false]])
  })
})

describe('migración 1001–1002 sobre una base de F4 con Finanzas y Entreno', () => {
  async function baseF4(file: string): Promise<void> {
    const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: null }, createRegistry(APP_MODULES))
    initCore(ctx)
    ctx.todayOverride = HOY
    buildSyntheticApp(AppState.for(ctx))
    const now = '2026-11-20T10:00:00.000Z'
    escribir(ctx, () => {
      ctx.db.run("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('Press ficticio', ?, ?)", [now, now])
      ctx.db.run(
        `INSERT INTO trn_workouts (title, start_time, end_time, kind, source, hevy_key, created_at, updated_at)
         VALUES ('Fuerza', '2026-11-05T07:05', '2026-11-05T08:00', 'GYM', 'HEVY', 'Fuerza|2026-11-05T07:05', ?, ?)`,
        [now, now]
      )
    })
    ctx.db.close()
  }
  const volcado = (db: Db) => {
    const out: Record<string, unknown[]> = {}
    for (const t of db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
      if (t.name !== 'schema_migrations' && !t.name.startsWith('core_')) out[t.name] = db.all(`SELECT * FROM "${t.name}" ORDER BY rowid`)
    return out
  }

  it('las tablas de Finanzas y Entreno quedan idénticas, las cifras iguales y las core_ vacías', async () => {
    const dir = tmp()
    const file = path.join(dir, 'f.sqlite')
    await baseF4(file)
    const vieja = await Db.open(file)
    const antes = volcado(vieja)
    expect(Object.keys(antes)).toEqual(expect.arrayContaining(['transactions', 'trn_workouts']))
    vieja.close()
    const nueva = await entrenoApp({ dbPath: file, backupsDir: path.join(dir, 'b') })
    nueva.ctx.todayOverride = HOY
    expect(volcado(nueva.db)).toEqual(antes)
    expect(nueva.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_charts')!.n).toBe(0)
    expect(nueva.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_dashboards')!.n).toBe(0)
    expect(nueva.h['core:dashboards.get']('finanzas').saved).toBe(false)
    // Las cifras de Finanzas son las mismas que en la base sin migrar.
    expect(nueva.h['finanzas:networth.series']()).toEqual(app.h['finanzas:networth.series']())
    nueva.db.close()
  })

  it('las tablas core_ entran en la copia completa y se restauran', async () => {
    const dir = tmp()
    const a = await entrenoApp({ dbPath: path.join(dir, 'a.sqlite'), backupsDir: path.join(dir, 'b') })
    const g = await a.h['core:charts.save']({ title: 'En la copia', spec: spec({ series: [{ metricId: 'entreno.sesiones' }], groupBy: 'week' }) })
    const cards: DashboardCard[] = [{ id: `chart:${g.id}`, type: 'chart', ref: String(g.id), size: 'l', hidden: false }]
    await a.h['core:dashboards.save']('inicio', cards)
    const copia = createBackup(a.ctx, 'manual')
    const f = copia.path
    const dentro = await Db.open(f)
    expect(dentro.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_charts')!.n).toBe(1)
    expect(dentro.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_dashboards')!.n).toBe(1)
    dentro.close()
    await a.h['core:charts.delete'](g.id)
    await a.h['core:dashboards.reset']('inicio')
    expect(a.h['core:charts.list']()).toEqual([])
    await restoreBackup(a.ctx, f)
    expect(a.h['core:charts.get'](g.id)).toMatchObject({ id: g.id, title: 'En la copia' })
    expect(a.h['core:dashboards.get']('inicio')).toEqual({ dashboardId: 'inicio', cards, saved: true })
    a.ctx.db.close()
  })
})

describe('diseños por defecto frente al registro de tarjetas (sin React)', () => {
  const raiz = path.resolve(__dirname, '../../src/renderer/src')
  const leer = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8')
  const registro = new Map<string, string[]>()
  for (const f of ['modules/finanzas/tarjetas.tsx', 'modules/entreno/tarjetas.tsx'])
    for (const m of leer(f).matchAll(/\{\s*id:\s*'([^']+)'[^\n]*?panels:\s*\[([^\]]*)\]/g)) registro.set(m[1], [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]))
  const porDefecto = (f: string) => [...leer(f).matchAll(/ref:\s*'([^']+)'/g)].map((m) => m[1])

  it('el registro leído tiene todas las tarjetas', () => {
    expect(registro.size).toBe(19)
  })
  for (const [panel, f] of [
    ['finanzas', 'modules/finanzas/porDefecto.ts'],
    ['entreno', 'modules/entreno/porDefecto.ts'],
    ['inicio', 'core/inicio/porDefecto.ts']
  ] as const)
    it(`${panel}: solo ids registrados con ese panel en panels, sin repetir`, () => {
      const ids = porDefecto(f)
      expect(ids.length).toBeGreaterThan(3)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(registro.get(id), `${id} no está registrada`).toBeDefined()
      for (const id of ids) expect(registro.get(id), `${id} no declara el panel ${panel}`).toContain(panel)
    })
})
