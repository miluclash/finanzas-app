// Huecos de la fase F3: concurrencia en la cola, copia de seguridad completa con datos trn_,
// validación de sesiones manuales sin escribir, y borrar + reimportar una sesión de Hevy. Datos inventados.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../../src/main/core/backup'
import { Db } from '../../src/main/core/db'
import { TRN_TABLES } from '../../src/main/modules/entreno/exports'
import { entrenoApp, noDialogs } from './helpers'
import type { DialogProvider } from '../../src/main/core/handlers'

const FX = path.resolve(__dirname, '../fixtures')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-f3-huecos-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const n = (db: Db, from: string) => db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${from}`)!.n
const conteos = (db: Db) => Object.fromEntries(TRN_TABLES.map((t) => [t, n(db, t)]))

function dialogs() {
  const d = { open: null as string | null, ...noDialogs, openFile: async () => d.open } as DialogProvider & { open: string | null }
  return d
}

describe('cola con muchas escrituras de entreno', () => {
  it('100 escrituras en paralelo terminan todas, en orden y sin perder ninguna', async () => {
    const app = await entrenoApp()
    const h = app.h
    const base = await h['entreno:exercises.save']({ title: 'Base ficticio' })
    const etiquetas: string[] = []
    const real = app.ctx.queue.enqueue.bind(app.ctx.queue)
    app.ctx.queue.enqueue = ((label: string, fn: () => unknown, opts?: never) => {
      etiquetas.push(label)
      return real(label, fn, opts)
    }) as typeof app.ctx.queue.enqueue

    const orden: number[] = []
    const promesas: Promise<unknown>[] = []
    let manuales = 0
    let ejercicios = 0
    const extras: number[] = []
    for (let i = 0; i < 100; i++) {
      let p: Promise<unknown>
      if (i % 3 === 0) {
        manuales++
        p = h['entreno:workouts.saveManual']({
          title: `Manual ${i}`,
          startTime: `2026-11-${String((i % 28) + 1).padStart(2, '0')}T10:00`,
          exercises: [{ exerciseId: base.id, sets: [{ reps: i % 20, weightKg: 20 }] }]
        })
      } else if (i % 3 === 1) {
        ejercicios++
        p = h['entreno:exercises.save']({ title: `Ejercicio ${i}` })
      } else {
        // Necesita una sesión que ya exista: la primera manual (i = 0) está antes en la cola.
        extras.push(i)
        p = h['entreno:workouts.updateExtras']({ id: 1, notes: `nota ${i}` })
      }
      promesas.push(p.then(() => orden.push(i)))
    }
    const res = await Promise.allSettled(promesas)
    expect(res.filter((r) => r.status === 'rejected')).toEqual([])
    expect(orden).toEqual([...Array(100).keys()])
    expect(etiquetas).toHaveLength(100)
    expect(etiquetas[0]).toBe('entreno:workouts.saveManual')
    expect(n(app.db, 'trn_workouts')).toBe(manuales)
    expect(n(app.db, 'trn_exercises')).toBe(ejercicios + 1)
    // La última nota escrita es la de la última escritura de la cola.
    expect(app.db.get<{ notes: string }>('SELECT notes FROM trn_workouts WHERE id = 1')!.notes).toBe(`nota ${extras[extras.length - 1]}`)
    expect(app.ctx.queue.busy).toBe(false)
  })

  it('dos importaciones seguidas no se pisan', async () => {
    const d = dialogs()
    const app = await entrenoApp({ dbPath: null, backupsDir: path.join(tmp, 'copias-apply') }, d)
    const h = app.h
    const a = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const b = path.join(tmp, 'otro.csv')
    // Otro archivo con otras sesiones (otros títulos y fechas), para que no sea un duplicado.
    fs.writeFileSync(
      b,
      fs.readFileSync(a, 'utf8').replace(/Natación técnica/g, 'Natación B').replace(/Torso A/g, 'Torso B').replace(/Core rápido/g, 'Core B').replace(/ Nov 2026/g, ' Dec 2026')
    )
    d.open = a
    const pa = (await h['entreno:import.preview']())!
    const x = await h['entreno:import.apply'](pa.token)
    d.open = b
    const pb = (await h['entreno:import.preview']())!
    const y = await h['entreno:import.apply'](pb.token)
    expect(x.workoutsNew).toBe(3)
    expect(y.workoutsNew).toBe(3)
    expect(n(app.db, 'trn_workouts')).toBe(6)
    expect(n(app.db, 'trn_imports')).toBe(2)
    expect(app.db.all('PRAGMA foreign_key_check')).toEqual([])
    // Un token ya usado no se puede aplicar otra vez.
    await expect(h['entreno:import.apply'](pb.token)).rejects.toThrow(/vista previa ya no es válida/)
    expect(n(app.db, 'trn_workouts')).toBe(6)
  })
})

describe('copia de seguridad completa y entreno', () => {
  it('copia hecha después de importar y restaurada conserva las tablas trn_ y sus datos', async () => {
    const d = dialogs()
    const dir = fs.mkdtempSync(path.join(tmp, 'c-'))
    const app = await entrenoApp({ dbPath: path.join(dir, 'finanzas.sqlite'), backupsDir: path.join(dir, 'copias') }, d)
    d.open = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const p = (await app.h['entreno:import.preview']())!
    await app.h['entreno:import.apply'](p.token)
    const antes = conteos(app.db)
    expect(antes.trn_workouts).toBe(3)
    const filasAntes = app.db.all('SELECT title, start_time, hevy_key FROM trn_workouts ORDER BY id')
    const copia = await app.ctx.queue.enqueueTask('test:copia', async () => createBackup(app.ctx, 'manual'))

    // Se borra todo y se restaura la copia.
    for (const w of app.h['entreno:workouts.list']()) await app.h['entreno:workouts.delete'](w.id)
    expect(n(app.db, 'trn_workouts')).toBe(0)
    await restoreBackup(app.ctx, copia.path)
    expect(app.ctx.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'trn_%' ORDER BY name").length).toBeGreaterThanOrEqual(TRN_TABLES.length)
    expect(conteos(app.ctx.db)).toEqual(antes)
    expect(app.ctx.db.all('SELECT title, start_time, hevy_key FROM trn_workouts ORDER BY id')).toEqual(filasAntes)
    expect(app.h['entreno:workouts.list']()).toHaveLength(3)
    app.ctx.db.close()
  })
})

describe('sesión manual inválida', () => {
  it('rechaza con mensajes en español y no escribe nada', async () => {
    const app = await entrenoApp()
    const h = app.h
    const e = await h['entreno:exercises.save']({ title: 'Ej ficticio' })
    const antes = { ...conteos(app.db), audit: n(app.db, 'audit_log') }
    const ok = { title: 'M', startTime: '2026-11-09T19:00', exercises: [{ exerciseId: e.id, sets: [{ reps: 5 }] }] }
    await expect(h['entreno:workouts.saveManual']({ ...ok, endTime: '2026-11-09T18:00' })).rejects.toThrow(/fin no puede ser anterior/)
    await expect(
      h['entreno:workouts.saveManual']({ ...ok, exercises: [{ exerciseId: e.id, sets: [{ reps: -3 }] }] })
    ).rejects.toThrow(/[a-záéíóú]/i)
    await expect(h['entreno:workouts.saveManual']({ ...ok, perceivedEffort: 11 })).rejects.toThrow(/esfuerzo va de 1 a 10/i)
    await expect(h['entreno:workouts.saveManual']({ ...ok, perceivedEffort: 0 })).rejects.toThrow(/esfuerzo va de 1 a 10/i)
    expect({ ...conteos(app.db), audit: n(app.db, 'audit_log') }).toEqual(antes)
  })
})

describe('borrar una sesión de Hevy y reimportar', () => {
  it('el mismo archivo la vuelve a crear como nueva, y las otras siguen como duplicadas', async () => {
    const d = dialogs()
    const app = await entrenoApp({ dbPath: null, backupsDir: path.join(tmp, 'copias-borrar') }, d)
    const h = app.h
    d.open = path.join(FX, 'hevy-ficticio-sesiones.csv')
    let p = (await h['entreno:import.preview']())!
    await h['entreno:import.apply'](p.token)
    const torso = h['entreno:workouts.list']().find((w) => w.title === 'Torso A')!
    await h['entreno:workouts.delete'](torso.id)
    expect(n(app.db, 'trn_workouts')).toBe(2)

    p = (await h['entreno:import.preview']())!
    const r = await h['entreno:import.apply'](p.token)
    expect([r.workoutsNew, r.workoutsChanged, r.workoutsDuplicate]).toEqual([1, 0, 2])
    expect(n(app.db, 'trn_workouts')).toBe(3)
    const nueva = h['entreno:workouts.list']().find((w) => w.title === 'Torso A')!
    expect(nueva.id).not.toBe(torso.id)
    expect(nueva.source).toBe('HEVY')
    expect(nueva.setCount).toBe(torso.setCount)
  })
})
