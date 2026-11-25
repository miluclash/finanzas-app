// Migración 2006 (F4): sobre una base de F3 con datos (al abrirla y al restaurarla como copia), sobre
// una copia de antes de F3 (solo finanzas) y restricciones nuevas en SQL. Datos inventados.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreBackup } from '../../src/main/core/backup'
import { Db } from '../../src/main/core/db'
import { migrate } from '../../src/main/core/migrations'
import { WriteQueue } from '../../src/main/core/writeQueue'
import { MIGRATIONS as FIN_MIGRATIONS } from '../../src/main/modules/finanzas/migrations'
import { MIGRATIONS } from '../../src/main/modules/entreno/migrations'
import { AppState } from '../../src/main/modules/finanzas/state'
import { account, tx } from '../helpers'
import { entrenoApp, escribir } from './helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-2006-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const now = '2026-11-20T10:00:00.000Z'
const n = (db: Db, sql: string) => db.get<{ n: number }>(sql)!.n
const cols = (db: Db, t: string) => db.all<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name)
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

const EJERCICIOS_F3 = ['Ski Erg', 'Rowing Machine', 'Wall Ball', 'Farmers Walk', 'Farmers Walk(static)', 'Burpee', 'Press banca ficticio', 'Sled Push']

/** Base tal como la dejaba F3 (migraciones hasta la 2005) con datos de entreno, guardada en `file`. */
async function baseF3(file: string): Promise<void> {
  const db = await Db.open(file)
  const q = new WriteQueue(() => db)
  migrate(db, [...FIN_MIGRATIONS, ...MIGRATIONS.filter((m) => m.version <= 2005)], (l, fn) => q.runNow(l, fn))
  q.runNow('test:datos-f3', () => {
    EJERCICIOS_F3.forEach((t) => db.run('INSERT INTO trn_exercises (title, created_at, updated_at) VALUES (?, ?, ?)', [t, now, now]))
    db.run("INSERT INTO trn_exercise_muscles VALUES (7, 1, 'primary')")
    db.run("INSERT INTO trn_exercise_aliases (alias, exercise_id) VALUES ('Bench ficticio', 7)")
    db.run("INSERT INTO trn_events (name, date, created_at, updated_at) VALUES ('HYROX ficticio', '2027-03-20', ?, ?)", [now, now])
    db.run("INSERT INTO trn_blocks (name, start_date, end_date, created_at, updated_at) VALUES ('Base', '2026-11-02', '2026-11-29', ?, ?)", [now, now])
    db.run("INSERT INTO trn_routines (name, kind, created_at, updated_at) VALUES ('Fuerza A', 'GYM', ?, ?)", [now, now])
    db.run("INSERT INTO trn_routine_items (routine_id, exercise_id, item_order, target_sets) VALUES (1, 7, 0, 3)")
    db.run("INSERT INTO trn_goals (name, type, target_value, exercise_id, created_at, updated_at) VALUES ('Banca 100', 'E1RM', 100, 7, ?, ?)", [now, now])
    db.run("INSERT INTO trn_goals (name, type, event_id, created_at, updated_at) VALUES ('HYROX', 'EVENT', 1, ?, ?)", [now, now])
    db.run(
      `INSERT INTO trn_workouts (title, start_time, end_time, kind, block_id, routine_id, source, hevy_key, created_at, updated_at)
       VALUES ('Fuerza A', '2026-11-05T07:05', '2026-11-05T08:00', 'GYM', 1, 1, 'HEVY', 'Fuerza A|2026-11-05T07:05', ?, ?)`,
      [now, now]
    )
    db.run(
      `INSERT INTO trn_sets (workout_id, exercise_title, set_index, set_type, weight_kg, reps, exercise_id, exercise_order)
       VALUES (1, 'Press banca ficticio', 0, 'normal', 80, 5, 7, 0), (1, 'Ski Erg', 0, 'normal', NULL, NULL, 1, 1)`
    )
    db.run(`INSERT INTO trn_settings (key, value) VALUES ('trendWeeks', '8')`)
  })
  db.close()
}

/** Contenido de las tablas de F3 (sin las columnas nuevas de la 2006). */
function volcadoF3(db: Db): Record<string, unknown[]> {
  const nuevas = new Set(['event_id:trn_blocks', 'is_deload:trn_blocks', 'weekly_sets_min:trn_muscle_groups', 'weekly_sets_max:trn_muscle_groups', 'hyrox_station:trn_exercises', 'kind:trn_goals'])
  const out: Record<string, unknown[]> = {}
  for (const t of ['trn_exercises', 'trn_exercise_muscles', 'trn_exercise_aliases', 'trn_events', 'trn_blocks', 'trn_routines', 'trn_routine_items', 'trn_goals', 'trn_workouts', 'trn_sets', 'trn_muscle_groups', 'trn_kind_rules']) {
    const c = cols(db, t).filter((x) => !nuevas.has(`${x}:${t}`))
    out[t] = db.all(`SELECT ${c.join(', ')} FROM ${t} ORDER BY rowid`)
  }
  return out
}

function compruebaColumnasNuevas(db: Db): void {
  expect(cols(db, 'trn_blocks')).toEqual(expect.arrayContaining(['event_id', 'is_deload']))
  expect(cols(db, 'trn_muscle_groups')).toEqual(expect.arrayContaining(['weekly_sets_min', 'weekly_sets_max']))
  expect(cols(db, 'trn_exercises')).toContain('hyrox_station')
  expect(cols(db, 'trn_goals')).toContain('kind')
  for (const t of ['trn_routine_aliases', 'trn_base_week', 'trn_base_week_meta', 'trn_week_plan_weeks', 'trn_week_plan'])
    expect(db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", [t])).toBeTruthy()
  expect(db.all('PRAGMA foreign_key_check')).toEqual([])
  expect(db.get<{ integrity_check: string }>('PRAGMA integrity_check')!.integrity_check).toBe('ok')
}

const estaciones = (db: Db) =>
  Object.fromEntries(db.all<{ title: string; hyrox_station: string | null }>('SELECT title, hyrox_station FROM trn_exercises ORDER BY id').map((r) => [r.title, r.hyrox_station]))

const ESTACIONES_ESPERADAS = {
  'Ski Erg': 'SkiErg',
  'Rowing Machine': 'Rowing',
  'Wall Ball': 'Wall Balls',
  'Farmers Walk': 'Farmers Carry',
  'Farmers Walk(static)': null,
  Burpee: null,
  'Press banca ficticio': null,
  'Sled Push': 'Sled Push'
}

describe('migración 2006 sobre una base de F3 con datos', () => {
  it('copia antes de migrar, añade columnas con sus valores por defecto, propone estaciones y no toca lo demás', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    await baseF3(file)
    const vieja = await Db.open(file)
    const antes = volcadoF3(vieja)
    expect(vieja.get<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations')!.v).toBe(2005)
    vieja.close()

    const { db } = await entrenoApp({ dbPath: file, backupsDir: backups })
    expect(fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))).toHaveLength(1)
    expect(db.get<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations')!.v).toBe(2006)
    compruebaColumnasNuevas(db)
    expect(volcadoF3(db)).toEqual(antes)
    expect(estaciones(db)).toEqual(ESTACIONES_ESPERADAS)
    expect(db.all('SELECT DISTINCT weekly_sets_min AS mn, weekly_sets_max AS mx FROM trn_muscle_groups')).toEqual([{ mn: 10, mx: 20 }])
    expect(db.all('SELECT event_id, is_deload FROM trn_blocks')).toEqual([{ event_id: null, is_deload: 0 }])
    expect(db.all('SELECT kind FROM trn_goals')).toEqual([{ kind: null }, { kind: null }])
    for (const t of ['trn_routine_aliases', 'trn_base_week', 'trn_base_week_meta', 'trn_week_plan_weeks', 'trn_week_plan'])
      expect(n(db, `SELECT COUNT(*) AS n FROM ${t}`)).toBe(0)
    db.close()

    // Volver a abrir no migra, no propone otra vez y no escribe el archivo.
    const huella = sha(file)
    const otra = await entrenoApp({ dbPath: file, backupsDir: backups })
    expect(estaciones(otra.db)).toEqual(ESTACIONES_ESPERADAS)
    otra.db.close()
    expect(sha(file)).toBe(huella)
    expect(fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))).toHaveLength(1)
  })

  it('la propuesta solo se aplica una vez: una estación quitada a mano no vuelve', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    await baseF3(file)
    const a = await entrenoApp({ dbPath: file, backupsDir: null })
    const ski = a.h['entreno:exercises.list']().find((e) => e.title === 'Ski Erg')!
    await a.h['entreno:exercises.save']({ ...ski, hyroxStation: null })
    a.db.close()
    const b = await entrenoApp({ dbPath: file, backupsDir: null })
    expect(estaciones(b.db)['Ski Erg']).toBeNull()
    b.db.close()
  })

  it('restaurar una copia .sqlite de F3 la migra igual (con la propuesta de estaciones)', async () => {
    const dir = tmpDir()
    const copia = path.join(dir, 'copia-f3.sqlite')
    await baseF3(copia)
    const app = await entrenoApp({ dbPath: path.join(dir, 'finanzas.sqlite'), backupsDir: path.join(dir, 'backups') })
    await restoreBackup(app.ctx, copia)
    const db = app.ctx.db
    compruebaColumnasNuevas(db)
    expect(estaciones(db)).toEqual(ESTACIONES_ESPERADAS)
    expect(app.h['entreno:muscleGroups.list']()[0]).toMatchObject({ weeklySetsMin: 10, weeklySetsMax: 20 })
    expect(app.h['entreno:blocks.list']()).toMatchObject([{ name: 'Base', eventId: null, isDeload: false, workoutCount: 1 }])
    db.close()
  })
})

describe('migración 2006 sobre una copia de antes de F3 (solo finanzas)', () => {
  it('crea todo lo de entreno, incluida la 2006, sin tocar finanzas', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: null })
    s.todayOverride = '2026-10-11'
    const cuenta = account(s, { name: 'Corriente' })
    tx(s, { accountId: cuenta.id, amountCents: 250000, description: 'Nómina' })
    s.db.close()

    const { ctx, db } = await entrenoApp({ dbPath: file, backupsDir: path.join(dir, 'backups') })
    compruebaColumnasNuevas(db)
    expect(db.all('SELECT version FROM schema_migrations WHERE version >= 2000 ORDER BY version').map((r) => (r as { version: number }).version)).toEqual([
      2001, 2002, 2003, 2004, 2005, 2006
    ])
    expect(AppState.for(ctx).snap().transactions).toHaveLength(1)
    expect(n(db, 'SELECT COUNT(*) AS n FROM trn_exercises')).toBe(0)
    db.close()
  })
})

describe('restricciones nuevas en SQL', () => {
  it('rangos de series, estación, tipo de objetivo, horas, días y semanas que empiezan en lunes', async () => {
    const { ctx, db } = await entrenoApp()
    const falla = (sql: string, params: (string | number | null)[] = []) =>
      expect(() => escribir(ctx, () => db.run(sql, params)), sql).toThrow(/constraint/i)
    const vale = (sql: string, params: (string | number | null)[] = []) => escribir(ctx, () => db.run(sql, params))

    falla('UPDATE trn_muscle_groups SET weekly_sets_max = 5 WHERE id = 1')
    falla('UPDATE trn_muscle_groups SET weekly_sets_min = -1 WHERE id = 1')
    falla('UPDATE trn_muscle_groups SET weekly_sets_min = 2.5 WHERE id = 1')
    vale('UPDATE trn_muscle_groups SET weekly_sets_min = 12, weekly_sets_max = 12 WHERE id = 1')

    vale("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('X', ?, ?)", [now, now])
    falla("UPDATE trn_exercises SET hyrox_station = 'Ski Erg' WHERE id = 1")
    vale("UPDATE trn_exercises SET hyrox_station = 'SkiErg' WHERE id = 1")
    falla("INSERT INTO trn_goals (name, type, kind, created_at, updated_at) VALUES ('F', 'FREQUENCY', 'YOGA', ?, ?)", [now, now])
    vale("INSERT INTO trn_goals (name, type, kind, created_at, updated_at) VALUES ('F', 'FREQUENCY', 'SWIM', ?, ?)", [now, now])
    vale("INSERT INTO trn_blocks (name, start_date, created_at, updated_at) VALUES ('B', '2026-11-02', ?, ?)", [now, now])
    falla('UPDATE trn_blocks SET is_deload = 2')
    falla('UPDATE trn_blocks SET event_id = 99')

    vale("INSERT INTO trn_routines (name, created_at, updated_at) VALUES ('Fuerza A', ?, ?)", [now, now])
    falla("INSERT INTO trn_routine_aliases (alias, routine_id) VALUES ('  ', 1)")
    vale("INSERT INTO trn_routine_aliases (alias, routine_id) VALUES ('Upper', 1)")
    falla("INSERT INTO trn_routine_aliases (alias, routine_id) VALUES ('UPPER', 1)")

    falla('INSERT INTO trn_base_week (weekday, slot_order, routine_id) VALUES (8, 0, 1)')
    falla('INSERT INTO trn_base_week (weekday, slot_order, routine_id) VALUES (0, 0, 1)')
    falla("INSERT INTO trn_base_week (weekday, slot_order, routine_id, time) VALUES (1, 0, 1, '7:00')")
    falla('INSERT INTO trn_base_week (weekday, slot_order, routine_id) VALUES (1, 0, 99)')
    vale("INSERT INTO trn_base_week (weekday, slot_order, routine_id, time) VALUES (1, 0, 1, '07:00')")
    falla('INSERT INTO trn_base_week (weekday, slot_order, routine_id) VALUES (1, 0, 1)')

    falla("INSERT INTO trn_week_plan_weeks (week_start, saved_at) VALUES ('2026-11-25', ?)", [now])
    falla("INSERT INTO trn_week_plan_weeks (week_start, saved_at) VALUES ('2026-02-30', ?)", [now])
    falla("INSERT INTO trn_week_plan_weeks (week_start, origin, saved_at) VALUES ('2026-11-23', 'OTRA', ?)", [now])
    vale("INSERT INTO trn_week_plan_weeks (week_start, saved_at) VALUES ('2026-11-23', ?)", [now])
    falla("INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id) VALUES ('2026-11-23', '2026-11-30', 0, 1)")
    falla("INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id) VALUES ('2026-11-23', '2026-11-22', 0, 1)")
    falla("INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id) VALUES ('2026-11-30', '2026-11-30', 0, 1)")
    vale("INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id, time) VALUES ('2026-11-23', '2026-11-29', 0, 1, '18:30')")
    falla("INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id) VALUES ('2026-11-23', '2026-11-29', 0, 1)")
    falla("INSERT INTO trn_base_week_meta (id, first_saved_on, updated_at) VALUES (2, '2026-11-23', ?)", [now])

    // Borrar el tipo de entreno se lleva sus huecos y alias; borrar la semana, sus huecos.
    vale("INSERT INTO trn_week_plan_weeks (week_start, saved_at) VALUES ('2026-11-30', ?)", [now])
    vale("INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id) VALUES ('2026-11-30', '2026-12-01', 0, 1)")
    vale("DELETE FROM trn_week_plan_weeks WHERE week_start = '2026-11-30'")
    expect(n(db, 'SELECT COUNT(*) AS n FROM trn_week_plan')).toBe(1)
    vale('DELETE FROM trn_routines WHERE id = 1')
    expect(n(db, 'SELECT COUNT(*) AS n FROM trn_week_plan') + n(db, 'SELECT COUNT(*) AS n FROM trn_base_week') + n(db, 'SELECT COUNT(*) AS n FROM trn_routine_aliases')).toBe(0)
    expect(n(db, 'SELECT COUNT(*) AS n FROM trn_week_plan_weeks')).toBe(1)

    // Borrar un evento deja sus bloques sin evento.
    vale("INSERT INTO trn_events (name, date, created_at, updated_at) VALUES ('E', '2027-03-20', ?, ?)", [now, now])
    vale('UPDATE trn_blocks SET event_id = 1')
    vale('DELETE FROM trn_events WHERE id = 1')
    expect(db.all('SELECT event_id FROM trn_blocks')).toEqual([{ event_id: null }])
  })
})
