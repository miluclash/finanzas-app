// Migraciones de Entreno: base vacía, base de finanzas de la versión anterior (con datos), datos
// iniciales que no se duplican, restricciones de SQL y restaurar una copia de antes de Entreno.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAppRegistry } from '../../src/main/app'
import { restoreBackup } from '../../src/main/core/backup'
import { Db } from '../../src/main/core/db'
import { MIGRATIONS } from '../../src/main/modules/entreno/migrations'
import { DEFAULT_SETTINGS } from '../../src/main/modules/entreno/seed'
import { AppState } from '../../src/main/modules/finanzas/state'
import { account, tx } from '../helpers'
import { entrenoApp, escribir } from './helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-entreno-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

const TABLAS_TRN = [
  'trn_base_week',
  'trn_base_week_meta',
  'trn_blocks',
  'trn_events',
  'trn_exercise_aliases',
  'trn_exercise_muscles',
  'trn_exercises',
  'trn_goals',
  'trn_imports',
  'trn_kind_rules',
  'trn_muscle_groups',
  'trn_routine_aliases',
  'trn_routine_items',
  'trn_routines',
  'trn_sets',
  'trn_settings',
  'trn_week_plan',
  'trn_week_plan_weeks',
  'trn_workouts'
]

function objetos(db: Db, type: 'table' | 'view'): string[] {
  return db.all<{ name: string }>('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name', [type]).map((r) => r.name)
}

/** Contenido de todas las tablas que no son de entreno (finanzas y núcleo), menos schema_migrations. */
function volcadoNoEntreno(db: Db): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const t of objetos(db, 'table')) {
    // Las core_ (F5) son nuevas y vacías: las comprueban los tests de gráficos.
    if (t.startsWith('trn_') || t.startsWith('core_') || t.startsWith('sqlite_') || t === 'schema_migrations') continue
    out[t] = db.all(`SELECT * FROM "${t}" ORDER BY rowid`)
  }
  return out
}

/** Base de la versión anterior (solo finanzas, con datos) guardada en `file`. */
async function baseAnterior(file: string): Promise<void> {
  const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: null })
  s.todayOverride = '2026-10-11'
  const a = account(s, { name: 'Corriente' })
  tx(s, { accountId: a.id, amountCents: 250000, description: 'Nómina' })
  tx(s, { accountId: a.id, amountCents: -4550, description: 'Súper' })
  s.db.close()
}

describe('migraciones de entreno', () => {
  it('las versiones están en el rango de entreno, en orden y sin reconstruir tablas', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([2001, 2002, 2003, 2004, 2005, 2006])
    for (const m of MIGRATIONS) {
      expect(m.up).not.toMatch(/\bDROP\s+TABLE\b/i)
      // ALTER TABLE solo para añadir columnas (nada de RENAME ni DROP COLUMN).
      for (const alter of m.up.matchAll(/\bALTER\s+TABLE\s+\w+\s+(\w+)/gi)) expect(alter[1].toUpperCase()).toBe('ADD')
      expect(m.up).not.toMatch(/PRAGMA/i)
    }
    expect(createAppRegistry().migrations.map((m) => m.version)).toEqual([1, 1001, 1002, 2001, 2002, 2003, 2004, 2005, 2006])
  })

  it('base vacía: crea las tablas, la vista y los datos iniciales', async () => {
    const { db } = await entrenoApp()
    expect(objetos(db, 'table').filter((t) => t.startsWith('trn_'))).toEqual(TABLAS_TRN)
    expect(objetos(db, 'view')).toEqual(['trn_v_hevy'])
    expect(db.all('SELECT version FROM schema_migrations WHERE version >= 2000 ORDER BY version')).toEqual(
      [2001, 2002, 2003, 2004, 2005, 2006].map((version) => ({ version }))
    )
    expect(db.all<{ name: string }>('SELECT name FROM trn_muscle_groups ORDER BY sort_order').map((r) => r.name)).toEqual([
      'Pecho',
      'Espalda',
      'Hombros',
      'Bíceps',
      'Tríceps',
      'Antebrazo',
      'Cuádriceps',
      'Isquiotibiales',
      'Glúteos',
      'Gemelos',
      'Core',
      'Cuerpo completo'
    ])
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_kind_rules')!.n).toBe(13)
    const ajustes = Object.fromEntries(
      db.all<{ key: string; value: string }>('SELECT key, value FROM trn_settings').map((r) => [r.key, JSON.parse(r.value)])
    )
    expect(ajustes).toEqual(DEFAULT_SETTINGS)
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
  })

  it('base de finanzas de la versión anterior: copia antes de migrar, crea lo de entreno y no toca finanzas', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    await baseAnterior(file)
    const vieja = await Db.open(file)
    const antes = volcadoNoEntreno(vieja)
    expect(objetos(vieja, 'table').some((t) => t.startsWith('trn_'))).toBe(false)
    vieja.close()

    const { ctx, db } = await entrenoApp({ dbPath: file, backupsDir: backups })
    expect(fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))).toHaveLength(1)
    expect(volcadoNoEntreno(db)).toEqual(antes)
    expect(objetos(db, 'table').filter((t) => t.startsWith('trn_'))).toEqual(TABLAS_TRN)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_muscle_groups')!.n).toBe(12)
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
    expect(AppState.for(ctx).snap().transactions).toHaveLength(2)
    db.close()

    // En disco también: al volver a abrir, finanzas sigue igual y entreno está.
    const r = await Db.open(file)
    expect(volcadoNoEntreno(r)).toEqual(antes)
    expect(r.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_kind_rules')!.n).toBe(13)
    r.close()
  })

  it('volver a abrir no duplica los datos iniciales ni escribe el archivo, y lo borrado no reaparece', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const primera = await entrenoApp({ dbPath: file, backupsDir: null })
    escribir(primera.ctx, () => primera.db.run("DELETE FROM trn_muscle_groups WHERE name = 'Gemelos'"))
    escribir(primera.ctx, () => primera.db.run("DELETE FROM trn_kind_rules WHERE contains = 'swim'"))
    primera.db.close()
    const huella = sha(file)
    const mtime = fs.statSync(file).mtimeMs

    const segunda = await entrenoApp({ dbPath: file, backupsDir: null })
    expect(segunda.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_muscle_groups')!.n).toBe(11)
    expect(segunda.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_kind_rules')!.n).toBe(12)
    expect(segunda.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_settings')!.n).toBe(Object.keys(DEFAULT_SETTINGS).length)
    segunda.db.close()
    expect(sha(file)).toBe(huella)
    expect(fs.statSync(file).mtimeMs).toBe(mtime)
  })

  it('la semilla rellena un ajuste que falta sin pisar los cambiados', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const a = await entrenoApp({ dbPath: file, backupsDir: null })
    await a.h['entreno:settings.save']({ trendWeeks: 8 })
    escribir(a.ctx, () => a.db.run("DELETE FROM trn_settings WHERE key = 'timeZone'"))
    a.db.close()
    const b = await entrenoApp({ dbPath: file, backupsDir: null })
    expect(b.h['entreno:settings.get']()).toMatchObject({ trendWeeks: 8, timeZone: 'Europe/Madrid' })
    expect(b.db.get<{ value: string }>("SELECT value FROM trn_settings WHERE key = 'timeZone'")!.value).toBe('"Europe/Madrid"')
    b.db.close()
  })

  it('restaurar una copia de antes de Entreno (sin tablas trn_) funciona y la deja al día', async () => {
    const dir = tmpDir()
    const copia = path.join(dir, 'copia-antigua.sqlite')
    await baseAnterior(copia)
    const vieja = await Db.open(copia)
    const finanzasCopia = volcadoNoEntreno(vieja)
    vieja.close()

    const file = path.join(dir, 'finanzas.sqlite')
    const app = await entrenoApp({ dbPath: file, backupsDir: path.join(dir, 'backups') })
    expect(app.ctx.registry.requiredTables).toEqual(['schema_migrations', 'accounts', 'transactions', 'categories'])
    await restoreBackup(app.ctx, copia)

    const db = app.ctx.db
    expect(objetos(db, 'table').filter((t) => t.startsWith('trn_'))).toEqual(TABLAS_TRN)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_muscle_groups')!.n).toBe(12)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_kind_rules')!.n).toBe(13)
    const ahora = volcadoNoEntreno(db)
    // La restauración apunta una fila en audit_log; lo demás de finanzas es la copia tal cual.
    expect({ ...ahora, audit_log: ahora.audit_log.slice(0, finanzasCopia.audit_log.length) }).toEqual(finanzasCopia)
    expect(AppState.for(app.ctx).snap().accounts.map((a) => a.name)).toEqual(['Corriente'])
    // Los ajustes que faltan (la semilla no corre al restaurar) salen por defecto.
    expect(app.h['entreno:settings.get']()).toEqual(DEFAULT_SETTINGS)
    expect(app.h['entreno:muscleGroups.list']()).toHaveLength(12)
    db.close()
  })
})

describe('restricciones en SQL', () => {
  const now = '2026-11-23T10:00:00.000Z'
  const insertarSesion = (db: Db, campos: Record<string, string | number | null>) => {
    const base: Record<string, string | number | null> = {
      title: 'Torso',
      start_time: '2026-11-05T07:05',
      source: 'MANUAL',
      hevy_key: null,
      created_at: now,
      updated_at: now,
      ...campos
    }
    const cols = Object.keys(base)
    db.run(`INSERT INTO trn_workouts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(base))
  }

  it('fechas, origen, hevy_key, tipos de sesión y esfuerzo', async () => {
    const { ctx, db } = await entrenoApp()
    const falla = (campos: Record<string, string | number | null>) =>
      expect(() => escribir(ctx, () => insertarSesion(db, campos))).toThrow(/constraint/i)
    falla({ start_time: '5 Nov 2026, 07:05' })
    falla({ start_time: '2026-11-05 07:05' })
    falla({ end_time: '2026-11-05T06:00' })
    falla({ source: 'HEVY' })
    falla({ hevy_key: 'Torso|2026-11-05T07:05' })
    falla({ kind: 'YOGA' })
    falla({ perceived_effort: 11 })
    falla({ perceived_effort: 5.5 })
    escribir(ctx, () => insertarSesion(db, { source: 'HEVY', hevy_key: 'Torso|2026-11-05T07:05' }))
    falla({ source: 'HEVY', hevy_key: 'Torso|2026-11-05T07:05' })
  })

  it('series: tipos, enteros, únicas por (sesión, ejercicio, serie) y borradas con su sesión', async () => {
    const { ctx, db } = await entrenoApp()
    escribir(ctx, () => {
      insertarSesion(db, {})
      db.run("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('Press', ?, ?)", [now, now])
    })
    const serie = (extra: string) =>
      escribir(ctx, () =>
        db.run(
          `INSERT INTO trn_sets (workout_id, exercise_title, set_index, exercise_id, exercise_order ${extra ? ', ' + extra.split('=')[0] : ''})
           VALUES (1, 'Press', 0, 1, 0 ${extra ? ', ' + extra.split('=')[1] : ''})`
        )
      )
    expect(() => serie("set_type='calentamiento'")).toThrow(/constraint/i)
    expect(() => serie('reps=8.5')).toThrow(/constraint/i)
    expect(() => serie('duration_seconds=-1')).toThrow(/constraint/i)
    expect(() => serie("weight_kg='mucho'")).toThrow(/constraint/i)
    expect(() => serie('rpe=11')).toThrow(/constraint/i)
    serie('weight_kg=62.5')
    expect(() => serie('reps=5')).toThrow(/UNIQUE/)
    expect(db.get<{ w: number }>('SELECT weight_kg AS w FROM trn_sets')!.w).toBe(62.5)
    escribir(ctx, () => db.run('DELETE FROM trn_workouts WHERE id = 1'))
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_sets')!.n).toBe(0)
  })

  it('catálogo: nombres únicos sin distinguir mayúsculas y un solo grupo principal por ejercicio', async () => {
    const { ctx, db } = await entrenoApp()
    expect(() => escribir(ctx, () => db.run("INSERT INTO trn_muscle_groups (name) VALUES ('pecho')"))).toThrow(/UNIQUE/)
    escribir(ctx, () => db.run("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('Press', ?, ?)", [now, now]))
    expect(() =>
      escribir(ctx, () => db.run("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('PRESS', ?, ?)", [now, now]))
    ).toThrow(/UNIQUE/)
    escribir(ctx, () => db.run("INSERT INTO trn_exercise_muscles VALUES (1, 1, 'primary')"))
    expect(() => escribir(ctx, () => db.run("INSERT INTO trn_exercise_muscles VALUES (1, 2, 'primary')"))).toThrow(/UNIQUE/)
    expect(() => escribir(ctx, () => db.run("INSERT INTO trn_exercise_muscles VALUES (1, 999, 'secondary')"))).toThrow(/FOREIGN KEY/)
    expect(() => escribir(ctx, () => db.run('DELETE FROM trn_muscle_groups WHERE id = 1'))).toThrow(/FOREIGN KEY/)
  })

  it('bloques y objetivos: fechas, por defecto 4 gimnasio + 2 natación y referencias', async () => {
    const { ctx, db } = await entrenoApp()
    escribir(ctx, () =>
      db.run("INSERT INTO trn_blocks (name, start_date, created_at, updated_at) VALUES ('Base', '2026-11-02', ?, ?)", [now, now])
    )
    expect(db.get('SELECT planned_gym, planned_swim, planned_hyrox FROM trn_blocks')).toEqual({ planned_gym: 4, planned_swim: 2, planned_hyrox: 0 })
    expect(() =>
      escribir(ctx, () =>
        db.run("INSERT INTO trn_blocks (name, start_date, end_date, created_at, updated_at) VALUES ('X', '2026-11-02', '2026-11-01', ?, ?)", [now, now])
      )
    ).toThrow(/constraint/i)
    expect(() =>
      escribir(ctx, () => db.run("INSERT INTO trn_goals (name, type, created_at, updated_at) VALUES ('Banca 100', 'E1RM', ?, ?)", [now, now]))
    ).toThrow(/constraint/i)
    // Borrar un bloque deja las sesiones sin bloque.
    escribir(ctx, () => insertarSesion(db, { block_id: 1 }))
    escribir(ctx, () => db.run('DELETE FROM trn_blocks WHERE id = 1'))
    expect(db.get('SELECT block_id FROM trn_workouts')).toEqual({ block_id: null })
  })
})
