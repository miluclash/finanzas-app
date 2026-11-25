// Importación de Hevy contra la base (vista previa, aplicar, cambiadas, errores), exportaciones y
// restauración del JSON. Solo muestras inventadas de tests/fixtures/hevy-ficticio-*.
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { exportJsonObject, TRN_TABLES } from '../../src/main/modules/entreno/exports'
import type { DialogProvider } from '../../src/main/core/handlers'
import { readCsv } from '../../src/shared/csv'
import { entrenoApp, escribir, noDialogs } from './helpers'

const FX = path.resolve(__dirname, '../fixtures')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-hevy-test-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Diálogos falsos: `open` y `save` se fijan en cada prueba. */
function dialogs(): DialogProvider & { open: string | null; save: string | null } {
  const d = {
    open: null as string | null,
    save: null as string | null,
    ...noDialogs,
    openFile: async () => d.open,
    saveFile: async () => d.save
  }
  return d
}

const countTrn = (db: { get: <T>(s: string) => T | undefined }): Record<string, number> =>
  Object.fromEntries(TRN_TABLES.map((t) => [t, db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n]))

const copy = (name: string, edit?: (s: string) => string): string => {
  const out = path.join(tmp, `${Math.random().toString(36).slice(2)}-${name}`)
  const txt = fs.readFileSync(path.join(FX, name), 'utf8')
  fs.writeFileSync(out, edit ? edit(txt) : txt)
  return out
}

async function setup(paths = { dbPath: null as string | null, backupsDir: null as string | null }) {
  const d = dialogs()
  const app = await entrenoApp(paths, d)
  return { ...app, d, importFile: async (f: string) => {
    d.open = f
    const p = (await app.h['entreno:import.preview']())!
    return { p, r: await app.h['entreno:import.apply'](p.token) }
  } }
}

describe('vista previa', () => {
  it('no escribe nada y resume el archivo', async () => {
    const a = await setup()
    const before = countTrn(a.db)
    const audits = a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n
    a.d.open = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const p = (await a.h['entreno:import.preview']())!
    expect(p.fileName).toBe('hevy-ficticio-sesiones.csv')
    expect(p.format).toBe('CSV')
    expect([p.rowsTotal, p.rowsValid, p.duplicateCount, p.sessionsWithErrors]).toEqual([13, 13, 0, 0])
    expect(p.newWorkouts.map((w) => [w.title, w.kind, w.exerciseCount, w.setCount])).toEqual([
      ['Natación técnica', 'SWIM', 2, 3],
      ['Torso A', 'GYM', 4, 8],
      ['Core rápido', 'GYM', 1, 2]
    ])
    expect(p.newExercises).toContain('Crol')
    expect(p.alreadyImported).toBe(false)
    expect(countTrn(a.db)).toEqual(before)
    expect(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n).toBe(audits)
  })
  it('null si se cancela el diálogo; cancel olvida el token', async () => {
    const a = await setup()
    expect(await a.h['entreno:import.preview']()).toBeNull()
    a.d.open = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const p = (await a.h['entreno:import.preview']())!
    a.h['entreno:import.cancel'](p.token)
    await expect(a.h['entreno:import.apply'](p.token)).rejects.toThrow(/vista previa/)
  })
  it('TSV y XLSX', async () => {
    const a = await setup()
    a.d.open = path.join(FX, 'hevy-ficticio-sesiones.tsv')
    expect((await a.h['entreno:import.preview']())!.format).toBe('TSV')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('x')
    for (const r of readCsv(fs.readFileSync(path.join(FX, 'hevy-ficticio-sesiones.csv'), 'utf8')).records) ws.addRow(r.fields)
    const xl = path.join(tmp, 'h.xlsx')
    await wb.xlsx.writeFile(xl)
    a.d.open = xl
    const p = (await a.h['entreno:import.preview']())!
    expect(p.format).toBe('XLSX')
    expect(p.newWorkouts).toHaveLength(3)
  })
  it('cabecera que no es de Hevy: error claro', async () => {
    const a = await setup()
    const f = path.join(tmp, 'mal.csv')
    fs.writeFileSync(f, 'a,b\n1,2\n')
    a.d.open = f
    await expect(a.h['entreno:import.preview']()).rejects.toThrow(/Faltan columnas/)
  })
  it('avisa si hay otra sesión a la misma hora con otro título', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    a.d.open = copy('hevy-ficticio-sesiones.csv', (s) => s.replace(/"Core rápido"/g, '"Core renombrado"'))
    const p = (await a.h['entreno:import.preview']())!
    expect(p.newWorkouts).toHaveLength(1)
    expect(p.warnings.join(' ')).toMatch(/renombraste/)
    expect(p.alreadyImported).toBe(false)
  })
})

describe('aplicar', () => {
  it('importa, y reimportar no duplica', async () => {
    const a = await setup({ dbPath: null, backupsDir: path.join(tmp, 'copias') })
    const f = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const { r } = await a.importFile(f)
    expect([r.workoutsNew, r.workoutsChanged, r.workoutsDuplicate, r.setsWritten]).toEqual([3, 0, 0, 13])
    expect(r.backup && fs.existsSync(r.backup)).toBeTruthy()
    const after = countTrn(a.db)
    expect(after.trn_workouts).toBe(3)
    expect(after.trn_sets).toBe(13)
    const audit = a.db.get<{ summary: string }>("SELECT summary FROM audit_log WHERE entity = 'trn_imports'")!
    expect(audit.summary).not.toMatch(/Torso|Natación/)

    const again = await a.importFile(f)
    expect(again.p.alreadyImported).toBe(true)
    expect(again.p.duplicateCount).toBe(3)
    expect([again.r.workoutsNew, again.r.workoutsChanged, again.r.workoutsDuplicate]).toEqual([0, 0, 3])
    expect({ ...countTrn(a.db), trn_imports: 0 }).toEqual({ ...after, trn_imports: 0 })
    expect(countTrn(a.db).trn_imports).toBe(2)
  })
  it('un archivo más completo añade solo lo nuevo', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-errores.csv')) // Empuje C y Natación (Pierna B con error)
    expect(countTrn(a.db).trn_workouts).toBe(2)
    const { r } = await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    expect([r.workoutsNew, r.workoutsDuplicate]).toEqual([2, 1])
  })
  it('sesiones con error no se importan; el resto sí', async () => {
    const a = await setup()
    const { p, r } = await a.importFile(path.join(FX, 'hevy-ficticio-errores.csv'))
    expect(p.errors).toEqual([{ line: 3, column: 'rpe', message: 'rpe fuera de 1 a 10 en rpe, línea 3' }])
    expect([p.sessionsWithErrors, p.newWorkouts.length]).toEqual([1, 2])
    expect([r.workoutsNew, r.sessionsWithErrors, r.rowsError]).toEqual([2, 1, 1])
    expect(a.db.get('SELECT 1 AS x FROM trn_workouts WHERE title = ?', ['Pierna B'])).toBeUndefined()
  })
  it('sesión cambiada: sustituye series y conserva lo propio', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    const w = a.db.get<{ id: number }>("SELECT id FROM trn_workouts WHERE title = 'Torso A'")!
    escribir(a.ctx, () =>
      a.db.run("UPDATE trn_workouts SET perceived_effort = 8, notes = 'mis notas', kind = 'OTHER', kind_manual = 1 WHERE id = ?", [w.id])
    )
    const f = copy('hevy-ficticio-sesiones.csv', (s) => s.replace(',82.5,8,', ',85,8,'))
    a.d.open = f
    const p = (await a.h['entreno:import.preview']())!
    expect([p.changedWorkouts.length, p.duplicateCount, p.newWorkouts.length]).toEqual([1, 2, 0])
    expect(p.changedWorkouts[0].kind).toBe('OTHER')
    const r = await a.h['entreno:import.apply'](p.token)
    expect([r.workoutsChanged, r.workoutsNew]).toEqual([1, 0])
    const row = a.db.get<{ id: number; perceived_effort: number; notes: string; kind: string }>(
      "SELECT * FROM trn_workouts WHERE title = 'Torso A'"
    )!
    expect([row.id, row.perceived_effort, row.notes, row.kind]).toEqual([w.id, 8, 'mis notas', 'OTHER'])
    const ws = a.db.all<{ weight_kg: number }>("SELECT weight_kg FROM trn_sets WHERE workout_id = ? AND exercise_order = 0 ORDER BY set_index", [w.id])
    expect(ws.map((x) => x.weight_kg)).toEqual([40, 85, 82.5])
    expect(countTrn(a.db).trn_sets).toBe(13)
  })
  it('archivo cambiado entre la vista previa y aplicar: error y no escribe', async () => {
    const a = await setup()
    const f = copy('hevy-ficticio-sesiones.csv')
    a.d.open = f
    const p = (await a.h['entreno:import.preview']())!
    fs.appendFileSync(f, '\r\n')
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Crol', 'Crawl'))
    const before = countTrn(a.db)
    await expect(a.h['entreno:import.apply'](p.token)).rejects.toThrow(/ha cambiado desde la vista previa/)
    expect(countTrn(a.db)).toEqual(before)
  })
  it('un fallo a mitad hace rollback de todo', async () => {
    const a = await setup()
    escribir(a.ctx, () =>
      a.db.exec(
        "CREATE TRIGGER falla BEFORE INSERT ON trn_sets WHEN NEW.exercise_title = 'Curl ficticio' BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END"
      )
    )
    const before = countTrn(a.db)
    const audits = a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n
    a.d.open = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const p = (await a.h['entreno:import.preview']())!
    await expect(a.h['entreno:import.apply'](p.token)).rejects.toThrow()
    expect(countTrn(a.db)).toEqual(before)
    expect(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n).toBe(audits)
  })
  it('el token caduca', async () => {
    const a = await setup()
    a.d.open = path.join(FX, 'hevy-ficticio-sesiones.csv')
    const p = (await a.h['entreno:import.preview']())!
    const now = Date.now()
    const spy = (await import('vitest')).vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60 * 1000)
    await expect(a.h['entreno:import.apply'](p.token)).rejects.toThrow(/caducado/)
    spy.mockRestore()
  })
})

describe('exportar y restaurar', () => {
  it('CSV con el estilo exacto de Hevy', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    a.d.save = path.join(tmp, 'out.csv')
    expect(await a.h['entreno:export.csv']()).toBe(a.d.save)
    expect(fs.readFileSync(a.d.save, 'utf8')).toBe(fs.readFileSync(path.join(FX, 'hevy-ficticio-sesiones.csv'), 'utf8'))
    a.d.save = null
    expect(await a.h['entreno:export.csv']()).toBeNull()
  })
  it('XLSX: una hoja por tabla trn_ y la hoja Hevy', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    a.d.save = path.join(tmp, 'out.xlsx')
    await a.h['entreno:export.xlsx']()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(a.d.save)
    expect(wb.worksheets.map((w) => w.name).sort()).toEqual(['Hevy', ...TRN_TABLES].sort())
    expect(wb.getWorksheet('Hevy')!.rowCount).toBe(14)
    expect(wb.getWorksheet('trn_workouts')!.rowCount).toBe(4)
  })
  it('TRN_TABLES cubre todas las tablas trn_ de la base', async () => {
    const a = await setup()
    const names = a.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'trn\\_%' ESCAPE '\\'").map((r) => r.name)
    expect(names.sort()).toEqual([...TRN_TABLES].sort())
  })
  it('JSON → restaurar da los mismos datos y no toca finanzas', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    escribir(a.ctx, () => a.db.run("UPDATE trn_workouts SET notes = 'x', perceived_effort = 7 WHERE title = 'Torso A'"))
    a.d.save = path.join(tmp, 'out.json')
    await a.h['entreno:export.json']()
    const exported = JSON.parse(fs.readFileSync(a.d.save, 'utf8'))
    expect(exported.schemaVersion).toBeGreaterThan(2000)

    const b = await setup({ dbPath: null, backupsDir: path.join(tmp, 'copias-b') })
    await b.importFile(path.join(FX, 'hevy-ficticio-errores.csv'))
    const fin = (): unknown[] =>
      b.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'trn\\_%' ESCAPE '\\' AND name NOT IN ('audit_log','schema_migrations') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'")
        .map((t) => [t.name, b.db.all(`SELECT * FROM ${t.name}`)])
    const finBefore = JSON.stringify(fin())
    b.d.open = a.d.save
    const res = (await b.h['entreno:restore.json']())!
    expect(res.safetyBackup).toBeTruthy()
    expect(JSON.stringify(fin())).toBe(finBefore)
    expect(exportJsonObject(b.db).tables).toEqual(exported.tables)
    // Y el CSV sale idéntico tras restaurar
    b.d.save = path.join(tmp, 'b.csv')
    await b.h['entreno:export.csv']()
    expect(fs.readFileSync(b.d.save, 'utf8')).toBe(fs.readFileSync(path.join(FX, 'hevy-ficticio-sesiones.csv'), 'utf8'))
  })
  it('JSON no válido: error y no cambia nada', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    const before = JSON.stringify(exportJsonObject(a.db).tables)
    const f = path.join(tmp, 'mal.json')
    for (const bad of [
      { app: 'finanzas-entreno', format: 1, schemaVersion: 2005, tables: { trn_workouts: [] } },
      { app: 'finanzas-entreno', format: 1, schemaVersion: 99999, tables: Object.fromEntries(TRN_TABLES.map((t) => [t, []])) },
      { app: 'finanzas-entreno', format: 1, schemaVersion: 2005, tables: { ...Object.fromEntries(TRN_TABLES.map((t) => [t, []])), trn_settings: [{ nope: 1 }] } },
      { app: 'otra-cosa' }
    ]) {
      fs.writeFileSync(f, JSON.stringify(bad))
      a.d.open = f
      await expect(a.h['entreno:restore.json']()).rejects.toThrow()
      expect(JSON.stringify(exportJsonObject(a.db).tables)).toBe(before)
    }
  })
  it('un JSON de finanzas se rechaza sin copia y sin cambiar nada', async () => {
    const backups = path.join(tmp, 'copias-fin')
    const a = await setup({ dbPath: null, backupsDir: backups })
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    const dump = (): string =>
      JSON.stringify(
        a.db
          .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
          .filter((t) => t.name !== 'audit_log' && !t.name.startsWith('sqlite_'))
          .map((t) => [t.name, a.db.all(`SELECT * FROM ${t.name}`)])
      )
    const before = dump()
    const copiasAntes = fs.existsSync(backups) ? fs.readdirSync(backups).length : 0
    const f = path.join(tmp, 'finanzas.json')
    fs.writeFileSync(f, JSON.stringify({ app: 'finanzas-app', format: 1, tables: {} }))
    a.d.open = f
    await expect(a.h['entreno:restore.json']()).rejects.toThrow(/no es una exportación de Entreno/)
    fs.writeFileSync(f, 'esto no es json')
    await expect(a.h['entreno:restore.json']()).rejects.toThrow(/no es una exportación de Entreno/)
    expect(dump()).toBe(before)
    expect(fs.existsSync(backups) ? fs.readdirSync(backups).length : 0).toBe(copiasAntes)
  })
  it('datos que no cuadran (clave ajena rota): mensaje en español y nada cambia', async () => {
    const a = await setup()
    await a.importFile(path.join(FX, 'hevy-ficticio-sesiones.csv'))
    const o = JSON.parse(JSON.stringify(exportJsonObject(a.db)))
    o.tables.trn_sets[0].workout_id = 99999
    const f = path.join(tmp, 'roto.json')
    fs.writeFileSync(f, JSON.stringify(o))
    a.d.open = f
    const before = JSON.stringify(exportJsonObject(a.db).tables)
    await expect(a.h['entreno:restore.json']()).rejects.toThrow(/no cuadran entre sí/)
    expect(JSON.stringify(exportJsonObject(a.db).tables)).toBe(before)
  })
})

describe('casos de la revisión', () => {
  const CABECERA = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"'
  const fila = (ex: string, i: number, w: string, title = 'Mixta', start = '5 Nov 2026, 07:05'): string =>
    `"${title}","${start}","30 Nov 2026, 08:00","","${ex}",,"",${i},"normal",${w},8,,,`
  const csv = (...rows: string[]): string => [CABECERA, ...rows].join('\r\n')
  const write = (name: string, txt: string): string => {
    const f = path.join(tmp, name)
    fs.writeFileSync(f, txt)
    return f
  }

  it('el mismo ejercicio separado por otro cuenta como dos bloques (ida y vuelta exacta)', async () => {
    const txt = csv(fila('Press', 0, '60'), fila('Press', 1, '60'), fila('Remo', 0, '50'), fila('Press', 0, '55'), fila('Press', 1, '55'))
    const a = await setup()
    const f = write('dos-bloques.csv', txt)
    const { p, r } = await a.importFile(f)
    expect(p.errors).toEqual([])
    expect([p.newWorkouts[0].exerciseCount, r.setsWritten]).toEqual([3, 5])
    expect(a.db.all<{ exercise_order: number; set_index: number }>('SELECT exercise_order, set_index FROM trn_sets ORDER BY exercise_order, set_index').map((x) => [x.exercise_order, x.set_index])).toEqual([[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]])
    const again = await a.importFile(f)
    expect([again.p.duplicateCount, again.p.changedWorkouts.length, again.p.newWorkouts.length]).toEqual([1, 0, 0])
    a.d.save = path.join(tmp, 'dos-bloques-out.csv')
    await a.h['entreno:export.csv']()
    expect(fs.readFileSync(a.d.save, 'utf8')).toBe(txt)
  })

  it('doble apply: el segundo se rechaza; preview B sin esperar a A no rompe', async () => {
    const a = await setup()
    const fa = path.join(FX, 'hevy-ficticio-sesiones.csv')
    a.d.open = fa
    const pa = (await a.h['entreno:import.preview']())!
    const ra = a.h['entreno:import.apply'](pa.token)
    const rb = a.h['entreno:import.apply'](pa.token)
    await expect(rb).rejects.toThrow(/en curso/)
    await ra
    expect(countTrn(a.db).trn_imports).toBe(1)

    // A sin esperar -> preview B -> apply B
    const a2 = await setup()
    a2.d.open = fa
    const p1 = (await a2.h['entreno:import.preview']())!
    const run1 = a2.h['entreno:import.apply'](p1.token)
    a2.d.open = write('b.csv', csv(fila('Press', 0, '60', 'Otra', '6 Nov 2026, 07:05')))
    const p2 = (await a2.h['entreno:import.preview']())!
    await run1
    const r2 = await a2.h['entreno:import.apply'](p2.token)
    expect(r2.workoutsNew).toBe(1)
    expect(countTrn(a2.db).trn_imports).toBe(2)
  })

  it('weight_kg negativo vale (asistidos); otros negativos no', async () => {
    const a = await setup()
    a.d.open = write('neg.csv', csv(fila('Dominadas asistidas', 0, '-20')))
    const p = (await a.h['entreno:import.preview']())!
    expect(p.errors).toEqual([])
    await a.h['entreno:import.apply'](p.token)
    expect(a.db.get<{ w: number }>('SELECT weight_kg AS w FROM trn_sets')!.w).toBe(-20)
    a.d.open = write('neg2.csv', csv(fila('X', -1, '5')))
    expect((await a.h['entreno:import.preview']())!.errors[0].column).toBe('set_index')
  })

  it('avisa si hay una sesión manual a la misma hora', async () => {
    const a = await setup()
    a.d.open = write('m.csv', csv(fila('Press', 0, '60')))
    const p0 = (await a.h['entreno:import.preview']())!
    await a.h['entreno:import.apply'](p0.token)
    // La pasa a manual (simula una sesión apuntada a mano a esa hora) y reimporta con otro título.
    escribir(a.ctx, () => a.db.run("UPDATE trn_workouts SET source = 'MANUAL', hevy_key = NULL"))
    const p = (await a.h['entreno:import.preview']())!
    expect(p.warnings.join(' ')).toMatch(/apuntada a mano/)
  })
})
