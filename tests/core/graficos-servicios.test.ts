// Métodos `core:metrics.*`, `core:charts.*` y `core:dashboards.*` con el registro, la cola y la
// base reales (en memoria). Datos inventados. Hoy = miércoles 25/11/2026.
import { beforeAll, describe, expect, it } from 'vitest'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { CORE_MIGRATIONS } from '../../src/main/core/coreMigrations'
import { Db } from '../../src/main/core/db'
import { createCoreHandlers } from '../../src/main/core/handlers'
import { createRegistry, defineModule, type AppModule, type MetricDef } from '../../src/main/core/registry'
import { finanzasModule } from '../../src/main/modules/finanzas'
import { applyHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import { AppState } from '../../src/main/modules/finanzas/state'
import type { ChartSpec, MetricBucket } from '../../src/shared/core/metrics-types'
import { ENTRENO_METRICS } from '../../src/shared/modules/entreno/metrics'
import { account, tx } from '../helpers'
import { META, entrenoApp, escribir, noDialogs, serie, sesion, type EntrenoApp } from '../entreno/helpers'

const HOY = '2026-11-25'
const RANGO = { from: '2026-01-01', to: '2026-12-31' }

let app: EntrenoApp
let press: number
let sentadilla: number

beforeAll(async () => {
  app = await entrenoApp()
  app.ctx.todayOverride = HOY
  const h = app.h
  const torso = await h['entreno:routines.save']({ name: 'Torso A', kind: 'GYM' })
  const nata = await h['entreno:routines.save']({ name: 'Natación', kind: 'SWIM' })
  escribir(app.ctx, () =>
    applyHevyWorkouts(app.db, {
      meta: { ...META, rowsTotal: 12 },
      newWorkouts: [
        sesion('Torso A', '2026-10-27T07:00', [serie('Press banca ficticio', 0, 0, { weightKg: 80, reps: 8, rpe: 8 }), serie('Sentadilla ficticia', 1, 0, { weightKg: 100, reps: 5, rpe: 9 })], {
          endTime: '2026-10-27T08:00'
        }),
        sesion('Torso A', '2026-11-03T07:00', [serie('Press banca ficticio', 0, 0, { weightKg: 85, reps: 6, rpe: 7 }), serie('Press banca ficticio', 0, 1, { weightKg: 85, reps: 5 })], {
          endTime: '2026-11-03T07:45'
        }),
        sesion('Natación', '2026-11-06T19:00', [serie('Crol ficticio', 0, 0, { weightKg: null, reps: 4, distanceKm: 0.4 })]),
        sesion('Carrera', '2026-11-14T09:00', [serie('Carrera ficticia', 0, 0, { weightKg: null, reps: null, distanceKm: 6, durationSeconds: 1800 })]),
        sesion('Torso A', '2026-11-24T07:00', [serie('Press banca ficticio', 0, 0, { weightKg: 87.5, reps: 5, rpe: 9 }), serie('Sentadilla ficticia', 1, 0, { weightKg: 110, reps: 3 })], {
          endTime: '2026-11-24T08:10'
        })
      ],
      changedWorkouts: []
    })
  )
  await h['entreno:baseWeek.save']([
    { weekday: 2, routineId: torso.id },
    { weekday: 5, routineId: nata.id }
  ])
  const ex = h['entreno:exercises.list']()
  press = ex.find((e) => e.title === 'Press banca ficticio')!.id
  sentadilla = ex.find((e) => e.title === 'Sentadilla ficticia')!.id
  // Algo de finanzas para que sus métricas tengan datos.
  const s = AppState.for(app.ctx)
  const a = account(s, { name: 'Corriente' })
  tx(s, { accountId: a.id, amountCents: 250000, date: '2026-10-01', description: 'Nómina' })
  tx(s, { accountId: a.id, amountCents: -4550, date: '2026-10-03', description: 'Súper' })
  tx(s, { accountId: a.id, amountCents: 260000, date: '2026-11-01', description: 'Nómina' })
}, 120_000)

const plain = (b: MetricBucket[]) => b.map((x) => ({ key: x.key, value: x.value }))

describe('core:metrics', () => {
  it('list: metadatos de todas las métricas, sin la función de cálculo', () => {
    const l = app.h['core:metrics.list']()
    const entreno = l.filter((m) => m.module === 'entreno')
    expect(entreno.map((m) => m.id)).toEqual(ENTRENO_METRICS.map((m) => `entreno.${m.id}`))
    expect(l.every((m) => !('compute' in m))).toBe(true)
    expect(JSON.parse(JSON.stringify(l))).toEqual(l)
    const byId = new Map(l.map((m) => [m.id, m]))
    expect(byId.get('entreno.e1rm')).toMatchObject({ unit: 'kg', aggregation: 'max', splits: ['exercise', 'muscleGroup', 'kind'] })
    expect(byId.get('entreno.adherencia')).toMatchObject({ unit: 'pct', aggregation: 'ratio', groupings: ['week', 'month', 'year'], filters: ['kind'], splits: ['kind'] })
    expect(byId.get('entreno.frecuencia-grupo')).toMatchObject({ unit: 'days', aggregation: 'sum' })
    expect(byId.get('entreno.volumen-carga')!.groupings).toContain('year')
  })

  it('entreno: core:metrics.compute da lo mismo que entreno:metrics.compute (todas las métricas y agrupaciones)', () => {
    const h = app.h
    let comparadas = 0
    for (const m of ENTRENO_METRICS) {
      const filtros: Array<Record<string, number | string>> = [{}]
      if (m.filters.includes('exerciseId')) filtros.push({ exerciseId: press })
      if (m.filters.includes('kind')) filtros.push({ kind: 'GYM' })
      for (const g of m.groupings)
        for (const f of filtros) {
          const viejo = h['entreno:metrics.compute'](m.id, { groupBy: g, ...RANGO, ...f })
          const nuevo = h['core:metrics.compute'](`entreno.${m.id}`, { groupBy: g, ...RANGO, filters: f })
          if (m.id === 'adherencia') {
            // Misma cifra: en el núcleo, proporción 0–1; en entreno:metrics, 0–100.
            expect(nuevo.map((b) => b.key)).toEqual(viejo.map((b) => b.key))
            nuevo.forEach((b, i) => expect(b.value * 100).toBeCloseTo(viejo[i].value, 10))
          } else expect(plain(nuevo), `${m.id} por ${g} ${JSON.stringify(f)}`).toEqual(viejo)
          if (viejo.length) comparadas++
        }
    }
    expect(comparadas).toBeGreaterThan(40)
  })

  it('entreno: rótulos de dimensión, año y división por ejercicio', () => {
    const h = app.h
    const porEj = h['core:metrics.compute']('entreno.volumen-carga', { ...RANGO, groupBy: 'exercise' })
    expect(porEj.find((b) => b.key === String(press))?.label).toBe('Press banca ficticio')
    expect(h['core:metrics.compute']('entreno.sesiones', { ...RANGO, groupBy: 'kind' }).find((b) => b.key === 'SWIM')?.label).toBe('Natación')
    const anual = h['core:metrics.compute']('entreno.volumen-carga', { ...RANGO, groupBy: 'year' })
    const mensual = h['core:metrics.compute']('entreno.volumen-carga', { ...RANGO, groupBy: 'month' })
    expect(anual).toEqual([{ key: '2026', value: mensual.reduce((a, b) => a + b.value, 0) }])
    const div = h['core:metrics.compute']('entreno.volumen-carga', { ...RANGO, groupBy: 'week', splitBy: 'exercise' })
    for (const id of [press, sentadilla]) {
      const parte = div.filter((b) => b.split === String(id))
      expect(parte.every((b) => b.splitLabel === (id === press ? 'Press banca ficticio' : 'Sentadilla ficticia'))).toBe(true)
      expect(plain(parte)).toEqual(h['entreno:metrics.compute']('volumen-carga', { groupBy: 'week', ...RANGO, exerciseId: id }))
    }
    expect(div.map((b) => b.key)).toEqual([...div.map((b) => b.key)].sort())
  })

  it('ratio obliga a devolver num y den (métricas reales de todos los módulos)', () => {
    const ratios = app.ctx.registry.metrics.filter((m) => m.aggregation === 'ratio')
    expect(ratios.map((m) => m.id)).toEqual(expect.arrayContaining(['entreno.densidad', 'entreno.rpe-medio', 'entreno.adherencia']))
    let puntos = 0
    for (const m of ratios)
      for (const g of m.groupings) {
        const r = app.h['core:metrics.compute'](m.id, { ...RANGO, groupBy: g })
        for (const b of r) {
          expect(typeof b.num, `${m.id} por ${g}`).toBe('number')
          expect(typeof b.den, `${m.id} por ${g}`).toBe('number')
          expect(b.value).toBeCloseTo(b.den === 0 ? 0 : b.num! / b.den!, 10)
          puntos++
        }
      }
    expect(puntos).toBeGreaterThan(5)
  })

  it('errores claros: métrica que no existe, agrupación, división o filtro no admitidos, consulta mal formada', () => {
    const h = app.h
    expect(() => h['core:metrics.compute']('entreno.no-existe', { ...RANGO, groupBy: 'week' })).toThrow(/no existe/)
    expect(() => h['core:metrics.compute']('entreno.adherencia', { ...RANGO, groupBy: 'day' })).toThrow(/no se puede agrupar/)
    expect(() => h['core:metrics.compute']('entreno.carrera-distancia', { ...RANGO, groupBy: 'week', splitBy: 'exercise' })).toThrow(/no se puede dividir/)
    expect(() => h['core:metrics.compute']('entreno.carrera-distancia', { ...RANGO, groupBy: 'week', filters: { kind: 'RUN' } })).toThrow(/no admite el filtro/)
    expect(() => h['core:metrics.compute']('entreno.sesiones', { from: '2026-12-01', to: '2026-01-01', groupBy: 'week' })).toThrow(/posterior/)
  })

  it('options: cada módulo da sus listas', () => {
    const h = app.h
    expect(h['core:metrics.options']('exercise').map((o) => o.label)).toEqual(expect.arrayContaining(['Press banca ficticio', 'Sentadilla ficticia']))
    expect(h['core:metrics.options']('kind')).toEqual([
      { value: 'GYM', label: 'Gimnasio' },
      { value: 'SWIM', label: 'Natación' },
      { value: 'HYROX', label: 'HYROX' },
      { value: 'RUN', label: 'Carrera' },
      { value: 'OTHER', label: 'Otro' }
    ])
    expect(h['core:metrics.options']('muscleGroup')).toHaveLength(12)
    expect(() => h['core:metrics.options']('nada' as never)).toThrow(/no existe/)
  })
})

const e1rm = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  version: 1,
  type: 'line',
  series: [{ metricId: 'entreno.e1rm', filters: { exerciseId: press } }],
  groupBy: 'week',
  range: { kind: 'last', unit: 'week', count: 6 },
  target: 110,
  ...over
})

describe('core:charts', () => {
  it('guardar, leer y calcular un gráfico (rango con el hoy del proceso principal)', async () => {
    const h = app.h
    const g = await h['core:charts.save']({ title: '  e1RM press ', spec: e1rm() })
    expect(g).toMatchObject({ title: 'e1RM press', module: 'entreno', spec: e1rm() })
    expect(h['core:charts.get'](g.id)).toMatchObject({ id: g.id, title: 'e1RM press', spec: e1rm() })
    expect(h['core:charts.list']().map((c) => c.id)).toContain(g.id)
    const r = h['core:charts.data'](g.id)
    if (!r.ok) throw new Error(r.issues[0].message)
    expect(r.data.range).toEqual({ from: '2026-10-19', to: HOY })
    expect(r.data.target).toBe(110)
    expect(r.data.points.map((p) => p.key)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'])
    expect(r.data.series[0].total).toBeCloseTo(87.5 * (1 + 5 / 30), 10)
    // "Hoy" se puede fijar (en la app, la fecha local del proceso principal).
    app.ctx.todayOverride = '2026-12-02'
    const r2 = h['core:charts.data'](e1rm())
    expect(r2.ok && r2.data.range.to).toBe('2026-12-02')
    app.ctx.todayOverride = HOY
    // Auditoría dentro de la operación.
    expect(h['core:audit.list'](10, 'core_charts')[0]).toMatchObject({ entity_id: String(g.id), action: 'create' })
    // Editar.
    const e = await h['core:charts.save']({ id: g.id, title: 'Otro', spec: e1rm({ type: 'bar' }) })
    expect(e).toMatchObject({ id: g.id, title: 'Otro', createdAt: g.createdAt })
    expect(h['core:audit.list'](10, 'core_charts')[0]).toMatchObject({ action: 'update' })
  })

  it('guardar rechaza con el primer aviso y no escribe nada', async () => {
    const h = app.h
    const n = h['core:charts.list']().length
    await expect(h['core:charts.save']({ title: 'Mal', spec: e1rm({ series: [{ metricId: 'entreno.e1rm' }, { metricId: 'entreno.sesiones' }] }) })).rejects.toThrow(
      'Todas las series tienen que tener la misma unidad: «e1RM (mejor serie)» va en kg y «Sesiones» en sesiones.'
    )
    await expect(h['core:charts.save']({ title: 'Mal', spec: e1rm({ type: 'stacked' }) })).rejects.toThrow(/apiladas/)
    await expect(h['core:charts.save']({ title: '', spec: e1rm() })).rejects.toThrow('Ponle un título al gráfico.')
    await expect(h['core:charts.save']({ title: 'X', spec: { ...e1rm(), version: 2 } as never })).rejects.toThrow(/más nueva/)
    await expect(h['core:charts.save']({ id: 99999, title: 'X', spec: e1rm() })).rejects.toThrow('Ese gráfico ya no existe.')
    expect(h['core:charts.list']()).toHaveLength(n)
  })

  it('una especificación guardada que deja de valer devuelve avisos, no un error', async () => {
    const h = app.h
    const g = await h['core:charts.save']({ title: 'Se romperá', spec: e1rm() })
    escribir(app.ctx, () => app.db.run(`UPDATE core_charts SET spec = json_set(spec, '$.series[0].metricId', 'entreno.borrada') WHERE id = ?`, [g.id]))
    const r = h['core:charts.data'](g.id)
    expect(r).toEqual({ ok: false, issues: [{ rule: 'metric', message: expect.stringMatching(/ya no existe \(entreno\.borrada\)/), series: 0 }] })
    escribir(app.ctx, () => app.db.run(`UPDATE core_charts SET spec = json_set(spec, '$.version', 2) WHERE id = ?`, [g.id]))
    expect(h['core:charts.data'](g.id)).toMatchObject({ ok: false, issues: [{ rule: 'schema' }] })
    escribir(app.ctx, () => app.db.run(`UPDATE core_charts SET spec = '{"version":1,"type":"line"}' WHERE id = ?`, [g.id]))
    const rota = h['core:charts.data'](g.id)
    expect(rota.ok).toBe(false)
    if (!rota.ok) expect(rota.issues.map((i) => i.message)).toEqual(['Faltan las series.', 'Agrupación no válida.', 'Rango no válido.'])
    expect(h['core:charts.get'](g.id)!.spec).toEqual({ version: 1, type: 'line' })
    expect(h['core:charts.data'](424242)).toEqual({ ok: false, issues: [{ rule: 'metric', message: 'Este gráfico ya no existe.' }] })
    expect(h['core:charts.data']({ ...e1rm(), groupBy: 'kind' })).toMatchObject({ ok: false, issues: [{ rule: 'grouping' }] })
  })

  it('borrar un gráfico que está en dos paneles lo quita de los dos en una sola operación', async () => {
    const h = app.h
    const g = await h['core:charts.save']({ title: 'En dos paneles', spec: e1rm() })
    const otro = await h['core:charts.save']({ title: 'Se queda', spec: e1rm({ type: 'area' }) })
    const ref = String(g.id)
    await h['core:dashboards.save']('inicio', [
      { id: 'fixed:resumen', type: 'fixed', ref: 'resumen', size: 'm', hidden: false },
      { id: `chart:${ref}`, type: 'chart', ref, size: 'l', hidden: false },
      { id: `chart:${otro.id}`, type: 'chart', ref: String(otro.id), size: 's', hidden: true }
    ])
    await h['core:dashboards.save']('entreno', [{ id: `chart:${ref}`, type: 'chart', ref, size: 'full', hidden: false }])
    const antes = app.ctx.queue.committedCount
    expect(await h['core:charts.delete'](g.id)).toEqual({ id: g.id, removedCards: 2 })
    expect(app.ctx.queue.committedCount).toBe(antes + 1)
    expect(h['core:charts.get'](g.id)).toBeNull()
    expect(h['core:dashboards.get']('inicio').cards.map((c) => c.id)).toEqual(['fixed:resumen', `chart:${otro.id}`])
    expect(h['core:dashboards.get']('entreno')).toEqual({ dashboardId: 'entreno', cards: [], saved: true })
    expect(h['core:audit.list'](5, 'core_dashboards').map((a) => a.entity_id).sort()).toEqual(expect.arrayContaining(['entreno', 'inicio']))
    await expect(h['core:charts.delete'](g.id)).rejects.toThrow('Ese gráfico ya no existe.')
    expect(() => h['core:charts.delete'](-1)).toThrow(/no válido/)
  })
})

describe('core:dashboards', () => {
  it('sin fila: saved = false; guardar, leer tal cual y restaurar', async () => {
    const h = app.h
    expect(h['core:dashboards.get']('finanzas')).toEqual({ dashboardId: 'finanzas', cards: [], saved: false })
    const cards = [
      { id: 'fixed:saldo', type: 'fixed' as const, ref: 'saldo', size: 'm' as const, hidden: true },
      { id: 'fixed:gastos', type: 'fixed' as const, ref: 'gastos', size: 'l' as const, hidden: false }
    ]
    expect(await h['core:dashboards.save']('finanzas', cards)).toEqual({ dashboardId: 'finanzas', cards, saved: true })
    expect(h['core:dashboards.get']('finanzas')).toEqual({ dashboardId: 'finanzas', cards, saved: true })
    expect(await h['core:dashboards.reset']('finanzas')).toEqual({ dashboardId: 'finanzas', cards: [], saved: false })
    expect(h['core:dashboards.get']('finanzas').saved).toBe(false)
    // Restaurar sin fila no escribe nada.
    const n = app.ctx.queue.committedCount
    await h['core:dashboards.reset']('finanzas')
    expect(app.db.hasPendingSave).toBe(false)
    expect(app.ctx.queue.committedCount).toBe(n + 1)
  })

  it('valida el formato: ids únicos, fijas sin repetir, gráficos existentes y panel conocido', async () => {
    const h = app.h
    const c = { id: 'a', type: 'fixed' as const, ref: 'saldo', size: 'm' as const, hidden: false }
    await expect(h['core:dashboards.save']('inicio', [c, { ...c, ref: 'otra' }])).rejects.toThrow('Hay dos tarjetas con el mismo id («a»).')
    await expect(h['core:dashboards.save']('inicio', [c, { ...c, id: 'b' }])).rejects.toThrow(/repetida/)
    await expect(h['core:dashboards.save']('inicio', [{ ...c, type: 'chart', ref: 'saldo' }])).rejects.toThrow(/gráfico guardado/)
    await expect(h['core:dashboards.save']('inicio', [{ ...c, type: 'chart', ref: '987654' }])).rejects.toThrow(/ya no existe/)
    await expect(h['core:dashboards.save']('inicio', [{ ...c, size: 'xl' as never }])).rejects.toThrow()
    await expect(h['core:dashboards.save']('otro' as never, [c])).rejects.toThrow('Ese panel no existe.')
    expect(() => h['core:dashboards.get']('otro' as never)).toThrow('Ese panel no existe.')
  })
})

describe('registro de métricas', () => {
  const metrica = (over: Partial<MetricDef> = {}): MetricDef => ({
    id: 'prueba.m',
    module: 'entreno',
    name: 'Prueba',
    unit: 'kg',
    aggregation: 'sum',
    groupings: ['week'],
    splits: [],
    filters: [],
    compute: () => [],
    ...over
  })
  const modulo = (metrics: MetricDef[], id: 'entreno' | 'finanzas' = 'entreno', extra: Partial<AppModule> = {}): AppModule =>
    defineModule({ id, name: id, migrations: [], ipc: () => ({}), metrics, aiTools: [], ...extra })

  it('valida ids únicos en toda la app, módulo, unidad, agregación, agrupaciones, divisiones y filtros', () => {
    expect(() => createRegistry([modulo([metrica()])])).not.toThrow()
    expect(() => createRegistry([modulo([metrica()], 'finanzas'), modulo([metrica()])])).toThrow(/módulo es «entreno» y tiene que ser «finanzas»/)
    expect(() => createRegistry([modulo([metrica({ module: 'finanzas' })], 'finanzas'), modulo([metrica()])])).toThrow(/repetido: «prueba\.m»/)
    expect(() => createRegistry([modulo([metrica(), metrica()])])).toThrow(/repetido/)
    expect(() => createRegistry([modulo([metrica({ unit: 'litros' as never })])])).toThrow(/unidad no válida/)
    expect(() => createRegistry([modulo([metrica({ aggregation: 'avg' as never })])])).toThrow(/agregación no válida/)
    expect(() => createRegistry([modulo([metrica({ groupings: [] })])])).toThrow(/al menos una agrupación/)
    expect(() => createRegistry([modulo([metrica({ groupings: ['hora' as never] })])])).toThrow(/agrupación no válida «hora»/)
    expect(() => createRegistry([modulo([metrica({ splits: ['week' as never] })])])).toThrow(/división no válida/)
    expect(() => createRegistry([modulo([metrica({ filters: ['from' as never] })])])).toThrow(/filtro no válido «from»/)
    expect(() => createRegistry([modulo([metrica({ name: ' ' })])])).toThrow(/nombre/)
    expect(() => createRegistry([modulo(undefined as never)])).toThrow(/no tiene lista de métricas/)
  })

  it('el registro de la app pasa la validación y publica las métricas de los dos módulos', () => {
    const mods = new Set(app.ctx.registry.metrics.map((m) => m.module))
    expect(mods.has('entreno')).toBe(true)
    expect(app.ctx.registry.metric('entreno.e1rm')?.name).toBe('e1RM (mejor serie)')
  })

  it('charts.data no rompe si el módulo falla al calcular; metrics.compute rechaza respuestas mal formadas', async () => {
    const mal = metrica({ id: 'prueba.falla', compute: () => { throw new Error('se ha roto') } })
    const ratioSinPartes = metrica({ id: 'prueba.tasa', aggregation: 'ratio', unit: 'pct', compute: () => [{ key: '2026-11-23', value: 0.5 }] })
    const ctx = createCoreContext(await Db.open(null), { dbPath: null, backupsDir: null }, createRegistry([finanzasModule, modulo([mal, ratioSinPartes])], CORE_MIGRATIONS))
    initCore(ctx)
    ctx.todayOverride = HOY
    const h = createCoreHandlers(ctx, noDialogs)
    const spec: ChartSpec = { version: 1, type: 'line', series: [{ metricId: 'prueba.falla' }], groupBy: 'week', range: { kind: 'this', unit: 'week' } }
    const r = h['charts.data'](spec)
    expect(r).toEqual({ ok: false, issues: [{ rule: 'metric', message: 'No se han podido calcular los datos de este gráfico: se ha roto' }] })
    expect(() => h['metrics.compute']('prueba.tasa', { from: HOY, to: HOY, groupBy: 'week' })).toThrow(/numerador y denominador/)
  })
})
