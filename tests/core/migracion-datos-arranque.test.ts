// Núcleo (F4): paso de datos `data` de una migración (misma operación que su SQL) y paso de
// arranque `startup` de los módulos (su propia operación, después de las semillas).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCoreContext, initCore, runModuleStartups } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { migrate, pendingMigrations, type Migration, type OpRunner } from '../../src/main/core/migrations'
import { createRegistry, defineModule, type AppModule } from '../../src/main/core/registry'
import { WriteQueue } from '../../src/main/core/writeQueue'
import { finanzasModule } from '../../src/main/modules/finanzas'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-mig-datos-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function porCola(db: Db): { run: OpRunner; labels: string[] } {
  const q = new WriteQueue(() => db)
  const labels: string[] = []
  return {
    labels,
    run: (label, fn) => {
      labels.push(label)
      q.runNow(label, fn)
    }
  }
}

const n = (db: Db, sql: string) => db.get<{ n: number }>(sql)!.n
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

describe('paso de datos de una migración', () => {
  it('corre después del SQL, en la misma operación, y solo una vez', async () => {
    const db = await Db.open(null)
    const data = vi.fn((d: Db) => d.run("UPDATE trn_x SET v = upper(v) WHERE v = 'a'"))
    const migs: Migration[] = [
      { version: 2000, name: 'tabla', up: "CREATE TABLE trn_x (v TEXT); INSERT INTO trn_x VALUES ('a'), ('b');" },
      { version: 2001, name: 'datos', up: 'ALTER TABLE trn_x ADD COLUMN w INTEGER NOT NULL DEFAULT 0;', data }
    ]
    const c = porCola(db)
    expect(migrate(db, migs, c.run)).toBe(2)
    // Una operación para schema_migrations y una por migración: el paso de datos no abre otra.
    expect(c.labels).toEqual(['core:migrar', 'core:migrar', 'core:migrar'])
    expect(data).toHaveBeenCalledTimes(1)
    expect(db.all('SELECT v, w FROM trn_x ORDER BY rowid')).toEqual([
      { v: 'A', w: 0 },
      { v: 'b', w: 0 }
    ])
    expect(migrate(db, migs, porCola(db).run)).toBe(0)
    expect(data).toHaveBeenCalledTimes(1)
  })

  it('si el paso de datos falla, se deshace también su SQL y la migración no queda apuntada', async () => {
    const db = await Db.open(null)
    const migs: Migration[] = [
      { version: 2000, name: 'tabla', up: 'CREATE TABLE trn_x (v TEXT);' },
      {
        version: 2001,
        name: 'falla',
        up: 'ALTER TABLE trn_x ADD COLUMN w INTEGER;',
        data: (d) => {
          d.run("INSERT INTO trn_x VALUES ('medio', 1)")
          throw new Error('fallo en los datos')
        }
      }
    ]
    expect(() => migrate(db, migs, porCola(db).run)).toThrow('fallo en los datos')
    expect(db.all<{ name: string }>('PRAGMA table_info(trn_x)').map((c) => c.name)).toEqual(['v'])
    expect(n(db, 'SELECT COUNT(*) AS n FROM trn_x')).toBe(0)
    expect(pendingMigrations(db, migs).map((m) => m.version)).toEqual([2001])
  })

  it('el paso de datos no puede escribir fuera de la cola (recibe la base de la operación)', async () => {
    const db = await Db.open(null)
    let fuera: Db | null = null
    migrate(db, [{ version: 2000, name: 'x', up: 'CREATE TABLE trn_x (v TEXT);', data: (d) => void (fuera = d) }], porCola(db).run)
    expect(fuera).toBe(db)
    expect(() => db.run("INSERT INTO trn_x VALUES ('z')")).toThrow(/Escritura fuera de la cola/)
  })
})

function moduloConArranque(startup: AppModule['startup'], seed?: AppModule['seed']): AppModule {
  return defineModule({
    id: 'entreno',
    name: 'Prueba',
    migrations: [{ version: 2000, name: 'tabla', up: 'CREATE TABLE trn_x (v TEXT);' }],
    ipc: () => ({}),
    metrics: [],
    aiTools: [],
    seed,
    startup
  })
}

describe('paso de arranque de un módulo', () => {
  it('corre después de migrar y de todas las semillas, en su propia operación, con la fecha del contexto', async () => {
    const orden: string[] = []
    let hoy = ''
    const mod = moduloConArranque(
      (ctx) => {
        orden.push('arranque')
        hoy = ctx.today()
        ctx.db.run("INSERT INTO trn_x VALUES ('arrancado')")
      },
      () => void orden.push('semilla')
    )
    const ctx = createCoreContext(await Db.open(null), { dbPath: null, backupsDir: null }, createRegistry([finanzasModule, mod]))
    ctx.todayOverride = '2026-11-25'
    const runNow = vi.spyOn(ctx.queue, 'runNow')
    initCore(ctx)
    const etiquetas = runNow.mock.calls.map((c) => c[0])
    expect(etiquetas.slice(-3)).toEqual(['finanzas:semilla', 'entreno:semilla', 'entreno:arranque'])
    expect(orden).toEqual(['semilla', 'arranque'])
    expect(hoy).toBe('2026-11-25')
    expect(ctx.db.all('SELECT v FROM trn_x')).toEqual([{ v: 'arrancado' }])
  })

  it('si no escribe nada, abrir una base al día no toca el archivo', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const reg = () => createRegistry([finanzasModule, moduloConArranque(() => undefined)])
    const a = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: null }, reg())
    initCore(a)
    a.db.close()
    const huella = sha(file)
    const mtime = fs.statSync(file).mtimeMs
    const b = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: null }, reg())
    initCore(b)
    b.db.close()
    expect(sha(file)).toBe(huella)
    expect(fs.statSync(file).mtimeMs).toBe(mtime)
  })

  it('si el arranque falla, se deshace lo suyo, se avisa y la app abre igual (también finanzas)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const mod = moduloConArranque((ctx) => {
      ctx.db.run("INSERT INTO trn_x VALUES ('a medias')")
      throw new Error('arranque roto')
    })
    const ctx = createCoreContext(await Db.open(null), { dbPath: null, backupsDir: null }, createRegistry([finanzasModule, mod]))
    expect(() => initCore(ctx)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/arranque de entreno ha fallado/)
    expect(n(ctx.db, 'SELECT COUNT(*) AS n FROM trn_x')).toBe(0)
    expect(ctx.queue.busy).toBe(false)
    // Finanzas está migrada y sembrada, y se puede escribir.
    expect(n(ctx.db, 'SELECT COUNT(*) AS n FROM categories')).toBeGreaterThan(0)
    await ctx.queue.enqueue('test:escribir', () => ctx.db.run("INSERT INTO trn_x VALUES ('después')"))
    expect(n(ctx.db, 'SELECT COUNT(*) AS n FROM trn_x')).toBe(1)
  })

  it('como en initData: sin arranque en initCore, la copia diaria y después runModuleStartups, que no lanza si falla', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const orden: string[] = []
    const bien = moduloConArranque((ctx) => {
      orden.push('arranque')
      ctx.db.run("INSERT INTO trn_x VALUES ('ok')")
    })
    const ctx = createCoreContext(await Db.open(null), { dbPath: null, backupsDir: null }, createRegistry([finanzasModule, bien]))
    initCore(ctx, { startup: false })
    expect(orden).toEqual([])
    await ctx.queue.enqueueTask('core:backup.auto', async () => void orden.push('copia'))
    const enqueue = vi.spyOn(ctx.queue, 'enqueue')
    await runModuleStartups(ctx)
    expect(orden).toEqual(['copia', 'arranque'])
    expect(enqueue.mock.calls.map((c) => c[0])).toEqual(['entreno:arranque'])
    expect(n(ctx.db, 'SELECT COUNT(*) AS n FROM trn_x')).toBe(1)

    const mal = moduloConArranque(() => {
      throw new Error('roto')
    })
    const ctx2 = createCoreContext(await Db.open(null), { dbPath: null, backupsDir: null }, createRegistry([finanzasModule, mal]))
    initCore(ctx2, { startup: false })
    await expect(runModuleStartups(ctx2)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(ctx2.queue.busy).toBe(false)
  })
})
