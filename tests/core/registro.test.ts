// Registro de módulos, ejecutor de migraciones por rangos, contexto del núcleo y copias del núcleo.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { APP_MODULES, createAppHandlers, createAppRegistry } from '../../src/main/app'
import { createBackup, restoreBackup, validateSqlite } from '../../src/main/core/backup'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { UserError } from '../../src/main/core/errors'
import type { DialogProvider } from '../../src/main/core/handlers'
import { MIGRATION_RANGES, migrate, schemaVersion, type Migration } from '../../src/main/core/migrations'
import { createRegistry, defineModule, mergeHandlers, type AppModule } from '../../src/main/core/registry'
import { exportJsonObject } from '../../src/main/modules/finanzas/exports'
import { finanzasModule } from '../../src/main/modules/finanzas'
import { MIGRATIONS } from '../../src/main/modules/finanzas/migrations'
import { AppState } from '../../src/main/modules/finanzas/state'
import { account, escribirTarea, memoryApp, tx } from '../helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-registro-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const noDialogs: DialogProvider = {
  openFile: async () => null,
  saveFile: async () => null,
  openDir: async () => null,
  showItem: () => undefined,
  openPath: () => undefined
}

/** Módulo de prueba con una migración en el rango de entreno. */
function moduloPrueba(migrations: Migration[], extra: Partial<AppModule> = {}): AppModule {
  return defineModule({
    id: 'entreno',
    name: 'Prueba',
    migrations,
    ipc: () => ({ 'prueba.ping': () => 'pong' }),
    metrics: [],
    aiTools: [],
    ...extra
  })
}

const tablas = (db: Db) => db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name)

describe('migraciones', () => {
  it('base vacía: aplica todas, en orden de versión, y la segunda vez ninguna', async () => {
    const db = await Db.open(null)
    const desordenadas: Migration[] = [
      { version: 2, name: 'b', up: 'CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));' },
      { version: 1, name: 'a', up: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' }
    ]
    expect(migrate(db, desordenadas)).toBe(2)
    expect(db.all('SELECT version, name FROM schema_migrations ORDER BY rowid')).toEqual([
      { version: 1, name: 'a' },
      { version: 2, name: 'b' }
    ])
    expect(migrate(db, desordenadas)).toBe(0)
    expect(schemaVersion(db)).toBe(2)
  })

  it('una migración que falla no deja nada a medias', async () => {
    const db = await Db.open(null)
    const malas: Migration[] = [
      { version: 1, name: 'buena', up: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' },
      { version: 2, name: 'mala', up: 'CREATE TABLE c (id INTEGER PRIMARY KEY); ESTO NO ES SQL;' }
    ]
    expect(() => migrate(db, malas)).toThrow()
    expect(tablas(db)).toEqual(['a', 'schema_migrations'])
    expect(schemaVersion(db)).toBe(1)
  })

  it('schemaVersion por rango: la de cada dueño; sin rango, la más alta', async () => {
    const db = await Db.open(null)
    migrate(db, [
      { version: 1, name: 'f', up: 'CREATE TABLE f (id INTEGER PRIMARY KEY);' },
      { version: 2000, name: 'e', up: 'CREATE TABLE trn_e (id INTEGER PRIMARY KEY);' }
    ])
    expect(schemaVersion(db, MIGRATION_RANGES.finanzas)).toBe(1)
    expect(schemaVersion(db, MIGRATION_RANGES.entreno)).toBe(2000)
    expect(schemaVersion(db, MIGRATION_RANGES.core)).toBe(0)
    expect(schemaVersion(db)).toBe(2000)
  })

  it('base vacía con el registro de la app: esquema de finanzas, semilla y versión 1', async () => {
    const s = await memoryApp()
    expect(schemaVersion(s.db)).toBe(1)
    expect(schemaVersion(s.db, MIGRATION_RANGES.finanzas)).toBe(1)
    expect(tablas(s.db)).toEqual(expect.arrayContaining(['accounts', 'transactions', 'categories', 'audit_log', 'schema_migrations']))
    expect(s.snap().categories.length).toBeGreaterThan(0)
    expect(exportJsonObject(s).schemaVersion).toBe(1)
  })

  it('base con datos de la versión anterior: no se vuelve a migrar ni a sembrar y los datos siguen', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const s1 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: null })
    const a = account(s1, { name: 'Corriente', openingBalanceCents: 1000 })
    tx(s1, { accountId: a.id, amountCents: -250 })
    const categorias = s1.snap().categories.length
    const aplicada = s1.db.get<{ applied_at: string }>('SELECT applied_at FROM schema_migrations WHERE version = 1')
    s1.db.close()

    const s2 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: null })
    expect(s2.db.all('SELECT version FROM schema_migrations')).toEqual([{ version: 1 }])
    expect(s2.db.get<{ applied_at: string }>('SELECT applied_at FROM schema_migrations WHERE version = 1')).toEqual(aplicada)
    expect(s2.snap().categories.length).toBe(categorias)
    expect(s2.snap().accounts.map((x) => x.id)).toEqual([a.id])
    expect(s2.snap().transactions.length).toBe(1)
    s2.db.close()
  })

  it('base con datos de la versión anterior + un módulo nuevo: solo se aplica su migración', async () => {
    const s1 = await memoryApp()
    const a = account(s1, { name: 'Corriente', openingBalanceCents: 1000 })
    const bytes = s1.db.exportBytes()

    const db = await Db.openReadOnlyBuffer(bytes)
    const registro = createRegistry([finanzasModule, moduloPrueba([{ version: 2000, name: 'prueba', up: 'CREATE TABLE trn_prueba (id INTEGER PRIMARY KEY);' }])])
    const ctx = createCoreContext(db, { dbPath: null, backupsDir: null }, registro)
    initCore(ctx)
    expect(db.all('SELECT version FROM schema_migrations ORDER BY version')).toEqual([{ version: 1 }, { version: 2000 }])
    expect(schemaVersion(db, MIGRATION_RANGES.finanzas)).toBe(1)
    expect(schemaVersion(db)).toBe(2000)
    expect(AppState.for(ctx).snap().accounts.map((x) => x.id)).toEqual([a.id])
    expect(exportJsonObject(AppState.for(ctx)).schemaVersion).toBe(1)
  })

  it('el SQL de finanzas sigue siendo una sola migración, la 1', () => {
    expect(MIGRATIONS.map((m) => [m.version, m.name])).toEqual([[1, 'esquema inicial']])
  })
})

describe('registro de módulos', () => {
  it('el de la app tiene finanzas y exige las mismas tablas que antes', () => {
    const r = createAppRegistry()
    expect(r.modules.map((m) => m.id)).toEqual(['finanzas'])
    expect(APP_MODULES.map((m) => m.name)).toEqual(['Finanzas'])
    expect(r.requiredTables).toEqual(['schema_migrations', 'accounts', 'transactions', 'categories'])
    expect(r.migrations.map((m) => m.version)).toEqual([1])
  })

  it('rechaza ids repetidos', () => {
    expect(() => createRegistry([finanzasModule, finanzasModule])).toThrow(/dos veces/)
  })

  it('rechaza migraciones fuera del rango de su módulo', () => {
    expect(() => createRegistry([moduloPrueba([{ version: 5, name: 'x', up: '' }])])).toThrow(/fuera de su rango/)
    expect(() => createRegistry([moduloPrueba([{ version: 3000, name: 'x', up: '' }])])).toThrow(/fuera de su rango/)
    expect(() => createRegistry([], [{ version: 1, name: 'x', up: '' }])).toThrow(/fuera de su rango/)
    expect(() => createRegistry([moduloPrueba([{ version: 2000.5, name: 'x', up: '' }])])).toThrow(/entero/)
  })

  it('rechaza versiones repetidas', () => {
    expect(() =>
      createRegistry([
        moduloPrueba([
          { version: 2001, name: 'x', up: '' },
          { version: 2001, name: 'y', up: '' }
        ])
      ])
    ).toThrow(/repetida/)
  })

  it('rechaza nombres de handler repetidos entre núcleo y módulos', () => {
    expect(() =>
      mergeHandlers([
        { owner: 'core', handlers: { 'app.info': () => 1 } },
        { owner: 'entreno', handlers: { 'app.info': () => 2 } }
      ])
    ).toThrow(/repetido/)
  })

  it('los handlers de la app no chocan y usan el mismo AppState', async () => {
    const s = await memoryApp('2026-10-11')
    const h = createAppHandlers(s.core, noDialogs, '9.9.9')
    expect(AppState.for(s.core)).toBe(s)
    const info = h['app.info']()
    expect(info).toMatchObject({ version: '9.9.9', today: '2026-10-11', isEmpty: true, schemaVersion: 1, dbPath: null, backupsDir: null })
    account(s, { name: 'Corriente' })
    expect(h['app.info']().isEmpty).toBe(false)
    expect(h['accounts.list']().length).toBe(1)
  })
})

describe('contexto y copias del núcleo', () => {
  it('replaceDb avisa a todos los oyentes y deja de escuchar la base vieja', async () => {
    const db1 = await Db.open(null)
    const ctx = createCoreContext(db1, { dbPath: null, backupsDir: null }, createRegistry([]))
    initCore(ctx)
    let a = 0
    let b = 0
    ctx.onChange(() => a++)
    const baja = ctx.onChange(() => b++)
    db1.exec('CREATE TABLE x (id INTEGER PRIMARY KEY)')
    expect([a, b]).toEqual([1, 1])
    baja()
    const db2 = await Db.open(null)
    ctx.replaceDb(db2)
    expect([a, b]).toEqual([2, 1])
    expect(ctx.db).toBe(db2)
    expect(db1.onChange).toBeNull()
    db2.exec('CREATE TABLE y (id INTEGER PRIMARY KEY)')
    expect(a).toBe(3)
  })

  it('valida las copias con las tablas exigidas por el registro', async () => {
    const s = await memoryApp()
    await expect(validateSqlite(s.db.exportBytes(), s.core.registry.requiredTables)).resolves.toBeUndefined()
    const vacia = await Db.open(null)
    vacia.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY)')
    await expect(validateSqlite(vacia.exportBytes(), s.core.registry.requiredTables)).rejects.toThrow('El archivo no es una copia de seguridad de esta app.')
    await expect(validateSqlite(new Uint8Array([1, 2, 3]), s.core.registry.requiredTables)).rejects.toBeInstanceOf(UserError)
  })

  it('restaura una exportación JSON de finanzas desde el núcleo y rechaza una ajena sin tocar nada', async () => {
    const dir = tmpDir()
    const s = await memoryApp()
    const a = account(s, { name: 'Corriente', openingBalanceCents: 5000 })
    tx(s, { accountId: a.id, amountCents: -100 })
    const json = path.join(dir, 'export.json')
    fs.writeFileSync(json, JSON.stringify(exportJsonObject(s)))
    tx(s, { accountId: a.id, amountCents: -999 })
    expect(s.ctx().transactions.length).toBe(2)

    const ajeno = path.join(dir, 'ajeno.json')
    fs.writeFileSync(ajeno, JSON.stringify({ app: 'otra-app', tables: {} }))
    await expect(restoreBackup(s, ajeno)).rejects.toThrow('El JSON no es una exportación de esta app.')
    fs.writeFileSync(ajeno, 'null')
    await expect(restoreBackup(s, ajeno)).rejects.toThrow('El JSON no es una exportación de esta app.')
    expect(s.ctx().transactions.length).toBe(2)

    await escribirTarea(s, () => restoreBackup(s.core, json))
    expect(s.ctx().transactions.length).toBe(1)
    expect(s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'backup' AND entity_id = 'json'")?.n).toBe(1)
  })

  it('createBackup acepta el contexto y el AppState', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: path.join(dir, 'backups') })
    const b1 = createBackup(s, 'manual')
    const b2 = createBackup(s.core, 'antes-de-importar')
    expect(fs.existsSync(b1.path) && fs.existsSync(b2.path)).toBe(true)
    expect(b2.name).toMatch(/^finanzas-\d{8}-\d{6}-antes-de-importar\.sqlite$/)
    s.db.close()
  })
})
