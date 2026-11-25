// F4: bloques (sin solapes, bloque de cada sesión por fecha), eventos, objetivos validados por tipo,
// rangos de series de los grupos, estación HYROX al crear ejercicios, tipo de entreno al importar,
// JSON de F3 restaurable y lecturas de "hechos" para las métricas. Datos inventados.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { exportJsonObject, TRN_TABLES } from '../../src/main/modules/entreno/exports'
import { loadEntrenoFacts, setFacts, workoutFacts } from '../../src/main/modules/entreno/facts'
import { applyHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import { entrenoApp, escribir, META, noDialogs, serie, sesion, type EntrenoApp } from './helpers'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-f4-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Importa sesiones de Hevy ficticias (una operación de la cola). */
function importar(app: EntrenoApp, nuevas: ReturnType<typeof sesion>[], cambiadas: ReturnType<typeof sesion>[] = [], hash = 'h1') {
  return escribir(app.ctx, () => applyHevyWorkouts(app.db, { meta: { ...META, fileHash: hash }, newWorkouts: nuevas, changedWorkouts: cambiadas }))
}

const bloqueDe = (app: EntrenoApp) =>
  Object.fromEntries(app.db.all<{ title: string; block_id: number | null }>('SELECT title, block_id FROM trn_workouts ORDER BY id').map((r) => [r.title, r.block_id]))

async function conSesiones() {
  const app = await entrenoApp()
  importar(app, [
    sesion('Octubre', '2026-10-30T07:00', [serie('Press banca ficticio', 0, 0)]),
    sesion('Lunes', '2026-11-02T07:00', [serie('Press banca ficticio', 0, 0)]),
    sesion('Domingo', '2026-11-29T20:00', [serie('Press banca ficticio', 0, 0)]),
    sesion('Diciembre', '2026-12-01T07:00', [serie('Press banca ficticio', 0, 0)])
  ])
  return app
}

describe('bloques', () => {
  it('no se solapan (tampoco con uno sin fecha de fin) y cada sesión cae en el de su fecha', async () => {
    const app = await conSesiones()
    const h = app.h
    const base = await h['entreno:blocks.save']({ name: 'Base', startDate: '2026-11-02', endDate: '2026-11-29' })
    expect(base).toMatchObject({ plannedGym: 4, plannedSwim: 2, isDeload: false, eventId: null, workoutCount: 2 })
    expect(bloqueDe(app)).toEqual({ Octubre: null, Lunes: base.id, Domingo: base.id, Diciembre: null })

    await expect(h['entreno:blocks.save']({ name: 'Choca', startDate: '2026-11-29', endDate: '2026-12-10' })).rejects.toThrow(
      'Este bloque se solapa con «Base» (del 02/11/2026 al 29/11/2026). Cambia las fechas para que no coincidan.'
    )
    await expect(h['entreno:blocks.save']({ name: 'Abierto', startDate: '2026-10-01' })).rejects.toThrow(/se solapa con «Base»/)
    await expect(h['entreno:blocks.save']({ name: 'Al revés', startDate: '2026-12-10', endDate: '2026-12-01' })).rejects.toThrow(
      'La fecha de fin no puede ser anterior a la de inicio'
    )
    const abierto = await h['entreno:blocks.save']({ name: 'Pico', startDate: '2026-11-30', isDeload: true })
    expect(bloqueDe(app)).toMatchObject({ Diciembre: abierto.id })
    await expect(h['entreno:blocks.save']({ name: 'Después', startDate: '2027-02-01' })).rejects.toThrow(
      'Este bloque se solapa con «Pico» (desde el 30/11/2026, sin fecha de fin). Cambia las fechas para que no coincidan.'
    )
    // Editar un bloque no choca consigo mismo; acortarlo saca las sesiones que quedan fuera.
    await h['entreno:blocks.save']({ ...base, endDate: '2026-11-15' })
    expect(bloqueDe(app)).toEqual({ Octubre: null, Lunes: base.id, Domingo: null, Diciembre: abierto.id })
    await h['entreno:blocks.delete'](base.id)
    expect(bloqueDe(app)).toEqual({ Octubre: null, Lunes: null, Domingo: null, Diciembre: abierto.id })
    expect(h['entreno:blocks.list']().map((b) => [b.name, b.isDeload])).toEqual([['Pico', true]])
  })

  it('al importar y en el alta manual el bloque sale de la fecha; updateExtras solo acepta el que toca', async () => {
    const app = await conSesiones()
    const h = app.h
    const base = await h['entreno:blocks.save']({ name: 'Base', startDate: '2026-11-02', endDate: '2026-11-29' })
    importar(app, [sesion('Nueva', '2026-11-10T07:00', [serie('Press banca ficticio', 0, 0)])], [sesion('Domingo', '2026-11-29T20:00', [serie('Press banca ficticio', 0, 0, { reps: 9 })])], 'h2')
    expect(bloqueDe(app)).toMatchObject({ Nueva: base.id, Domingo: base.id })
    const press = h['entreno:exercises.list']()[0].id
    const manual = await h['entreno:workouts.saveManual']({ title: 'Casa', startTime: '2026-12-05T10:00', blockId: base.id, exercises: [{ exerciseId: press, sets: [{ reps: 5 }] }] })
    expect(manual.blockId).toBeNull()
    const movida = await h['entreno:workouts.saveManual']({ ...manual, startTime: '2026-11-12T10:00', exercises: [{ exerciseId: press, sets: [{ reps: 5 }] }] })
    expect(movida.blockId).toBe(base.id)
    const lunes = h['entreno:workouts.list']({}).find((w) => w.title === 'Lunes')!.id
    await expect(h['entreno:workouts.updateExtras']({ id: lunes, blockId: null })).rejects.toThrow(/sale de su fecha/)
    await expect(h['entreno:workouts.updateExtras']({ id: lunes, blockId: base.id, notes: 'ok' })).resolves.toMatchObject({ blockId: base.id, notes: 'ok' })
  })

  it('un bloque puede ser fase de un evento; el evento no se borra si un objetivo de tipo Evento lo usa', async () => {
    const { h } = await entrenoApp()
    await expect(h['entreno:blocks.save']({ name: 'X', startDate: '2026-11-02', eventId: 7 })).rejects.toThrow('Ese evento no existe.')
    const ev = await h['entreno:events.save']({ name: 'HYROX ficticio', date: '2027-03-20', notes: ' Madrid ' })
    expect(ev).toMatchObject({ name: 'HYROX ficticio', date: '2027-03-20', notes: 'Madrid' })
    const fase = await h['entreno:blocks.save']({ name: 'Fase 1', startDate: '2026-11-02', endDate: '2026-12-27', eventId: ev.id })
    const g = await h['entreno:goals.save']({ name: 'Acabar HYROX', type: 'EVENT', eventId: ev.id })
    await expect(h['entreno:events.delete'](ev.id)).rejects.toThrow('No se puede borrar «HYROX ficticio»: lo usa un objetivo. Borra o cambia ese objetivo antes.')
    await h['entreno:goals.delete'](g.id)
    await h['entreno:events.delete'](ev.id)
    expect(h['entreno:blocks.list']().find((b) => b.id === fase.id)!.eventId).toBeNull()
    await expect(h['entreno:events.save']({ name: 'Mal', date: '2027-02-30' })).rejects.toThrow('Fecha no válida')
  })
})

describe('objetivos', () => {
  it('se validan por tipo y lo que su tipo no usa se guarda vacío', async () => {
    const app = await conSesiones()
    const h = app.h
    const press = h['entreno:exercises.list']()[0].id
    const pecho = h['entreno:muscleGroups.list']()[0].id
    const ev = await h['entreno:events.save']({ name: 'HYROX ficticio', date: '2027-03-20' })
    const mal = async (input: Parameters<typeof h['entreno:goals.save']>[0], msg: RegExp | string) =>
      expect(h['entreno:goals.save'](input)).rejects.toThrow(msg)

    await mal({ name: 'E', type: 'E1RM', targetValue: 100 }, /Elige el ejercicio del objetivo de e1RM/)
    await mal({ name: 'E', type: 'E1RM', exerciseId: press }, /e1RM que quieres alcanzar/)
    await mal({ name: 'W', type: 'WEIGHT_REPS', exerciseId: press, targetValue: 80 }, /repeticiones que quieres hacer/)
    await mal({ name: 'V', type: 'WEEKLY_VOLUME', targetValue: 12 }, /un grupo muscular o un ejercicio/)
    await mal({ name: 'V', type: 'WEEKLY_VOLUME', targetValue: 12, groupId: pecho, exerciseId: press }, /un grupo muscular o un ejercicio/)
    await mal({ name: 'F', type: 'FREQUENCY', targetValue: 3 }, /un tipo de sesión o un grupo muscular/)
    await mal({ name: 'F', type: 'FREQUENCY', targetValue: 3, kind: 'GYM', groupId: pecho }, /un tipo de sesión o un grupo muscular/)
    await mal({ name: 'Ev', type: 'EVENT' }, /Elige el evento/)
    await mal({ name: 'E', type: 'E1RM', targetValue: -5, exerciseId: press }, /mayor que cero/)
    await mal({ name: 'E', type: 'E1RM', targetValue: 100, exerciseId: 999 }, 'Ese ejercicio ya no existe.')
    await mal({ name: 'F', type: 'FREQUENCY', targetValue: 2, groupId: 999 }, 'Ese grupo muscular ya no existe.')
    await mal({ name: '  ', type: 'EVENT', eventId: ev.id }, /Ponle un nombre/)

    const e1rm = await h['entreno:goals.save']({ name: 'Banca 100', type: 'E1RM', targetValue: 100, exerciseId: press, groupId: pecho, kind: 'GYM', targetReps: 5, deadline: '2027-01-31' })
    expect(e1rm).toMatchObject({ type: 'E1RM', targetValue: 100, exerciseId: press, groupId: null, kind: null, targetReps: null, deadline: '2027-01-31', status: 'ACTIVE' })
    const wr = await h['entreno:goals.save']({ name: '80 × 8', type: 'WEIGHT_REPS', targetValue: 80, targetReps: 8, exerciseId: press })
    expect(wr).toMatchObject({ targetValue: 80, targetReps: 8 })
    expect(await h['entreno:goals.save']({ name: 'Series pecho', type: 'WEEKLY_VOLUME', targetValue: 14, groupId: pecho })).toMatchObject({ groupId: pecho, exerciseId: null })
    expect(await h['entreno:goals.save']({ name: 'Kg banca', type: 'WEEKLY_VOLUME', targetValue: 5000, exerciseId: press })).toMatchObject({ groupId: null, exerciseId: press })
    expect(await h['entreno:goals.save']({ name: 'Nadar 2', type: 'FREQUENCY', targetValue: 2, kind: 'SWIM' })).toMatchObject({ kind: 'SWIM', groupId: null })
    expect(await h['entreno:goals.save']({ name: 'Pecho 2 días', type: 'FREQUENCY', targetValue: 2, groupId: pecho })).toMatchObject({ kind: null, groupId: pecho })
    const evento = await h['entreno:goals.save']({ name: 'HYROX', type: 'EVENT', eventId: ev.id, targetValue: 5, exerciseId: press })
    expect(evento).toMatchObject({ eventId: ev.id, targetValue: null, exerciseId: null })

    // Estado: conseguido, abandonado y otra vez activo. Editar no cambia el estado.
    expect((await h['entreno:goals.setStatus'](e1rm.id, 'ACHIEVED')).status).toBe('ACHIEVED')
    expect((await h['entreno:goals.save']({ ...e1rm, targetValue: 105 })).status).toBe('ACHIEVED')
    await expect(h['entreno:goals.setStatus'](e1rm.id, 'DONE' as never)).rejects.toThrow()
    expect((await h['entreno:goals.setStatus'](wr.id, 'ABANDONED')).status).toBe('ABANDONED')
    expect(h['entreno:goals.list']().map((g) => g.status)).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACHIEVED', 'ABANDONED'])
    await expect(h['entreno:goals.setStatus'](999, 'ACTIVE')).rejects.toThrow('Ese objetivo ya no existe.')
  })
})

describe('catálogo: rangos de series y estación HYROX', () => {
  it('grupos musculares con rango semanal (10–20 por defecto) y mínimo ≤ máximo', async () => {
    const { h } = await entrenoApp()
    const pecho = h['entreno:muscleGroups.list']()[0]
    expect([pecho.weeklySetsMin, pecho.weeklySetsMax]).toEqual([10, 20])
    expect(await h['entreno:muscleGroups.save']({ ...pecho, weeklySetsMin: 12, weeklySetsMax: 18 })).toMatchObject({ weeklySetsMin: 12, weeklySetsMax: 18 })
    await expect(h['entreno:muscleGroups.save']({ id: pecho.id, name: pecho.name, weeklySetsMin: 19 })).rejects.toThrow('El mínimo de series semanales no puede ser mayor que el máximo.')
    await expect(h['entreno:muscleGroups.save']({ id: pecho.id, name: pecho.name, weeklySetsMin: 9, weeklySetsMax: 8 })).rejects.toThrow(/mínimo de series semanales/)
    await expect(h['entreno:muscleGroups.save']({ id: pecho.id, name: pecho.name, weeklySetsMax: 2.5 })).rejects.toThrow(/número entero/)
    expect(await h['entreno:muscleGroups.save']({ id: pecho.id, name: 'Pecho' })).toMatchObject({ weeklySetsMin: 12, weeklySetsMax: 18 })
    expect(await h['entreno:muscleGroups.save']({ name: 'Aductores' })).toMatchObject({ weeklySetsMin: 10, weeklySetsMax: 20 })
    expect(await h['entreno:muscleGroups.save']({ name: 'Cuello', weeklySetsMin: 25 })).toMatchObject({ weeklySetsMin: 25, weeklySetsMax: 25 })
  })

  it('al crear un ejercicio (a mano o al importar) se propone la estación; al editar se conserva o se quita', async () => {
    const app = await entrenoApp()
    const h = app.h
    expect((await h['entreno:exercises.save']({ title: 'Ski Erg' })).hyroxStation).toBe('SkiErg')
    expect((await h['entreno:exercises.save']({ title: 'Burpee' })).hyroxStation).toBeNull()
    expect((await h['entreno:exercises.save']({ title: 'Trineo casero', hyroxStation: 'Sled Push' })).hyroxStation).toBe('Sled Push')
    await expect(h['entreno:exercises.save']({ title: 'Otro', hyroxStation: 'Ski Erg' as never })).rejects.toThrow('Estación HYROX no válida')
    const ski = h['entreno:exercises.list']().find((e) => e.title === 'Ski Erg')!
    expect((await h['entreno:exercises.save']({ id: ski.id, title: 'Ski Erg', notes: 'x' })).hyroxStation).toBe('SkiErg')
    expect((await h['entreno:exercises.save']({ id: ski.id, title: 'Ski Erg', hyroxStation: null })).hyroxStation).toBeNull()
    importar(app, [sesion('HYROX sim', '2026-11-07T10:00', [serie('Wall Ball', 0, 0), serie('Farmers Walk(static)', 1, 0), serie('Rowing Machine', 2, 0)])])
    const st = Object.fromEntries(h['entreno:exercises.list']().map((e) => [e.title, e.hyroxStation]))
    expect([st['Wall Ball'], st['Farmers Walk(static)'], st['Rowing Machine']]).toEqual(['Wall Balls', null, 'Rowing'])
  })
})

describe('tipo de entreno al importar', () => {
  it('las sesiones nuevas cuyo título coincide con un nombre o alias lo llevan; las cambiadas conservan el suyo', async () => {
    const app = await entrenoApp()
    const h = app.h
    const fa = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM', aliases: ['Upper'] })
    const nat = await h['entreno:routines.save']({ name: 'Natación', kind: 'SWIM' })
    importar(app, [
      sesion('fuerza a', '2026-11-02T07:00', [serie('Press banca ficticio', 0, 0)]),
      sesion('UPPER', '2026-11-04T07:00', [serie('Press banca ficticio', 0, 0)]),
      sesion('Natacion', '2026-11-05T18:00', [serie('Crol ficticio', 0, 0)]),
      sesion('Fuerza A extra', '2026-11-06T07:00', [serie('Press banca ficticio', 0, 0)])
    ])
    const rutina = () => Object.fromEntries(app.db.all<{ title: string; routine_id: number | null }>('SELECT title, routine_id FROM trn_workouts').map((r) => [r.title, r.routine_id]))
    expect(rutina()).toEqual({ 'fuerza a': fa.id, UPPER: fa.id, Natacion: nat.id, 'Fuerza A extra': null })
    // Cambiada en Hevy: conserva el tipo de entreno que tenga (aunque sea ninguno o uno puesto a mano).
    const extra = h['entreno:workouts.list']({}).find((w) => w.title === 'Fuerza A extra')!
    await h['entreno:workouts.updateExtras']({ id: extra.id, routineId: nat.id })
    importar(
      app,
      [],
      [
        sesion('Fuerza A extra', '2026-11-06T07:00', [serie('Press banca ficticio', 0, 0, { reps: 12 })]),
        sesion('UPPER', '2026-11-04T07:00', [serie('Press banca ficticio', 0, 0, { reps: 3 })])
      ],
      'h2'
    )
    expect(rutina()).toMatchObject({ UPPER: fa.id, 'Fuerza A extra': nat.id })
  })
})

describe('exportar y restaurar con las tablas nuevas', () => {
  async function conPlan() {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-11-04'
    importar(app, [sesion('Fuerza A', '2026-11-02T07:00', [serie('Ski Erg', 0, 0)])])
    const r = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM', aliases: ['Upper'] })
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: r.id, time: '07:00' }])
    await h['entreno:weekPlan.get']('2026-11-02')
    await h['entreno:weekPlan.save']('2026-11-09', [{ date: '2026-11-10', routineId: r.id, note: 'nota' }])
    const ev = await h['entreno:events.save']({ name: 'HYROX ficticio', date: '2027-03-20' })
    await h['entreno:blocks.save']({ name: 'Base', startDate: '2026-11-02', eventId: ev.id, isDeload: true })
    await h['entreno:goals.save']({ name: 'Nadar', type: 'FREQUENCY', kind: 'SWIM', targetValue: 2 })
    return app
  }

  function dialogos(open: string | null) {
    return { ...noDialogs, openFile: async () => open }
  }

  it('el JSON lleva las tablas nuevas y se restaura igual', async () => {
    const a = await conPlan()
    const exported = exportJsonObject(a.db)
    expect(exported.schemaVersion).toBe(2006)
    for (const t of ['trn_routine_aliases', 'trn_base_week', 'trn_base_week_meta', 'trn_week_plan_weeks', 'trn_week_plan'])
      expect((exported.tables as Record<string, unknown[]>)[t].length, t).toBeGreaterThan(0)
    const f = path.join(tmp, 'f4.json')
    fs.writeFileSync(f, JSON.stringify(exported))
    const b = await entrenoApp({ dbPath: null, backupsDir: null }, dialogos(f))
    await b.h['entreno:restore.json']()
    expect(exportJsonObject(b.db).tables).toEqual(exported.tables)
    expect(b.db.all('PRAGMA foreign_key_check')).toEqual([])
  })

  it('un JSON de F3 (sin tablas ni columnas nuevas) se restaura: lo nuevo queda vacío y se proponen las estaciones', async () => {
    const a = await conPlan()
    const o = JSON.parse(JSON.stringify(exportJsonObject(a.db)))
    o.schemaVersion = 2005
    for (const t of ['trn_routine_aliases', 'trn_base_week', 'trn_base_week_meta', 'trn_week_plan_weeks', 'trn_week_plan']) delete o.tables[t]
    const quitar: Record<string, string[]> = {
      trn_blocks: ['event_id', 'is_deload'],
      trn_muscle_groups: ['weekly_sets_min', 'weekly_sets_max'],
      trn_exercises: ['hyrox_station'],
      trn_goals: ['kind']
    }
    for (const [t, cs] of Object.entries(quitar)) for (const r of o.tables[t]) for (const c of cs) delete r[c]
    const f = path.join(tmp, 'f3.json')
    fs.writeFileSync(f, JSON.stringify(o))

    const b = await entrenoApp({ dbPath: null, backupsDir: path.join(tmp, 'copias-f3') }, dialogos(f))
    await b.h['entreno:restore.json']()
    const db = b.db
    for (const t of ['trn_routine_aliases', 'trn_base_week', 'trn_base_week_meta', 'trn_week_plan_weeks', 'trn_week_plan'])
      expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n, t).toBe(0)
    expect(db.all('SELECT title, hyrox_station FROM trn_exercises')).toEqual([{ title: 'Ski Erg', hyrox_station: 'SkiErg' }])
    expect(db.all('SELECT DISTINCT weekly_sets_min AS mn, weekly_sets_max AS mx FROM trn_muscle_groups')).toEqual([{ mn: 10, mx: 20 }])
    expect(db.all('SELECT name, event_id, is_deload FROM trn_blocks')).toEqual([{ name: 'Base', event_id: null, is_deload: 0 }])
    expect(db.all('SELECT name, type, kind FROM trn_goals')).toEqual([{ name: 'Nadar', type: 'FREQUENCY', kind: null }])
    expect(b.h['entreno:workouts.list']({}).map((w) => w.title)).toEqual(['Fuerza A'])
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
    expect(TRN_TABLES.length).toBe(19)
  })
})

describe('hechos para las métricas', () => {
  it('se leen en bloque, con rango de fechas para sesiones, series y semanas guardadas', async () => {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-11-11'
    importar(app, [
      sesion('Fuerza A', '2026-11-02T07:00', [serie('Press banca ficticio', 0, 0, { setType: 'warmup', weightKg: 40 }), serie('Press banca ficticio', 0, 1), serie('Ski Erg', 1, 0, { weightKg: null, reps: null, durationSeconds: 300 })], {
        endTime: '2026-11-02T08:00'
      }),
      sesion('Natación', '2026-11-12T18:00', [serie('Crol ficticio', 0, 0, { weightKg: null, reps: 20, distanceKm: 1 })])
    ])
    const press = h['entreno:exercises.list']().find((e) => e.title === 'Press banca ficticio')!
    const pecho = h['entreno:muscleGroups.list']()[0]
    const triceps = h['entreno:muscleGroups.list']().find((g) => g.name === 'Tríceps')!
    await h['entreno:exercises.save']({ ...press, primaryGroupId: pecho.id, secondaryGroupIds: [triceps.id] })
    const r = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM' })
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: r.id }])
    await h['entreno:weekPlan.get']('2026-11-09')

    const f = loadEntrenoFacts(app.db)
    expect(f.workouts.map((w) => [w.title, w.date, w.kind, w.routineId, w.endTime])).toEqual([
      ['Fuerza A', '2026-11-02', 'GYM', null, '2026-11-02T08:00'],
      ['Natación', '2026-11-12', 'SWIM', null, null]
    ])
    expect(f.sets.map((s) => [s.workoutId, s.exerciseOrder, s.setIndex, s.setType])).toEqual([
      [1, 0, 0, 'warmup'],
      [1, 0, 1, 'normal'],
      [1, 1, 0, 'normal'],
      [2, 0, 0, 'normal']
    ])
    expect(f.exercises.find((e) => e.id === press.id)).toMatchObject({ primaryGroupId: pecho.id, secondaryGroupIds: [triceps.id], hyroxStation: null })
    expect(f.exercises.find((e) => e.title === 'Ski Erg')!.hyroxStation).toBe('SkiErg')
    expect(f.muscleGroups[0]).toEqual({ id: pecho.id, name: 'Pecho', active: true, weeklySetsMin: 10, weeklySetsMax: 20 })
    expect(f.routines).toEqual([{ id: r.id, name: 'Fuerza A', kind: 'GYM', active: true }])
    expect(f.baseWeek).toEqual([{ weekday: 1, order: 0, routineId: r.id, time: null }])
    expect(f.baseFirstSavedOn).toBe('2026-11-11')
    expect(f.savedWeeks).toEqual([{ weekStart: '2026-11-09', origin: 'BASE', savedAt: expect.any(String), slots: [{ date: '2026-11-09', order: 0, routineId: r.id, time: null, note: null }] }])
    expect(f.settings.trendWeeks).toBe(6)
    expect([f.blocks, f.events, f.goals]).toEqual([[], [], []])

    const rango = { from: '2026-11-09', to: '2026-11-15' }
    expect(workoutFacts(app.db, rango).map((w) => w.title)).toEqual(['Natación'])
    expect(setFacts(app.db, rango)).toHaveLength(1)
    expect(loadEntrenoFacts(app.db, { from: '2026-11-11', to: '2026-11-11' }).savedWeeks.map((w) => w.weekStart)).toEqual(['2026-11-09'])
    expect(loadEntrenoFacts(app.db, { to: '2026-11-08' }).savedWeeks).toEqual([])
  })
})

describe('unir ejercicios conserva lo que el que queda no tiene', () => {
  it('estación, categoría y músculos pasan del que desaparece si el que queda no los tiene; si los dos, manda el que queda', async () => {
    const { h } = await entrenoApp()
    const grupos = h['entreno:muscleGroups.list']()
    const [pecho, espalda, hombros, triceps] = [0, 1, 2, 4].map((i) => grupos[i].id)
    const a = await h['entreno:exercises.save']({ title: 'Remo A', hyroxStation: null, measure: 'DISTANCE_DURATION' })
    const b = await h['entreno:exercises.save']({ title: 'Remo B', hyroxStation: 'Rowing', category: 'HYROX', primaryGroupId: espalda, secondaryGroupIds: [hombros] })
    const unido = await h['entreno:exercises.merge'](b.id, a.id)
    expect(unido).toMatchObject({ title: 'Remo A', hyroxStation: 'Rowing', category: 'HYROX', measure: 'DISTANCE_DURATION', primaryGroupId: espalda, secondaryGroupIds: [hombros] })

    const c = await h['entreno:exercises.save']({ title: 'Press C', hyroxStation: 'Sled Push', category: 'STRENGTH', primaryGroupId: pecho })
    const d = await h['entreno:exercises.save']({ title: 'Press D', hyroxStation: 'Wall Balls', category: 'CARDIO', primaryGroupId: triceps, secondaryGroupIds: [pecho, hombros] })
    const otro = await h['entreno:exercises.merge'](d.id, c.id)
    // El principal y la estación y categoría son de C; los secundarios (C no tenía) vienen de D, sin el principal de C.
    expect(otro).toMatchObject({ hyroxStation: 'Sled Push', category: 'STRENGTH', primaryGroupId: pecho, secondaryGroupIds: [hombros] })
  })
})

describe('reasignar tipos de entreno a sesiones ya importadas', () => {
  it('solo a las que no tienen, por nombre o alias de un tipo activo, en una operación con auditoría', async () => {
    const app = await entrenoApp()
    const h = app.h
    importar(app, [
      sesion('Fuerza A', '2026-11-02T07:00', [serie('Press banca ficticio', 0, 0)]),
      sesion('upper', '2026-11-03T07:00', [serie('Press banca ficticio', 0, 0)]),
      sesion('Natación', '2026-11-04T18:00', [serie('Crol ficticio', 0, 0)]),
      sesion('Pierna', '2026-11-05T07:00', [serie('Press banca ficticio', 0, 0)])
    ])
    const fa = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM', aliases: ['Upper'] })
    const nat = await h['entreno:routines.save']({ name: 'Natación', kind: 'SWIM', active: false })
    const otra = await h['entreno:routines.save']({ name: 'Otra', kind: 'OTHER' })
    const id = (t: string) => h['entreno:workouts.list']({}).find((w) => w.title === t)!.id
    await h['entreno:workouts.updateExtras']({ id: id('upper'), routineId: otra.id })

    const etiquetas: string[] = []
    const real = app.ctx.queue.enqueue.bind(app.ctx.queue)
    app.ctx.queue.enqueue = ((label: string, fn: () => unknown, opts?: never) => {
      etiquetas.push(label)
      return real(label, fn, opts)
    }) as typeof app.ctx.queue.enqueue
    expect(await h['entreno:routines.reapply']()).toEqual({ checked: 3, changed: 1 })
    expect(etiquetas).toEqual(['entreno:routines.reapply'])
    const rutina = () => Object.fromEntries(app.db.all<{ title: string; routine_id: number | null }>('SELECT title, routine_id FROM trn_workouts').map((r) => [r.title, r.routine_id]))
    expect(rutina()).toEqual({ 'Fuerza A': fa.id, upper: otra.id, 'Natación': null, Pierna: null })
    expect(app.db.all("SELECT action, summary FROM audit_log WHERE action = 'reapplyRoutine'")).toEqual([
      { action: 'reapplyRoutine', summary: 'Tipo de entreno asignado a 1 sesión' }
    ])
    void nat
    // Otra vez: nada que cambiar y sin nueva fila de auditoría.
    expect(await h['entreno:routines.reapply']()).toEqual({ checked: 2, changed: 0 })
    expect(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'reapplyRoutine'")!.n).toBe(1)
  })
})
