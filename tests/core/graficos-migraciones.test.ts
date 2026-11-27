// Migraciones 1001–1002 (core_charts y core_dashboards): sobre una base de F4 con datos (al abrirla,
// con su copia `antes-de-migrar`) y al restaurar una copia de antes de F5; restricciones en SQL.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreBackup } from '../../src/main/core/backup'
import { CORE_MIGRATIONS } from '../../src/main/core/coreMigrations'
import { Db } from '../../src/main/core/db'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { createRegistry } from '../../src/main/core/registry'
import { APP_MODULES } from '../../src/main/app'
import { entrenoApp, escribir } from '../entreno/helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-f5-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const now = '2026-11-20T10:00:00.000Z'
const tablas = (db: Db) => db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name)
const versiones = (db: Db) => db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version').map((r) => r.version)

/** Contenido de todas las tablas salvo schema_migrations y las core_ nuevas. */
function volcado(db: Db): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const t of tablas(db)) if (t !== 'schema_migrations' && !t.startsWith('core_')) out[t] = db.all(`SELECT * FROM "${t}" ORDER BY rowid`)
  return out
}

/** Base tal como la dejaba F4 (registro de la app sin migraciones del núcleo, con semillas), con datos. */
async function baseF4(file: string): Promise<void> {
  const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: null }, createRegistry(APP_MODULES))
  initCore(ctx)
  const db = ctx.db
  escribir(ctx, () => {
    db.run("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('Press ficticio', ?, ?)", [now, now])
    db.run(
      `INSERT INTO trn_workouts (title, start_time, end_time, kind, source, hevy_key, created_at, updated_at)
       VALUES ('Fuerza', '2026-11-05T07:05', '2026-11-05T08:00', 'GYM', 'HEVY', 'Fuerza|2026-11-05T07:05', ?, ?)`,
      [now, now]
    )
    db.run(
      `INSERT INTO trn_sets (workout_id, exercise_title, set_index, set_type, weight_kg, reps, exercise_id, exercise_order)
       VALUES (1, 'Press ficticio', 0, 'normal', 80, 5, 1, 0)`
    )
  })
  expect(versiones(db).filter((v) => v >= 1000 && v < 2000)).toEqual([])
  db.close()
}

/** Tablas del núcleo tras todas sus migraciones (1001–1004). */
const CORE_TABLES = ['core_ai_messages', 'core_ai_threads', 'core_charts', 'core_dashboards', 'core_settings']

describe('migraciones del núcleo 1001–1002', () => {
  it('son solo CREATE de tablas (e índices) core_, en el rango del núcleo', () => {
    expect(CORE_MIGRATIONS.map((m) => m.version)).toEqual([1001, 1002, 1003, 1004])
    for (const m of CORE_MIGRATIONS) {
      expect(m.up).toMatch(/^CREATE TABLE core_\w+ \(/)
      // `ON DELETE CASCADE` de las claves ajenas no es una sentencia DELETE.
      expect(m.up.replace(/\bON DELETE CASCADE\b/g, '')).not.toMatch(/\b(DROP|ALTER|INSERT|UPDATE|DELETE|PRAGMA)\b/i)
      for (const s of m.up.matchAll(/CREATE\s+(?:TABLE|INDEX)\s+(\w+)/gi)) expect(s[1]).toMatch(/^core_/)
      expect(m.data).toBeUndefined()
    }
  })

  it('sobre una base de F4: copia antes de migrar, crea core_charts y core_dashboards y no toca nada más', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    await baseF4(file)
    const vieja = await Db.open(file)
    const antes = volcado(vieja)
    expect(tablas(vieja).some((t) => t.startsWith('core_'))).toBe(false)
    vieja.close()

    const { db } = await entrenoApp({ dbPath: file, backupsDir: backups })
    const copias = fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))
    expect(copias).toHaveLength(1)
    expect(tablas(db).filter((t) => t.startsWith('core_'))).toEqual(CORE_TABLES)
    expect(versiones(db)).toEqual(expect.arrayContaining([1001, 1002, 2006]))
    expect(volcado(db)).toEqual(antes)
    // La copia es la base de antes, sin las tablas nuevas.
    const copia = await Db.open(path.join(backups, copias[0]))
    expect(tablas(copia).some((t) => t.startsWith('core_'))).toBe(false)
    copia.close()
    db.close()

    // Volver a abrirla no migra ni copia nada.
    const again = await entrenoApp({ dbPath: file, backupsDir: backups })
    expect(fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))).toHaveLength(1)
    expect(again.db.hasPendingSave).toBe(false)
    again.db.close()
  })

  it('restaurar una copia de antes de F5 la deja al día', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'f4.sqlite')
    await baseF4(file)
    const app = await entrenoApp({ dbPath: path.join(dir, 'actual.sqlite'), backupsDir: path.join(dir, 'backups') })
    await app.h['core:dashboards.save']('inicio', [{ id: 'fixed:x', type: 'fixed', ref: 'x', size: 'm', hidden: false }])
    await restoreBackup(app.ctx, file)
    const db = app.ctx.db
    expect(tablas(db).filter((t) => t.startsWith('core_'))).toEqual(CORE_TABLES)
    expect(versiones(db)).toEqual(expect.arrayContaining([1001, 1002]))
    // La copia no tenía paneles: el panel vuelve al diseño por defecto.
    expect(app.h['core:dashboards.get']('inicio')).toEqual({ dashboardId: 'inicio', cards: [], saved: false })
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_workouts')!.n).toBe(1)
    db.close()
  })

  it('restricciones: JSON válido, panel conocido, título no vacío', async () => {
    const { ctx, db } = await entrenoApp()
    const falla = (sql: string, args: unknown[] = []) => expect(() => escribir(ctx, () => db.run(sql, args as never))).toThrow()
    falla("INSERT INTO core_charts (title, module, spec, created_at, updated_at) VALUES ('T', 'entreno', 'no es json', ?, ?)", [now, now])
    falla("INSERT INTO core_charts (title, module, spec, created_at, updated_at) VALUES ('  ', 'entreno', '{}', ?, ?)", [now, now])
    falla("INSERT INTO core_dashboards (dashboard_id, cards, updated_at) VALUES ('otro', '[]', ?)", [now])
    falla("INSERT INTO core_dashboards (dashboard_id, cards, updated_at) VALUES ('inicio', '{}', ?)", [now])
    falla("INSERT INTO core_dashboards (dashboard_id, cards, updated_at) VALUES ('inicio', 'x', ?)", [now])
    escribir(ctx, () => db.run("INSERT INTO core_dashboards (dashboard_id, cards, updated_at) VALUES ('inicio', '[]', ?)", [now]))
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_dashboards')!.n).toBe(1)
  })
})
