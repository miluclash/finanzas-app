// Registro de módulos, ejecutor de migraciones por rangos, contexto del núcleo y copias del núcleo.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_MODULES, createAppHandlers, createAppRegistry } from '../../src/main/app'
import { createBackup, restoreBackup, validateSqlite } from '../../src/main/core/backup'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { UserError } from '../../src/main/core/errors'
import type { DialogProvider } from '../../src/main/core/handlers'
import { MIGRATION_RANGES, migrate, pendingMigrations, schemaVersion, type Migration, type OpRunner } from '../../src/main/core/migrations'
import { createRegistry, defineModule, mergeHandlers, type AppModule } from '../../src/main/core/registry'
import { WriteQueue } from '../../src/main/core/writeQueue'
import { exportJsonObject } from '../../src/main/modules/finanzas/exports'
import { finanzasModule } from '../../src/main/modules/finanzas'
import { MIGRATIONS } from '../../src/main/modules/finanzas/migrations'
import { AppState } from '../../src/main/modules/finanzas/state'
import { account, memoryApp, tx } from '../helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-registro-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  vi.restoreAllMocks()
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

/** Ejecutor de migraciones por una cola propia de la base (como el arranque, con runNow). */
function porCola(db: Db): OpRunner {
  const q = new WriteQueue(() => db)
  return (label, fn) => q.runNow(label, fn)
}

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

const tablas = (db: Db) => db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name)

describe('migraciones', () => {
  it('base vacía: aplica todas, en orden de versión, y la segunda vez ninguna', async () => {
    const db = await Db.open(null)
    const desordenadas: Migration[] = [
      { version: 2, name: 'b', up: 'CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));' },
      { version: 1, name: 'a', up: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' }
    ]
    const run = porCola(db)
    expect(pendingMigrations(db, desordenadas).map((m) => m.version)).toEqual([1, 2])
    expect(migrate(db, desordenadas, run)).toBe(2)
    expect(db.all('SELECT version, name FROM schema_migrations ORDER BY rowid')).toEqual([
      { version: 1, name: 'a' },
      { version: 2, name: 'b' }
    ])
    expect(pendingMigrations(db, desordenadas)).toEqual([])
    expect(migrate(db, desordenadas, run)).toBe(0)
    expect(schemaVersion(db)).toBe(2)
  })

  it('una migración que falla no deja nada a medias', async () => {
    const db = await Db.open(null)
    const malas: Migration[] = [
      { version: 1, name: 'buena', up: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' },
      { version: 2, name: 'mala', up: 'CREATE TABLE c (id INTEGER PRIMARY KEY); ESTO NO ES SQL;' }
    ]
    expect(() => migrate(db, malas, porCola(db))).toThrow()
    expect(tablas(db)).toEqual(['a', 'schema_migrations'])
    expect(schemaVersion(db)).toBe(1)
  })

  it('schemaVersion por rango: la de cada dueño; sin rango, la más alta', async () => {
    const db = await Db.open(null)
    migrate(
      db,
      [
        { version: 1, name: 'f', up: 'CREATE TABLE f (id INTEGER PRIMARY KEY);' },
        { version: 2000, name: 'e', up: 'CREATE TABLE trn_e (id INTEGER PRIMARY KEY);' }
      ],
      porCola(db)
    )
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

  it('abrir una base que ya está al día no guarda nada (ni mtime ni contenido cambian)', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    const s1 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: backups })
    account(s1, { name: 'Corriente', openingBalanceCents: 1000 })
    s1.db.close()
    const antes = { sha: sha(file), mtime: fs.statSync(file).mtimeMs }
    await new Promise((r) => setTimeout(r, 30))
    const persist = vi.spyOn(Db.prototype, 'persist')
    const s2 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: backups })
    expect(persist).not.toHaveBeenCalled()
    expect(s2.core.queue.busy).toBe(false)
    expect({ sha: sha(file), mtime: fs.statSync(file).mtimeMs }).toEqual(antes)
    expect(fs.existsSync(backups) ? fs.readdirSync(backups) : []).toEqual([])
    s2.db.close()
  })

  it('base nueva: crea el archivo sin copia antes de migrar; la escritura queda en disco', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: backups })
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.existsSync(backups) ? fs.readdirSync(backups) : []).toEqual([])
    s.db.close()
    const r = await Db.open(file)
    expect(schemaVersion(r)).toBe(1)
    expect(r.get<{ n: number }>('SELECT COUNT(*) AS n FROM categories')!.n).toBeGreaterThan(0)
    r.close()
  })

  it('base con datos y migraciones pendientes: copia antes-de-migrar con el estado previo, y una sola', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    const s1 = AppState.init(await Db.open(file), { dbPath: file, backupsDir: backups })
    const a = account(s1, { name: 'Corriente', openingBalanceCents: 1000 })
    s1.db.close()

    const registro = createRegistry([
      finanzasModule,
      moduloPrueba([
        { version: 2000, name: 'prueba', up: 'CREATE TABLE trn_prueba (id INTEGER PRIMARY KEY);' },
        { version: 2001, name: 'prueba 2', up: 'CREATE TABLE trn_prueba2 (id INTEGER PRIMARY KEY);' }
      ])
    ])
    const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: backups }, registro)
    initCore(ctx)
    const copias = fs.readdirSync(backups)
    expect(copias).toHaveLength(1)
    expect(copias[0]).toMatch(/^finanzas-\d{8}-\d{6}-antes-de-migrar\.sqlite$/)
    // La copia es el estado de antes de migrar.
    const copia = await Db.open(path.join(backups, copias[0]))
    expect(copia.all('SELECT version FROM schema_migrations')).toEqual([{ version: 1 }])
    expect(tablas(copia)).not.toContain('trn_prueba')
    expect(copia.all<{ id: string }>('SELECT id FROM accounts').map((r) => r.id)).toEqual([a.id])
    copia.close()
    // Y el archivo ya está migrado.
    ctx.db.close()
    const r = await Db.open(file)
    expect(r.all('SELECT version FROM schema_migrations ORDER BY version')).toEqual([{ version: 1 }, { version: 2000 }, { version: 2001 }])
    r.close()
    // Al volver a abrir ya no hay pendientes: ni copia nueva ni guardado.
    const ctx2 = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: backups }, registro)
    initCore(ctx2)
    expect(fs.readdirSync(backups)).toHaveLength(1)
    ctx2.db.close()
  })

  it('una migración que falla al arrancar deja aplicadas las anteriores y la copia hecha', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    AppState.init(await Db.open(file), { dbPath: file, backupsDir: backups }).db.close()
    const registro = createRegistry([
      finanzasModule,
      moduloPrueba([
        { version: 2000, name: 'buena', up: 'CREATE TABLE trn_a (id INTEGER PRIMARY KEY);' },
        { version: 2001, name: 'mala', up: 'CREATE TABLE trn_b (id INTEGER PRIMARY KEY); ESTO NO ES SQL;' }
      ])
    ])
    const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: backups }, registro)
    expect(() => initCore(ctx)).toThrow()
    expect(ctx.queue.busy).toBe(false)
    expect(ctx.db.inOp).toBe(false)
    expect(fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))).toHaveLength(1)
    ctx.db.close()
    const r = await Db.open(file)
    expect(r.all('SELECT version FROM schema_migrations ORDER BY version')).toEqual([{ version: 1 }, { version: 2000 }])
    expect(tablas(r)).not.toContain('trn_b')
    r.close()
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

  it('antepone el id del dueño y deja pasar el mismo nombre en dueños distintos', () => {
    const m = mergeHandlers([
      { owner: 'core', handlers: { 'app.info': () => 1 } },
      { owner: 'entreno', handlers: { 'app.info': () => 2 } }
    ])
    expect(Object.keys(m)).toEqual(['core:app.info', 'entreno:app.info'])
  })

  it('rechaza nombres de handler repetidos (mismo dueño dos veces)', () => {
    expect(() =>
      mergeHandlers([
        { owner: 'core', handlers: { 'app.info': () => 1 } },
        { owner: 'core', handlers: { 'app.info': () => 2 } }
      ])
    ).toThrow(/repetido/)
  })

  it('rechaza un nombre ya prefijado y un id de dueño con «:»', () => {
    expect(() => mergeHandlers([{ owner: 'core', handlers: { 'core:app.info': () => 1 } }])).toThrow(/sin prefijo/)
    expect(() => mergeHandlers([{ owner: 'co:re', handlers: { x: () => 1 } }])).toThrow(/no válido/)
  })

  it('los handlers de la app no chocan y usan el mismo AppState', async () => {
    const s = await memoryApp('2026-10-11')
    const h = createAppHandlers(s.core, noDialogs, '9.9.9')
    expect(AppState.for(s.core)).toBe(s)
    const info = h['core:app.info']()
    expect(info).toMatchObject({ version: '9.9.9', today: '2026-10-11', isEmpty: true, schemaVersion: 1, dbPath: null, backupsDir: null })
    account(s, { name: 'Corriente' })
    expect(h['core:app.info']().isEmpty).toBe(false)
    expect(h['finanzas:accounts.list']().length).toBe(1)
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
    // Una escritura suelta avisa al hacerse y otra vez al confirmar la operación.
    ctx.queue.runNow('prueba:x', () => db1.exec('CREATE TABLE x (id INTEGER PRIMARY KEY)'))
    expect([a, b]).toEqual([2, 2])
    baja()
    const db2 = await Db.open(null)
    ctx.replaceDb(db2)
    expect([a, b]).toEqual([3, 2])
    expect(ctx.db).toBe(db2)
    expect(db1.onChange).toBeNull()
    // La cola escribe ya en la base nueva.
    ctx.queue.runNow('prueba:y', () => db2.exec('CREATE TABLE y (id INTEGER PRIMARY KEY)'))
    expect(a).toBe(5)
    expect(tablas(db2)).toContain('y')
    expect(tablas(db1)).not.toContain('y')
  })

  it('valida las copias con las tablas exigidas por el registro', async () => {
    const s = await memoryApp()
    await expect(validateSqlite(s.db.exportBytes(), s.core.registry.requiredTables)).resolves.toBeUndefined()
    const vacia = await Db.open(null)
    new WriteQueue(() => vacia).runNow('prueba:montar', () => vacia.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY)'))
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

    await restoreBackup(s.core, json)
    expect(s.ctx().transactions.length).toBe(1)
    expect(s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'backup' AND entity_id = 'json'")?.n).toBe(1)
  })

  it('restaurar un .sqlite: sustituye la base, una fila de auditoría, la vieja cerrada y el archivo al día', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: path.join(dir, 'backups') })
    const a = account(s, { name: 'Corriente', openingBalanceCents: 5000 })
    const copia = createBackup(s, 'manual')
    tx(s, { accountId: a.id, amountCents: -999 })
    const vieja = s.db
    const auditAntes = s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n

    // Un archivo que no es una copia no toca nada: la base actual sigue siendo la misma y usable.
    const malo = path.join(dir, 'malo.sqlite')
    fs.writeFileSync(malo, 'no es sqlite')
    await expect(restoreBackup(s, malo)).rejects.toBeInstanceOf(UserError)
    expect(s.db).toBe(vieja)
    tx(s, { accountId: a.id, amountCents: -1 })
    expect(s.ctx().transactions.length).toBe(2)

    const res = await restoreBackup(s, copia.path)
    expect(res.safetyBackup).toMatch(/-antes-de-restaurar\.sqlite$/)
    expect(s.db).not.toBe(vieja)
    expect(() => vieja.all('SELECT 1')).toThrow()
    expect(s.core.queue.busy).toBe(false)
    expect(s.ctx().transactions.length).toBe(0)
    const filas = s.db.all<{ entity: string; entity_id: string; action: string }>(
      "SELECT entity, entity_id, action FROM audit_log WHERE entity = 'backup'"
    )
    expect(filas).toEqual([{ entity: 'backup', entity_id: copia.name, action: 'restore' }])
    // La copia tenía las filas de antes del movimiento; ahora hay esas más la de restaurar.
    expect(s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n).toBe(auditAntes - 1 + 1)
    // Lo restaurado (con su auditoría) está en disco.
    s.db.close()
    const r = await Db.open(file)
    expect(r.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'backup'")!.n).toBe(1)
    expect(r.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions')!.n).toBe(0)
    r.close()
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
