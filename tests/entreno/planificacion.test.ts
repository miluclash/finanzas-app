// Planificación (F4): tipos de entreno, semana base (boceto), semana concreta, guardado automático
// de las semanas empezadas, mover y reordenar. Fechas: el 2 nov 2026 es lunes. Datos inventados.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppHandlers, createAppRegistry, type Handlers } from '../../src/main/app'
import { createCoreContext, initCore, type CoreContext } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { mondayOf, weekdayOf } from '../../src/shared/modules/entreno/plan'
import type { WeekPlan } from '../../src/shared/modules/entreno/types'
import { noDialogs } from './helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-plan-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

interface App {
  ctx: CoreContext
  db: Db
  h: Handlers
}

/** App con la fecha de hoy fijada ANTES de arrancar (el arranque guarda semanas según la fecha). */
async function abrir(today: string, file: string | null = null): Promise<App> {
  const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: null }, createAppRegistry())
  ctx.todayOverride = today
  initCore(ctx)
  return { ctx, get db() { return ctx.db }, h: createAppHandlers(ctx, noDialogs, '0.0.0') }
}

/** Tres tipos de entreno: Fuerza A (GYM), Fuerza B (GYM) y Natación (SWIM). */
async function tipos(h: Handlers) {
  const a = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM' })
  const b = await h['entreno:routines.save']({ name: 'Fuerza B', kind: 'GYM' })
  const nat = await h['entreno:routines.save']({ name: 'Natación', kind: 'SWIM' })
  return { a: a.id, b: b.id, nat: nat.id }
}

/** Huecos como [fecha, nombre, hora] para comparar fácil. */
const huecos = (p: WeekPlan) => p.slots.map((s) => [s.date, s.order, s.routineName, s.time])

describe('semanas de lunes a domingo', () => {
  it('weekdayOf y mondayOf', () => {
    expect(weekdayOf('2026-11-02')).toBe(1)
    expect(weekdayOf('2026-11-08')).toBe(7)
    expect(mondayOf('2026-11-08')).toBe('2026-11-02')
    expect(mondayOf('2026-11-02')).toBe('2026-11-02')
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
  })
})

describe('tipos de entreno', () => {
  it('alta con alias, nombre único sin distinguir mayúsculas, tildes ni espacios, reordenar y borrar', async () => {
    const { h } = await abrir('2026-11-04')
    const { a, nat } = await tipos(h)
    const conAlias = await h['entreno:routines.save']({ id: a, name: 'Fuerza A', kind: 'GYM', aliases: ['Upper', 'upper', 'Fuerza A', 'Torso'] })
    expect(conAlias.aliases.map((x) => x.alias)).toEqual(['Torso', 'Upper'])
    await expect(h['entreno:routines.save']({ name: 'fuerza-a', kind: 'GYM' })).rejects.toThrow('Ya hay un tipo de entreno que se llama «Fuerza A».')
    await expect(h['entreno:routines.save']({ name: 'NATACION', kind: 'SWIM' })).rejects.toThrow(/Natación/)
    await expect(h['entreno:routines.save']({ name: 'Pierna', kind: 'GYM', aliases: ['TORSO'] })).rejects.toThrow('«TORSO» ya es un alias de «Fuerza A».')
    await expect(h['entreno:routines.save']({ name: '!!!', kind: 'GYM' })).rejects.toThrow(/letra o número/)
    // Renombrar a uno de sus alias: el alias sobra.
    const renombrada = await h['entreno:routines.save']({ id: a, name: 'Upper', kind: 'GYM' })
    expect([renombrada.name, renombrada.aliases.map((x) => x.alias)]).toEqual(['Upper', ['Torso']])
    // Ejercicios previstos opcionales: se sustituyen si vienen.
    const press = (await h['entreno:exercises.save']({ title: 'Press banca ficticio' })).id
    const conItems = await h['entreno:routines.save']({ id: a, name: 'Upper', kind: 'GYM', items: [{ exerciseId: press, targetSets: 3, repsMin: 6, repsMax: 10 }] })
    expect(conItems.items).toMatchObject([{ exerciseId: press, order: 0, targetSets: 3, repsMin: 6, repsMax: 10 }])
    await expect(h['entreno:routines.save']({ id: a, name: 'Upper', kind: 'GYM', items: [{ exerciseId: press, repsMin: 10, repsMax: 6 }] })).rejects.toThrow(/mínimo de repeticiones/)
    await expect(h['entreno:routines.save']({ id: a, name: 'Upper', kind: 'GYM', items: [{ exerciseId: 999 }] })).rejects.toThrow('Ese ejercicio ya no existe.')
    const sinTocar = await h['entreno:routines.save']({ id: a, name: 'Upper', kind: 'GYM' })
    expect([sinTocar.items.length, sinTocar.aliases.length]).toEqual([1, 1])

    const orden = h['entreno:routines.list']().map((r) => r.id).reverse()
    expect((await h['entreno:routines.reorder'](orden)).map((r) => r.id)).toEqual(orden)
    await expect(h['entreno:routines.reorder']([a])).rejects.toThrow(/ha cambiado/)

    // Borrar se lleva sus huecos del boceto.
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: nat }, { weekday: 2, routineId: a }])
    await h['entreno:routines.delete'](nat)
    expect(h['entreno:baseWeek.get']().slots.map((s) => s.routineName)).toEqual(['Upper'])
    await expect(h['entreno:routines.delete'](nat)).rejects.toThrow('Ese tipo de entreno ya no existe.')
  })
})

describe('semana base (boceto)', () => {
  it('se guarda entera de una vez, con orden por día y hora opcional; apunta la fecha del primer boceto', async () => {
    const { h } = await abrir('2026-11-04')
    const t = await tipos(h)
    expect(h['entreno:baseWeek.get']()).toEqual({ slots: [], firstSavedOn: null, updatedAt: null })
    const b = await h['entreno:baseWeek.save']([
      { weekday: 3, routineId: t.nat, time: '07:00' },
      { weekday: 1, routineId: t.a },
      { weekday: 3, routineId: t.b, time: '18:30' }
    ])
    expect(b.slots.map((s) => [s.weekday, s.order, s.routineName, s.routineKind, s.time])).toEqual([
      [1, 0, 'Fuerza A', 'GYM', null],
      [3, 0, 'Natación', 'SWIM', '07:00'],
      [3, 1, 'Fuerza B', 'GYM', '18:30']
    ])
    expect(b.firstSavedOn).toBe('2026-11-04')
    const otra = await h['entreno:baseWeek.save']([])
    expect([otra.slots, otra.firstSavedOn]).toEqual([[], '2026-11-04'])
    await expect(h['entreno:baseWeek.save']([{ weekday: 8, routineId: t.a }])).rejects.toThrow(/1 \(lunes\) a 7 \(domingo\)/)
    await expect(h['entreno:baseWeek.save']([{ weekday: 1, routineId: 999 }])).rejects.toThrow('Ese tipo de entreno ya no existe.')
    await expect(h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a, time: '24:00' }])).rejects.toThrow(/HH:mm/)
  })
})

describe('semana concreta', () => {
  it('sin plan guardado devuelve el boceto proyectado con saved:false y no escribe', async () => {
    const { h, ctx } = await abrir('2026-11-04')
    const t = await tipos(h)
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a, time: '07:00' }, { weekday: 4, routineId: t.nat }])
    const enqueue = vi.spyOn(ctx.queue, 'enqueue')
    const futura = await h['entreno:weekPlan.get']('2026-11-16')
    expect(futura).toMatchObject({ weekStart: '2026-11-16', weekEnd: '2026-11-22', saved: false, origin: null, savedAt: null, predatesBase: false })
    expect(huecos(futura)).toEqual([
      ['2026-11-16', 0, 'Fuerza A', '07:00'],
      ['2026-11-19', 0, 'Natación', null]
    ])
    // Una semana anterior al primer boceto: no tuvo plan y no se guarda sola.
    const antigua = await h['entreno:weekPlan.get']('2026-10-26')
    expect([antigua.saved, antigua.predatesBase]).toEqual([false, true])
    expect(enqueue).not.toHaveBeenCalled()
    await expect(h['entreno:weekPlan.get']('2026-11-04')).rejects.toThrow(/lunes/)
  })

  it('leer por primera vez la semana actual sin guardar la guarda antes (por la cola) con el boceto', async () => {
    const { h, ctx } = await abrir('2026-11-04')
    const t = await tipos(h)
    await h['entreno:baseWeek.save']([{ weekday: 2, routineId: t.a }])
    const enqueue = vi.spyOn(ctx.queue, 'enqueue')
    const actual = await h['entreno:weekPlan.get']('2026-11-02')
    expect(enqueue.mock.calls.map((c) => c[0])).toEqual(['entreno:weekPlan.autosave'])
    expect([actual.saved, actual.origin, huecos(actual)]).toEqual([true, 'BASE', [['2026-11-03', 0, 'Fuerza A', null]]])
    enqueue.mockClear()
    await h['entreno:weekPlan.get']('2026-11-02')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('guardar una semana (también toda de descanso), mover de día, reordenar, quitar y volver al boceto', async () => {
    const { h } = await abrir('2026-11-04')
    const t = await tipos(h)
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a }, { weekday: 1, routineId: t.nat }, { weekday: 3, routineId: t.b }])
    const ws = '2026-11-09'
    // Mover en una semana sin guardar: parte del boceto y queda guardada como cambiada.
    let p = await h['entreno:weekPlan.move']({ from: { date: '2026-11-09', order: 1 }, to: { date: '2026-11-11', order: 0 } })
    expect([p.saved, p.origin]).toEqual([true, 'EDITED'])
    expect(huecos(p)).toEqual([
      ['2026-11-09', 0, 'Fuerza A', null],
      ['2026-11-11', 0, 'Natación', null],
      ['2026-11-11', 1, 'Fuerza B', null]
    ])
    // Reordenar dentro del día.
    p = await h['entreno:weekPlan.move']({ from: { date: '2026-11-11', order: 1 }, to: { date: '2026-11-11', order: 0 } })
    expect(huecos(p).map((x) => x[2])).toEqual(['Fuerza A', 'Fuerza B', 'Natación'])
    // Sin orden de destino: al final del día.
    p = await h['entreno:weekPlan.move']({ from: { date: '2026-11-09', order: 0 }, to: { date: '2026-11-11' } })
    expect(huecos(p)).toEqual([
      ['2026-11-11', 0, 'Fuerza B', null],
      ['2026-11-11', 1, 'Natación', null],
      ['2026-11-11', 2, 'Fuerza A', null]
    ])
    await expect(h['entreno:weekPlan.move']({ from: { date: '2026-11-11', order: 0 }, to: { date: '2026-11-16' } })).rejects.toThrow(
      'Solo se puede mover una sesión a otro día de la misma semana.'
    )
    await expect(h['entreno:weekPlan.move']({ from: { date: '2026-11-10', order: 0 }, to: { date: '2026-11-11' } })).rejects.toThrow(/ya no está en el plan/)
    p = await h['entreno:weekPlan.remove']({ date: '2026-11-11', order: 1 })
    expect(huecos(p).map((x) => x[2])).toEqual(['Fuerza B', 'Fuerza A'])
    p = await h['entreno:weekPlan.resetToBase'](ws)
    expect([p.origin, huecos(p).map((x) => x[2])]).toEqual(['BASE', ['Fuerza A', 'Natación', 'Fuerza B']])

    // Guardar una semana a mano con hora y nota; y otra toda de descanso.
    p = await h['entreno:weekPlan.save'](ws, [
      { date: '2026-11-15', routineId: t.nat, time: '10:00', note: 'piscina exterior' },
      { date: '2026-11-10', routineId: t.a }
    ])
    expect(p.slots.map((s) => [s.date, s.weekday, s.routineName, s.time, s.note])).toEqual([
      ['2026-11-10', 2, 'Fuerza A', null, null],
      ['2026-11-15', 7, 'Natación', '10:00', 'piscina exterior']
    ])
    const descanso = await h['entreno:weekPlan.save']('2026-11-16', [])
    expect([descanso.saved, descanso.slots]).toEqual([true, []])
    await expect(h['entreno:weekPlan.save'](ws, [{ date: '2026-11-16', routineId: t.a }])).rejects.toThrow(/semana del 09\/11\/2026/)
    await expect(h['entreno:weekPlan.save']('2026-11-10', [])).rejects.toThrow(/lunes/)
  })
})

describe('guardado automático de las semanas empezadas', () => {
  it('al arrancar guarda con el boceto vigente las semanas desde la del primer boceto hasta la actual, y nada más', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const uno = await abrir('2026-11-04', file)
    const t = await tipos(uno.h)
    await uno.h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a }, { weekday: 4, routineId: t.nat }])
    // La semana actual aún no está guardada (nadie la ha leído): editar el boceto la cambia.
    expect(uno.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_week_plan_weeks')!.n).toBe(0)
    uno.db.close()

    const dos = await abrir('2026-11-25', file)
    const semanas = dos.db.all<{ week_start: string; origin: string }>('SELECT week_start, origin FROM trn_week_plan_weeks ORDER BY week_start')
    expect(semanas).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map((w) => ({ week_start: w, origin: 'BASE' })))
    expect(huecos(await dos.h['entreno:weekPlan.get']('2026-11-09'))).toEqual([
      ['2026-11-09', 0, 'Fuerza A', null],
      ['2026-11-12', 0, 'Natación', null]
    ])
    const audit = dos.db.all<{ action: string; summary: string }>("SELECT action, summary FROM audit_log WHERE entity = 'trn_week_plan'")
    expect(audit).toEqual([{ action: 'autosave', summary: 'Plan guardado desde el boceto: 4 semanas' }])
    dos.db.close()

    // El mismo día otra vez: no falta ninguna, no escribe el archivo.
    const huella = sha(file)
    const tres = await abrir('2026-11-25', file)
    tres.db.close()
    expect(sha(file)).toBe(huella)
  })

  it('editar el boceto nunca cambia las semanas guardadas; sí la futura sin guardar', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const uno = await abrir('2026-11-04', file)
    const t = await tipos(uno.h)
    await uno.h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a }])
    uno.db.close()
    const { h } = await abrir('2026-11-11', file)
    const antes = [await h['entreno:weekPlan.get']('2026-11-02'), await h['entreno:weekPlan.get']('2026-11-09')]
    await h['entreno:baseWeek.save']([{ weekday: 5, routineId: t.b }])
    expect([await h['entreno:weekPlan.get']('2026-11-02'), await h['entreno:weekPlan.get']('2026-11-09')]).toEqual(antes)
    expect(huecos(await h['entreno:weekPlan.get']('2026-11-16'))).toEqual([['2026-11-20', 0, 'Fuerza B', null]])
  })

  it('con la app abierta de una semana a otra: antes de cambiar el boceto, las semanas terminadas se guardan con el anterior', async () => {
    const app = await abrir('2026-11-04')
    const t = await tipos(app.h)
    await app.h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a }])
    app.ctx.todayOverride = '2026-11-18' // miércoles de dos semanas después, sin reiniciar
    await app.h['entreno:baseWeek.save']([{ weekday: 2, routineId: t.nat }])
    const nombres = async (ws: string) => {
      const p = await app.h['entreno:weekPlan.get'](ws)
      return [p.saved, p.origin, p.slots.map((s) => s.routineName)]
    }
    expect(await nombres('2026-11-02')).toEqual([true, 'BASE', ['Fuerza A']])
    expect(await nombres('2026-11-09')).toEqual([true, 'BASE', ['Fuerza A']])
    // La semana actual no estaba guardada: al leerla se guarda con el boceto nuevo.
    expect(await nombres('2026-11-16')).toEqual([true, 'BASE', ['Natación']])
  })

  it('una semana guardada a mano (aunque sea toda de descanso) no la pisa el guardado automático', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const uno = await abrir('2026-11-04', file)
    const t = await tipos(uno.h)
    await uno.h['entreno:baseWeek.save']([{ weekday: 1, routineId: t.a }])
    await uno.h['entreno:weekPlan.save']('2026-11-09', [])
    uno.db.close()
    const dos = await abrir('2026-11-18', file)
    const p = await dos.h['entreno:weekPlan.get']('2026-11-09')
    expect([p.saved, p.origin, p.slots]).toEqual([true, 'EDITED', []])
  })

  it('sin boceto no guarda nada', async () => {
    const { h, db } = await abrir('2026-11-25')
    await tipos(h)
    expect((await h['entreno:weekPlan.get']('2026-11-23')).saved).toBe(false)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_week_plan_weeks')!.n).toBe(0)
  })
})

describe('cola y lecturas', () => {
  it('cada handler nuevo que escribe pasa por la cola con su etiqueta; las lecturas no', async () => {
    const { h, ctx } = await abrir('2026-11-04')
    const etiquetas: string[] = []
    const real = ctx.queue.enqueue.bind(ctx.queue)
    vi.spyOn(ctx.queue, 'enqueue').mockImplementation((label, fn, opts) => {
      etiquetas.push(label)
      return real(label, fn, opts)
    })
    const r = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM' })
    await h['entreno:routines.reorder']([r.id])
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: r.id }])
    await h['entreno:weekPlan.save']('2026-11-09', [{ date: '2026-11-09', routineId: r.id }])
    await h['entreno:weekPlan.move']({ from: { date: '2026-11-09', order: 0 }, to: { date: '2026-11-10' } })
    await h['entreno:weekPlan.remove']({ date: '2026-11-10', order: 0 })
    await h['entreno:weekPlan.resetToBase']('2026-11-09')
    const ev = await h['entreno:events.save']({ name: 'HYROX ficticio', date: '2027-03-20' })
    const b = await h['entreno:blocks.save']({ name: 'Base', startDate: '2026-11-02', eventId: ev.id })
    const g = await h['entreno:goals.save']({ name: 'Ir 3 veces', type: 'FREQUENCY', kind: 'GYM', targetValue: 3 })
    await h['entreno:goals.setStatus'](g.id, 'ACHIEVED')
    await h['entreno:goals.delete'](g.id)
    await h['entreno:blocks.delete'](b.id)
    await h['entreno:events.delete'](ev.id)
    await h['entreno:routines.delete'](r.id)
    expect(etiquetas).toEqual([
      'entreno:routines.save',
      'entreno:routines.reorder',
      'entreno:baseWeek.save',
      'entreno:weekPlan.save',
      'entreno:weekPlan.move',
      'entreno:weekPlan.remove',
      'entreno:weekPlan.resetToBase',
      'entreno:events.save',
      'entreno:blocks.save',
      'entreno:goals.save',
      'entreno:goals.setStatus',
      'entreno:goals.delete',
      'entreno:blocks.delete',
      'entreno:events.delete',
      'entreno:routines.delete'
    ])
    etiquetas.length = 0
    for (const v of [h['entreno:routines.list'](), h['entreno:baseWeek.get'](), h['entreno:blocks.list'](), h['entreno:events.list'](), h['entreno:goals.list']()])
      expect(v instanceof Promise).toBe(false)
    await h['entreno:weekPlan.get']('2026-11-16')
    expect(etiquetas).toEqual([])
    // Cada escritura deja su rastro en audit_log (sin contenido sensible: son datos de planificación).
    const acciones = ctx.db.all<{ entity: string; action: string }>("SELECT entity, action FROM audit_log WHERE entity LIKE 'trn_%' ORDER BY id")
    expect(acciones.map((a) => `${a.entity}:${a.action}`)).toEqual([
      'trn_routines:create',
      'trn_routines:reorder',
      'trn_base_week:update',
      'trn_week_plan:update',
      'trn_week_plan:move',
      'trn_week_plan:remove',
      'trn_week_plan:resetToBase',
      'trn_events:create',
      'trn_blocks:create',
      'trn_goals:create',
      'trn_goals:status',
      'trn_goals:delete',
      'trn_blocks:delete',
      'trn_events:delete',
      'trn_routines:delete'
    ])
  })
})
