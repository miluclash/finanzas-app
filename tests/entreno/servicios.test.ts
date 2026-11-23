// Servicios y handlers de Entreno: todo lo que escribe pasa por la cola (y falla fuera de ella),
// sesiones manuales, campos propios, ejercicios (alias y unión), catálogos, reglas de tipo,
// ajustes y la escritura de una importación de Hevy. Datos inventados.
import { describe, expect, it, vi } from 'vitest'
import * as catalog from '../../src/main/modules/entreno/catalog'
import * as exercises from '../../src/main/modules/entreno/exercises'
import { applyHevyWorkouts, inferMeasure, loadHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import * as workouts from '../../src/main/modules/entreno/workouts'
import { createAppHandlers } from '../../src/main/app'
import { AppState } from '../../src/main/modules/finanzas/state'
import { META, entrenoApp, escribir, noDialogs, serie, sesion, type EntrenoApp } from './helpers'

const cuenta = (app: EntrenoApp, sql: string) => app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`)!.n

/** App con dos sesiones de Hevy importadas (gimnasio y natación) y una de HYROX por ejercicios. */
async function appConDatos(): Promise<EntrenoApp> {
  const app = await entrenoApp()
  escribir(app.ctx, () =>
    applyHevyWorkouts(app.db, {
      meta: { ...META, rowsTotal: 7 },
      newWorkouts: [
        sesion('Torso A', '2026-11-05T07:05', [serie('Press banca ficticio', 0, 0), serie('Press banca ficticio', 0, 1), serie('Remo ficticio', 1, 0)], {
          endTime: '2026-11-05T08:15'
        }),
        sesion('Natación técnica', '2026-11-06T18:30', [serie('Crol ficticio', 0, 0, { weightKg: null, reps: 4, distanceKm: 0.2 })]),
        sesion('Mixto', '2026-11-07T10:00', [serie('Sled Push ficticio', 0, 0), serie('Wall Ball ficticio', 1, 0), serie('Remo ficticio', 2, 0)])
      ],
      changedWorkouts: []
    })
  )
  return app
}

const idDe = (app: EntrenoApp, title: string) => app.db.get<{ id: number }>('SELECT id FROM trn_workouts WHERE title = ?', [title])!.id
const ejercicio = (app: EntrenoApp, title: string) => app.db.get<{ id: number }>('SELECT id FROM trn_exercises WHERE title = ?', [title])!.id

describe('cola de escritura', () => {
  it('cada handler que escribe pasa por la cola con etiqueta entreno:<acción>', async () => {
    const app = await appConDatos()
    const etiquetas: string[] = []
    const real = app.ctx.queue.enqueue.bind(app.ctx.queue)
    vi.spyOn(app.ctx.queue, 'enqueue').mockImplementation((label, fn, opts) => {
      etiquetas.push(label)
      return real(label, fn, opts)
    })
    const h = app.h
    const torso = idDe(app, 'Torso A')
    const press = ejercicio(app, 'Press banca ficticio')
    await h['entreno:workouts.updateExtras']({ id: torso, perceivedEffort: 7 })
    const manual = await h['entreno:workouts.saveManual']({
      title: 'Piernas casa',
      startTime: '2026-11-08T09:00',
      exercises: [{ exerciseId: press, sets: [{ reps: 10 }] }]
    })
    await h['entreno:workouts.delete'](manual.id)
    const nuevo = await h['entreno:exercises.save']({ title: 'Sentadilla ficticia' })
    const conAlias = await h['entreno:exercises.addAlias'](nuevo.id, 'Squat ficticio')
    await h['entreno:exercises.removeAlias'](conAlias.aliases[0].id)
    await h['entreno:exercises.merge'](nuevo.id, press)
    const g = await h['entreno:muscleGroups.save']({ name: 'Aductores' })
    await h['entreno:muscleGroups.delete'](g.id)
    const r = await h['entreno:kindRules.save']({ field: 'title', contains: 'yoga', kind: 'OTHER' })
    await h['entreno:kindRules.reorder'](h['entreno:kindRules.list']().map((x) => x.id))
    await h['entreno:kindRules.delete'](r.id)
    await h['entreno:kindRules.reapply']()
    await h['entreno:settings.save']({ trendWeeks: 8 })
    expect(etiquetas).toEqual([
      'entreno:workouts.updateExtras',
      'entreno:workouts.saveManual',
      'entreno:workouts.delete',
      'entreno:exercises.save',
      'entreno:exercises.addAlias',
      'entreno:exercises.removeAlias',
      'entreno:exercises.merge',
      'entreno:muscleGroups.save',
      'entreno:muscleGroups.delete',
      'entreno:kindRules.save',
      'entreno:kindRules.reorder',
      'entreno:kindRules.delete',
      'entreno:kindRules.reapply',
      'entreno:settings.save'
    ])
    // Cada cambio queda apuntado en audit_log.
    expect(cuenta(app, "audit_log WHERE entity LIKE 'trn_%'")).toBeGreaterThanOrEqual(13)
  })

  it('los servicios fallan fuera de la cola y las lecturas no la necesitan', async () => {
    const app = await appConDatos()
    const db = app.db
    const torso = idDe(app, 'Torso A')
    const press = ejercicio(app, 'Press banca ficticio')
    const fuera = /Escritura fuera de la cola/
    expect(() => workouts.updateWorkoutExtras(db, { id: torso, notes: 'x' })).toThrow(fuera)
    expect(() =>
      workouts.saveManualWorkout(db, { title: 'X', startTime: '2026-11-08T09:00', exercises: [{ exerciseId: press, sets: [{}] }] })
    ).toThrow(fuera)
    expect(() => workouts.deleteWorkout(db, torso)).toThrow(fuera)
    expect(() => exercises.saveExercise(db, { title: 'Nuevo' })).toThrow(fuera)
    expect(() => exercises.addAlias(db, press, 'Bench')).toThrow(fuera)
    expect(() => exercises.mergeExercises(db, press, ejercicio(app, 'Remo ficticio'))).toThrow(fuera)
    expect(() => catalog.saveMuscleGroup(db, { name: 'Aductores' })).toThrow(fuera)
    expect(() => catalog.deleteMuscleGroup(db, 1)).toThrow(fuera)
    expect(() => catalog.saveKindRule(db, { field: 'title', contains: 'yoga', kind: 'OTHER' })).toThrow(fuera)
    expect(() => catalog.deleteKindRule(db, 1)).toThrow(fuera)
    expect(() => catalog.reorderKindRules(db, catalog.listKindRules(db).map((r) => r.id))).toThrow(fuera)
    expect(() => catalog.reapplyKindRules(db)).toThrow(fuera)
    expect(() => catalog.saveSettings(db, { trendWeeks: 8 })).toThrow(fuera)
    expect(() => applyHevyWorkouts(db, { meta: META, newWorkouts: [], changedWorkouts: [] })).toThrow(fuera)
    // Nada ha cambiado y las lecturas funcionan.
    expect(app.h['entreno:workouts.list']()).toHaveLength(3)
    expect(app.h['entreno:workouts.get'](torso).notes).toBeNull()
  })
})

describe('sesiones', () => {
  it('listado con resumen y filtros; detalle con ejercicios y series en orden', async () => {
    const app = await appConDatos()
    const h = app.h
    const lista = h['entreno:workouts.list']()
    expect(lista.map((w) => [w.title, w.kind, w.exerciseCount, w.setCount])).toEqual([
      ['Mixto', 'HYROX', 3, 3],
      ['Natación técnica', 'SWIM', 1, 1],
      ['Torso A', 'GYM', 2, 3]
    ])
    expect(lista[2].durationSeconds).toBe(70 * 60)
    expect(lista[1].durationSeconds).toBeNull()
    expect(h['entreno:workouts.list']({ kind: 'SWIM' }).map((w) => w.title)).toEqual(['Natación técnica'])
    expect(h['entreno:workouts.list']({ from: '2026-11-06', to: '2026-11-06' }).map((w) => w.title)).toEqual(['Natación técnica'])
    expect(h['entreno:workouts.list']({ to: '2026-11-05' }).map((w) => w.title)).toEqual(['Torso A'])
    expect(h['entreno:workouts.list']({ search: 'remo' }).map((w) => w.title)).toEqual(['Mixto', 'Torso A'])
    expect(h['entreno:workouts.list']({ search: '100%' })).toEqual([])
    expect(h['entreno:workouts.list']({ limit: 1, offset: 1 }).map((w) => w.title)).toEqual(['Natación técnica'])

    const d = h['entreno:workouts.get'](idDe(app, 'Torso A'))
    expect(d.exercises.map((e) => [e.exerciseOrder, e.exerciseTitle, e.sets.map((s) => s.setIndex)])).toEqual([
      [0, 'Press banca ficticio', [0, 1]],
      [1, 'Remo ficticio', [0]]
    ])
    expect(() => h['entreno:workouts.get'](9999)).toThrow('Esa sesión ya no existe.')
  })

  it('updateExtras: tipo a mano (kind_manual), vuelta a automático, esfuerzo 1–10 y referencias', async () => {
    const app = await appConDatos()
    const h = app.h
    const torso = idDe(app, 'Torso A')
    let w = await h['entreno:workouts.updateExtras']({ id: torso, kind: 'OTHER', perceivedEffort: 8, notes: '  cansado  ' })
    expect([w.kind, w.kindManual, w.perceivedEffort, w.notes]).toEqual(['OTHER', true, 8, 'cansado'])
    w = await h['entreno:workouts.updateExtras']({ id: torso, notes: null })
    expect([w.kind, w.kindManual, w.perceivedEffort, w.notes]).toEqual(['OTHER', true, 8, null])
    w = await h['entreno:workouts.updateExtras']({ id: torso, kind: null })
    expect([w.kind, w.kindManual]).toEqual(['GYM', false])
    await expect(h['entreno:workouts.updateExtras']({ id: torso, perceivedEffort: 11 })).rejects.toThrow(/esfuerzo va de 1 a 10/)
    await expect(h['entreno:workouts.updateExtras']({ id: torso, blockId: 42 })).rejects.toThrow('Ese bloque de entrenamiento no existe.')
    await expect(h['entreno:workouts.updateExtras']({ id: 9999, notes: 'x' })).rejects.toThrow('Esa sesión ya no existe.')
  })

  it('saveManual crea y edita sesiones manuales; las de Hevy no aceptan cambios de series', async () => {
    const app = await appConDatos()
    const h = app.h
    const press = ejercicio(app, 'Press banca ficticio')
    const remo = ejercicio(app, 'Remo ficticio')
    const w = await h['entreno:workouts.saveManual']({
      title: 'Natación libre',
      startTime: '2026-11-09T19:00',
      endTime: '2026-11-09T19:45',
      exercises: [
        { exerciseId: press, exerciseNotes: 'notas', sets: [{ weightKg: 70, reps: 5 }, { setType: 'warmup', weightKg: 40, reps: 10 }] },
        { exerciseId: remo, sets: [{ reps: 12, rpe: 8 }] }
      ]
    })
    expect([w.source, w.hevyKey, w.kind, w.kindManual, w.setCount, w.durationSeconds]).toEqual(['MANUAL', null, 'SWIM', false, 3, 45 * 60])
    expect(w.exercises[0].sets.map((s) => [s.setIndex, s.setType, s.weightKg])).toEqual([
      [0, 'normal', 70],
      [1, 'warmup', 40]
    ])
    const editada = await h['entreno:workouts.saveManual']({
      id: w.id,
      title: 'Natación libre',
      startTime: '2026-11-09T19:00',
      kind: 'GYM',
      exercises: [{ exerciseId: remo, sets: [{ reps: 15 }] }]
    })
    expect([editada.id, editada.kind, editada.kindManual, editada.setCount, editada.exercises[0].exerciseTitle]).toEqual([
      w.id,
      'GYM',
      true,
      1,
      'Remo ficticio'
    ])
    expect(cuenta(app, `trn_sets WHERE workout_id = ${w.id}`)).toBe(1)

    await expect(
      h['entreno:workouts.saveManual']({ id: idDe(app, 'Torso A'), title: 'X', startTime: '2026-11-05T07:05', exercises: [] })
    ).rejects.toThrow(/importadas de Hevy no se editan aquí/)
    await expect(
      h['entreno:workouts.saveManual']({ title: 'X', startTime: '2026-11-09T19:00', endTime: '2026-11-09T18:00', exercises: [] })
    ).rejects.toThrow(/fin no puede ser anterior/)
    await expect(
      h['entreno:workouts.saveManual']({ title: 'X', startTime: '2026-11-09T19:00', exercises: [{ exerciseId: 9999, sets: [{}] }] })
    ).rejects.toThrow('Ese ejercicio ya no existe.')
    await expect(h['entreno:workouts.saveManual']({ title: 'X', startTime: '2026-13-01T19:00', exercises: [] })).rejects.toThrow(
      /Fecha y hora no válidas/
    )
  })

  it('borrar una sesión borra sus series', async () => {
    const app = await appConDatos()
    const torso = idDe(app, 'Torso A')
    expect(cuenta(app, `trn_sets WHERE workout_id = ${torso}`)).toBe(3)
    await app.h['entreno:workouts.delete'](torso)
    expect(cuenta(app, `trn_workouts WHERE id = ${torso}`)).toBe(0)
    expect(cuenta(app, `trn_sets WHERE workout_id = ${torso}`)).toBe(0)
    expect(cuenta(app, 'trn_sets')).toBe(4)
    await expect(app.h['entreno:workouts.delete'](torso)).rejects.toThrow('Esa sesión ya no existe.')
  })
})

describe('ejercicios', () => {
  it('listado con series, última vez, músculos y alias; guardar con grupos principal y secundarios', async () => {
    const app = await appConDatos()
    const h = app.h
    const press = ejercicio(app, 'Press banca ficticio')
    const [pecho, , hombros, , triceps] = h['entreno:muscleGroups.list']()
    const e = await h['entreno:exercises.save']({
      id: press,
      title: 'Press banca ficticio',
      category: 'STRENGTH',
      primaryGroupId: pecho.id,
      secondaryGroupIds: [triceps.id, hombros.id]
    })
    expect([e.category, e.primaryGroupId, e.secondaryGroupIds.sort(), e.setCount, e.lastUsed]).toEqual([
      'STRENGTH',
      pecho.id,
      [hombros.id, triceps.id].sort(),
      2,
      '2026-11-05T07:05'
    ])
    const remo = h['entreno:exercises.list']().find((x) => x.title === 'Remo ficticio')!
    expect([remo.setCount, remo.lastUsed, remo.category]).toEqual([2, '2026-11-07T10:00', null])
    await expect(
      h['entreno:exercises.save']({ id: press, title: 'Press banca ficticio', primaryGroupId: pecho.id, secondaryGroupIds: [pecho.id] })
    ).rejects.toThrow(/principal y secundario/)
    await expect(h['entreno:exercises.save']({ title: 'remo FICTICIO' })).rejects.toThrow(/Ya hay un ejercicio que se llama/)
    expect(h['entreno:muscleGroups.list']().find((g) => g.id === pecho.id)!.exerciseCount).toBe(1)
  })

  it('renombrar guarda el título anterior como alias para que Hevy lo siga reconociendo', async () => {
    const app = await appConDatos()
    const press = ejercicio(app, 'Press banca ficticio')
    const e = await app.h['entreno:exercises.save']({ id: press, title: 'Press de banca' })
    expect(e.aliases.map((a) => a.alias)).toEqual(['Press banca ficticio'])
    await expect(app.h['entreno:exercises.save']({ title: 'press banca ficticio' })).rejects.toThrow(/ya es un alias de otro ejercicio/)
  })

  it('alias: no repetidos ni iguales a otro ejercicio; la importación enlaza por alias', async () => {
    const app = await appConDatos()
    const h = app.h
    const press = ejercicio(app, 'Press banca ficticio')
    const e = await h['entreno:exercises.addAlias'](press, 'Bench Press ficticio')
    expect(e.aliases.map((a) => a.alias)).toEqual(['Bench Press ficticio'])
    await expect(h['entreno:exercises.addAlias'](ejercicio(app, 'Remo ficticio'), 'bench press FICTICIO')).rejects.toThrow(/ya es un alias/)
    await expect(h['entreno:exercises.addAlias'](press, 'Remo ficticio')).rejects.toThrow(/Ya hay un ejercicio que se llama/)
    await expect(h['entreno:exercises.addAlias'](press, '  ')).rejects.toThrow(/alias no puede estar vacío/)

    const antes = cuenta(app, 'trn_exercises')
    escribir(app.ctx, () =>
      applyHevyWorkouts(app.db, {
        meta: META,
        newWorkouts: [sesion('Torso B', '2026-11-12T07:00', [serie('Bench Press ficticio', 0, 0)])],
        changedWorkouts: []
      })
    )
    expect(cuenta(app, 'trn_exercises')).toBe(antes)
    const s = app.db.get<{ exercise_id: number; exercise_title: string }>(
      "SELECT s.exercise_id, s.exercise_title FROM trn_sets s JOIN trn_workouts w ON w.id = s.workout_id WHERE w.title = 'Torso B'"
    )
    expect(s).toEqual({ exercise_id: press, exercise_title: 'Bench Press ficticio' })
  })

  it('unir B en A mueve series y alias, deja el título de B como alias y borra B, todo en una operación', async () => {
    const app = await appConDatos()
    const h = app.h
    const a = ejercicio(app, 'Press banca ficticio')
    const b = ejercicio(app, 'Remo ficticio')
    await h['entreno:exercises.addAlias'](b, 'Rowing ficticio')
    const antes = app.ctx.queue.committedCount
    const r = await h['entreno:exercises.merge'](b, a)
    expect(app.ctx.queue.committedCount).toBe(antes + 1)
    expect(r.aliases.map((x) => x.alias).sort()).toEqual(['Remo ficticio', 'Rowing ficticio'])
    expect(r.setCount).toBe(4)
    expect(cuenta(app, `trn_exercises WHERE id = ${b}`)).toBe(0)
    // Las series conservan el título de Hevy.
    expect(app.db.all("SELECT DISTINCT exercise_id FROM trn_sets WHERE exercise_title = 'Remo ficticio'")).toEqual([{ exercise_id: a }])
    expect(app.db.all('SELECT * FROM trn_v_hevy').filter((x) => (x as { exercise_title: string }).exercise_title === 'Remo ficticio')).toHaveLength(2)
    await expect(h['entreno:exercises.merge'](a, a)).rejects.toThrow(/dos ejercicios distintos/)
    await expect(h['entreno:exercises.merge'](b, a)).rejects.toThrow('Ese ejercicio ya no existe.')
  })

  it('si la unión falla a medias no cambia nada', async () => {
    const app = await appConDatos()
    const a = ejercicio(app, 'Press banca ficticio')
    const b = ejercicio(app, 'Remo ficticio')
    const series = app.db.all('SELECT * FROM trn_sets ORDER BY id')
    // Se fuerza un fallo en el último paso (borrar B) con un disparador temporal.
    escribir(app.ctx, () =>
      app.db.exec(
        'CREATE TEMP TRIGGER falla BEFORE DELETE ON trn_exercises BEGIN SELECT RAISE(ABORT, \'fallo provocado\'); END;'
      )
    )
    await expect(app.h['entreno:exercises.merge'](b, a)).rejects.toThrow('fallo provocado')
    expect(app.db.all('SELECT * FROM trn_sets ORDER BY id')).toEqual(series)
    expect(cuenta(app, 'trn_exercise_aliases')).toBe(0)
  })
})

describe('catálogos, reglas y ajustes', () => {
  it('grupos musculares: alta, nombre repetido y no se borran si están en uso', async () => {
    const app = await appConDatos()
    const h = app.h
    const g = await h['entreno:muscleGroups.save']({ name: 'Aductores' })
    expect([g.sortOrder, g.active, g.exerciseCount]).toEqual([12, true, 0])
    await expect(h['entreno:muscleGroups.save']({ name: 'PECHO' })).rejects.toThrow('Ya hay un grupo muscular con ese nombre.')
    await h['entreno:exercises.save']({ title: 'Aducción ficticia', primaryGroupId: g.id })
    await expect(h['entreno:muscleGroups.delete'](g.id)).rejects.toThrow(/No se puede borrar «Aductores»: lo usan 1 ejercicio/)
    const off = await h['entreno:muscleGroups.save']({ id: g.id, name: 'Aductores', active: false })
    expect(off.active).toBe(false)
    const libre = await h['entreno:muscleGroups.save']({ name: 'Cuello' })
    await h['entreno:muscleGroups.delete'](libre.id)
    expect(h['entreno:muscleGroups.list']().some((x) => x.name === 'Cuello')).toBe(false)
  })

  it('reglas: gana la de mayor prioridad, reorder y reapply respeta kind_manual', async () => {
    const app = await appConDatos()
    const h = app.h
    const torso = idDe(app, 'Torso A')
    const mixto = idDe(app, 'Mixto')
    await h['entreno:workouts.updateExtras']({ id: mixto, kind: 'RUN' }) // corregido a mano
    const regla = await h['entreno:kindRules.save']({ field: 'exercise', contains: 'REMO', kind: 'OTHER', priority: 200 })
    await expect(h['entreno:kindRules.save']({ field: 'exercise', contains: 'remo', kind: 'GYM' })).rejects.toThrow(/Ya hay una regla/)
    const r = await h['entreno:kindRules.reapply']()
    expect(r).toEqual({ checked: 2, changed: 1 })
    expect(h['entreno:workouts.get'](torso).kind).toBe('OTHER')
    expect(h['entreno:workouts.get'](mixto)).toMatchObject({ kind: 'RUN', kindManual: true })
    expect(h['entreno:workouts.get'](idDe(app, 'Natación técnica')).kind).toBe('SWIM')

    // Reordenar: la primera queda con la prioridad más alta.
    const ids = h['entreno:kindRules.list']().map((x) => x.id)
    const nuevo = [...ids.slice(1), ids[0]]
    const lista = await h['entreno:kindRules.reorder'](nuevo)
    expect(lista.map((x) => x.id)).toEqual(nuevo)
    expect(lista[lista.length - 1].id).toBe(regla.id)
    await expect(h['entreno:kindRules.reorder'](nuevo.slice(1))).rejects.toThrow(/ha cambiado mientras la ordenabas/)

    await h['entreno:kindRules.delete'](regla.id)
    expect(await h['entreno:kindRules.reapply']()).toEqual({ checked: 2, changed: 1 })
    expect(h['entreno:workouts.get'](torso).kind).toBe('GYM')
  })

  it('ajustes: valores por defecto, guardado parcial validado', async () => {
    const app = await entrenoApp()
    const h = app.h
    expect(h['entreno:settings.get']()).toMatchObject({ e1rmFormula: 'EPLEY', e1rmMaxReps: 12, weekStartsOn: 1, secondaryMuscleFactor: 0.5 })
    const s = await h['entreno:settings.save']({ e1rmFormula: 'BRZYCKI', countedSetTypes: ['normal'] })
    expect([s.e1rmFormula, s.countedSetTypes, s.trendWeeks]).toEqual(['BRZYCKI', ['normal'], 6])
    await expect(h['entreno:settings.save']({ e1rmMinReps: 13 })).rejects.toThrow(/mínimo de repeticiones/)
    await expect(h['entreno:settings.save']({ secondaryMuscleFactor: 2 })).rejects.toThrow()
    await expect(h['entreno:settings.save']({ countedSetTypes: [] })).rejects.toThrow(/al menos un tipo de serie/)
    await expect(h['entreno:settings.save']({ inventado: 1 } as never)).rejects.toThrow()
    expect(h['entreno:settings.get']().e1rmMinReps).toBe(1)
  })
})

describe('importación de Hevy (servicio para el importador)', () => {
  it('nuevas: crea ejercicios con su tipo de medida, deduce el tipo y apunta la importación', async () => {
    const app = await appConDatos()
    expect(app.h['entreno:imports.list']()).toMatchObject([
      { fileName: 'hevy-ficticio.csv', format: 'CSV', rowsTotal: 7, workoutsNew: 3, workoutsChanged: 0, exercisesNew: 5 }
    ])
    const ex = app.h['entreno:exercises.list']()
    expect(ex.map((e) => [e.title, e.measure, e.category])).toEqual([
      ['Crol ficticio', 'DISTANCE_DURATION', null],
      ['Press banca ficticio', 'WEIGHT_REPS', null],
      ['Remo ficticio', 'WEIGHT_REPS', null],
      ['Sled Push ficticio', 'WEIGHT_REPS', null],
      ['Wall Ball ficticio', 'WEIGHT_REPS', null]
    ])
    const importId = app.h['entreno:imports.list']()[0].id
    expect(app.db.all('SELECT DISTINCT import_id, source FROM trn_workouts')).toEqual([{ import_id: importId, source: 'HEVY' }])
    expect(inferMeasure([serie('x', 0, 0, { weightKg: null, reps: null, durationSeconds: 30 })])).toBe('DURATION')
    expect(inferMeasure([serie('x', 0, 0, { weightKg: 20, reps: null, durationSeconds: 30 })])).toBe('WEIGHT_DURATION')
    expect(inferMeasure([serie('x', 0, 0, { weightKg: 0, reps: 10 })])).toBe('REPS')
  })

  it('cambiadas: sustituye las series y conserva tipo a mano, esfuerzo, notas, bloque y rutina', async () => {
    const app = await appConDatos()
    const now = '2026-11-23T10:00:00.000Z'
    escribir(app.ctx, () => {
      app.db.run("INSERT INTO trn_blocks (name, start_date, created_at, updated_at) VALUES ('Base', '2026-11-02', ?, ?)", [now, now])
      app.db.run("INSERT INTO trn_routines (name, created_at, updated_at) VALUES ('Upper', ?, ?)", [now, now])
    })
    const torso = idDe(app, 'Torso A')
    await app.h['entreno:workouts.updateExtras']({ id: torso, kind: 'OTHER', perceivedEffort: 9, notes: 'mía', blockId: 1, routineId: 1 })

    const guardadas = loadHevyWorkouts(app.db)
    expect([...guardadas.keys()]).toEqual(['Torso A|2026-11-05T07:05', 'Natación técnica|2026-11-06T18:30', 'Mixto|2026-11-07T10:00'])
    const t = guardadas.get('Torso A|2026-11-05T07:05')!
    expect([t.id, t.kind, t.kindManual, t.sets.length, t.sets[2]]).toEqual([torso, 'OTHER', true, 3, serie('Remo ficticio', 1, 0)])
    expect([...loadHevyWorkouts(app.db, ['Mixto|2026-11-07T10:00']).keys()]).toEqual(['Mixto|2026-11-07T10:00'])

    const res = escribir(app.ctx, () =>
      applyHevyWorkouts(app.db, {
        meta: { ...META, fileHash: 'def456', workoutsDuplicate: 1 },
        newWorkouts: [sesion('Pierna', '2026-11-10T07:00', [serie('Sentadilla ficticia', 0, 0)])],
        changedWorkouts: [
          sesion('Torso A', '2026-11-05T07:05', [serie('Press banca ficticio', 0, 0, { weightKg: 65 }), serie('Fondos ficticios', 1, 0, { weightKg: null })], {
            endTime: '2026-11-05T08:20',
            description: 'editada en Hevy'
          }),
          sesion('Mixto', '2026-11-07T10:00', [serie('Remo ficticio', 0, 0)])
        ],
        kinds: { 'Pierna|2026-11-10T07:00': 'RUN' }
      })
    )
    expect(res).toMatchObject({ workoutsNew: 1, workoutsChanged: 2, workoutsDuplicate: 1, exercisesNew: 2, setsWritten: 4 })
    const d = app.h['entreno:workouts.get'](torso)
    expect([d.kind, d.kindManual, d.perceivedEffort, d.notes, d.blockId, d.routineId, d.endTime, d.description, d.importId]).toEqual([
      'OTHER',
      true,
      9,
      'mía',
      1,
      1,
      '2026-11-05T08:20',
      'editada en Hevy',
      res.importId
    ])
    expect(d.exercises.map((e) => [e.exerciseTitle, e.sets.map((s) => s.weightKg)])).toEqual([
      ['Press banca ficticio', [65]],
      ['Fondos ficticios', [null]]
    ])
    // Mixto tenía tipo automático: se recalcula con sus series nuevas (ya no hay ejercicios de HYROX).
    expect(app.h['entreno:workouts.get'](idDe(app, 'Mixto')).kind).toBe('GYM')
    expect(app.h['entreno:workouts.get'](idDe(app, 'Pierna')).kind).toBe('RUN')
    expect(app.h['entreno:imports.list']().map((i) => [i.fileHash, i.workoutsNew, i.workoutsChanged, i.workoutsDuplicate])).toEqual([
      ['def456', 1, 2, 1],
      ['abc123', 3, 0, 0]
    ])
  })

  it('una importación con errores no deja nada a medias', async () => {
    const app = await appConDatos()
    const antes = { w: cuenta(app, 'trn_workouts'), s: cuenta(app, 'trn_sets'), e: cuenta(app, 'trn_exercises'), i: cuenta(app, 'trn_imports') }
    const intenta = (input: Parameters<typeof applyHevyWorkouts>[1]) => () => escribir(app.ctx, () => applyHevyWorkouts(app.db, input))
    expect(
      intenta({ meta: META, newWorkouts: [sesion('Torso A', '2026-11-05T07:05', [serie('Nuevo ficticio', 0, 0)])], changedWorkouts: [] })
    ).toThrow(/ya estaba importada/)
    expect(
      intenta({ meta: META, newWorkouts: [], changedWorkouts: [sesion('No está', '2026-11-01T07:05', [serie('Nuevo ficticio', 0, 0)])] })
    ).toThrow(/ya no está en la app/)
    expect(
      intenta({ meta: META, newWorkouts: [sesion('Doble', '2026-11-11T07:00', [serie('Nuevo ficticio', 0, 0), serie('Nuevo ficticio', 0, 0)])], changedWorkouts: [] })
    ).toThrow(/series repetidas/)
    expect(
      intenta({ meta: META, newWorkouts: [sesion('Mal', '11 Nov 2026, 07:00', [])], changedWorkouts: [] })
    ).toThrow(/Fecha y hora no válidas/)
    expect({ w: cuenta(app, 'trn_workouts'), s: cuenta(app, 'trn_sets'), e: cuenta(app, 'trn_exercises'), i: cuenta(app, 'trn_imports') }).toEqual(antes)
  })
})

describe('módulo en la app', () => {
  it('isEmpty de la app sigue siendo verdadero sin datos y falso con una sesión', async () => {
    const app = await entrenoApp()
    expect(app.h['core:app.info']().isEmpty).toBe(true)
    const press = await app.h['entreno:exercises.save']({ title: 'Press' })
    expect(app.h['core:app.info']().isEmpty).toBe(true)
    await app.h['entreno:workouts.saveManual']({ title: 'Sesión', startTime: '2026-11-08T09:00', exercises: [{ exerciseId: press.id, sets: [{}] }] })
    expect(app.h['core:app.info']().isEmpty).toBe(false)
  })

  it('los handlers de finanzas siguen igual con el módulo entreno registrado', async () => {
    const app = await entrenoApp()
    const s = AppState.for(app.ctx)
    s.todayOverride = '2026-10-11'
    const h = createAppHandlers(app.ctx, noDialogs, '0.0.0')
    expect(h['finanzas:accounts.list']()).toEqual([])
    expect(Object.keys(h).filter((k) => k.startsWith('entreno:')).every((k) => !k.slice('entreno:'.length).includes(':'))).toBe(true)
  })
})
