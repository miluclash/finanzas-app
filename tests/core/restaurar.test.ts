// Restaurar una copia .sqlite cuando algo falla a medias: escribir o renombrar el archivo (disco
// lleno) o migrar la copia (se migra antes de tocar el archivo). También una restauración correcta
// con una migración pendiente, que la base vieja se cierra sin archivo (memoria) y que una copia de
// seguridad a medias no queda en la lista.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackup, listBackups, restoreBackup } from '../../src/main/core/backup'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { UserError } from '../../src/main/core/errors'
import { createRegistry, defineModule } from '../../src/main/core/registry'
import { finanzasModule } from '../../src/main/modules/finanzas'
import { AppState } from '../../src/main/modules/finanzas/state'
import { account, escribir, memoryApp } from '../helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-restaurar-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const nombres = (s: AppState) => s.snap().accounts.map((a) => a.name).sort()
const auditoria = (entityId: string) =>
  `SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'backup' AND entity_id = '${entityId}' AND action = 'restore'`

/** Registro de la app más un módulo de prueba con la migración 2000 (CREATE TABLE trn_a). */
function registroConTrnA() {
  return createRegistry([
    finanzasModule,
    defineModule({
      id: 'entreno',
      name: 'Prueba',
      migrations: [{ version: 2000, name: 'trn_a', up: 'CREATE TABLE trn_a (id INTEGER PRIMARY KEY);' }],
      ipc: () => ({}),
      metrics: [],
      aiTools: []
    })
  ])
}

/** App con archivo en `dir` y el registro con trn_a, ya arrancada y con la cuenta «Actual». */
async function appConArchivo(dir: string) {
  const file = path.join(dir, 'finanzas.sqlite')
  const backups = path.join(dir, 'backups')
  const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: backups }, registroConTrnA())
  initCore(ctx)
  const s = AppState.for(ctx)
  s.todayOverride = '2026-10-11'
  account(s, { name: 'Actual' })
  return { ctx, s, file, backups }
}

describe('restaurar un .sqlite a medias', () => {
  it('(a) si no se puede escribir el .restore, la base actual sigue intacta y usable y no queda ningún .restore', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const s = AppState.init(await Db.open(file), { dbPath: file, backupsDir: path.join(dir, 'backups') })
    s.todayOverride = '2026-10-11'
    account(s, { name: 'De la copia' })
    const copia = createBackup(s, 'manual')
    account(s, { name: 'Actual' })
    const vieja = s.db
    const antes = sha(file)

    const real = fs.writeFileSync
    const escribe = vi.spyOn(fs, 'writeFileSync').mockImplementation((p, ...rest) => {
      if (String(p).endsWith('.restore')) {
        // Disco lleno a mitad: queda un archivo a medias y luego falla.
        real(p, 'a medias')
        throw Object.assign(new Error('ENOSPC: no queda espacio en el disco'), { code: 'ENOSPC' })
      }
      return real(p, ...(rest as [Parameters<typeof real>[1]]))
    })
    const cerrar = vi.spyOn(Db.prototype, 'close')

    await expect(restoreBackup(s, copia.path)).rejects.toThrow('ENOSPC')
    expect(escribe.mock.calls.some((c) => String(c[0]).endsWith('.restore'))).toBe(true)
    escribe.mockRestore()

    // Se han cerrado la base de la validación, la copia migrada en memoria y la nueva que se había
    // abierto; la actual no.
    expect(cerrar).toHaveBeenCalledTimes(3)
    expect(cerrar.mock.contexts).not.toContain(vieja)
    expect(s.db).toBe(vieja)
    expect(s.core.queue.busy).toBe(false)
    expect(s.db.inOp).toBe(false)
    // Ni .restore a medias ni el archivo tocado.
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.restore'))).toEqual([])
    expect(sha(file)).toBe(antes)
    // Sigue usable: los datos están y se puede escribir.
    expect(nombres(s)).toEqual(['Actual', 'De la copia'])
    account(s, { name: 'Después' })
    expect(nombres(s)).toEqual(['Actual', 'De la copia', 'Después'])
    s.db.close()
  })

  it('(b) si la migración de la copia falla: no se toca nada, la base vieja sigue activa y usable y la app arranca', async () => {
    const dir = tmpDir()
    // La copia: una base de finanzas que ya tiene una tabla trn_a sin la migración apuntada, así que
    // la migración 2000 (CREATE TABLE trn_a) falla sobre ella y no sobre una base nueva.
    const origen = await memoryApp()
    account(origen, { name: 'De la copia' })
    escribir(origen, () => origen.db.exec('CREATE TABLE trn_a (id INTEGER PRIMARY KEY);'))
    const copiaPath = path.join(dir, 'copia.sqlite')
    fs.writeFileSync(copiaPath, origen.db.exportBytes())

    const { ctx, s, file, backups } = await appConArchivo(dir)
    const vieja = ctx.db
    const antes = sha(file)
    const cerrar = vi.spyOn(Db.prototype, 'close')

    let error: unknown = null
    try {
      await restoreBackup(ctx, copiaPath)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(UserError)
    const msg = (error as Error).message
    expect(msg).toContain('Esta copia no se puede usar con esta versión de la app')
    expect(msg).toContain('No se ha cambiado nada')
    expect(msg).not.toContain('Se volverá a intentar')

    // El archivo sigue intacto y no queda ningún .restore.
    expect(sha(file)).toBe(antes)
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.restore'))).toEqual([])
    // Se han cerrado la base de la validación y la copia en memoria; la vieja no.
    expect(cerrar).toHaveBeenCalledTimes(2)
    expect(cerrar.mock.contexts).not.toContain(vieja)
    cerrar.mockRestore()
    // La base activa es la vieja, sin cambios y usable; la cola, libre.
    expect(ctx.db).toBe(vieja)
    expect(ctx.queue.busy).toBe(false)
    expect(ctx.db.inOp).toBe(false)
    expect(nombres(s)).toEqual(['Actual'])
    expect(ctx.db.get<{ n: number }>(auditoria('copia.sqlite'))!.n).toBe(0)
    account(s, { name: 'Después' })
    expect(nombres(s)).toEqual(['Actual', 'Después'])
    ctx.db.close()

    // Un intento fallido no deja copias sueltas: la copia antes-de-restaurar solo se hace si la copia
    // elegida sirve.
    const listar = (): string[] => (fs.existsSync(backups) ? fs.readdirSync(backups) : [])
    expect(listar().filter((f) => f.includes('-antes-de-restaurar'))).toEqual([])

    // Al volver a abrir, la app arranca sobre ese archivo sin migrar nada (ni copia antes-de-migrar).
    const copiasAntes = listar().length
    const ctx2 = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: backups }, registroConTrnA())
    expect(() => initCore(ctx2)).not.toThrow()
    expect(AppState.for(ctx2).snap().accounts.map((a) => a.name).sort()).toEqual(['Actual', 'Después'])
    expect(listar().length).toBe(copiasAntes)
    ctx2.db.close()
  })

  it('(d) restauración correcta de una copia con una migración pendiente: se aplica y queda en disco', async () => {
    const dir = tmpDir()
    // La copia solo tiene finanzas (migración 1); la app tiene además la 2000.
    const origen = await memoryApp()
    account(origen, { name: 'De la copia' })
    const copiaPath = path.join(dir, 'copia.sqlite')
    fs.writeFileSync(copiaPath, origen.db.exportBytes())

    const { ctx, s, file, backups } = await appConArchivo(dir)
    const vieja = ctx.db
    const res = await restoreBackup(ctx, copiaPath)
    expect(res.safetyBackup).toMatch(/-antes-de-restaurar\.sqlite$/)
    expect(ctx.db).not.toBe(vieja)
    expect(() => vieja.all('SELECT 1')).toThrow()
    expect(ctx.queue.busy).toBe(false)
    expect(nombres(s)).toEqual(['De la copia'])
    const versiones = 'SELECT version FROM schema_migrations ORDER BY version'
    expect(ctx.db.all(versiones)).toEqual([{ version: 1 }, { version: 2000 }])
    expect(ctx.db.get<{ n: number }>(auditoria('copia.sqlite'))!.n).toBe(1)
    ctx.db.close()

    // En disco: la copia migrada, con trn_a y la fila de auditoría; y al arrancar no hay nada pendiente.
    const r = await Db.open(file)
    expect(r.all(versiones)).toEqual([{ version: 1 }, { version: 2000 }])
    expect(r.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trn_a'")).toBeDefined()
    expect(r.get<{ n: number }>(auditoria('copia.sqlite'))!.n).toBe(1)
    expect(r.all<{ name: string }>('SELECT name FROM accounts').map((x) => x.name)).toEqual(['De la copia'])
    const copiasAntes = fs.readdirSync(backups).length
    const ctx2 = createCoreContext(r, { dbPath: file, backupsDir: backups }, registroConTrnA())
    initCore(ctx2)
    expect(fs.readdirSync(backups).length).toBe(copiasAntes)
    ctx2.db.close()
  })

  it('(e) si falla el renombrado del .restore, la base activa sigue siendo la vieja y el archivo no cambia', async () => {
    const dir = tmpDir()
    const origen = await memoryApp()
    account(origen, { name: 'De la copia' })
    const copiaPath = path.join(dir, 'copia.sqlite')
    fs.writeFileSync(copiaPath, origen.db.exportBytes())

    const { ctx, s, file } = await appConArchivo(dir)
    const vieja = ctx.db
    const antes = sha(file)
    const real = fs.renameSync
    const renombra = vi.spyOn(fs, 'renameSync').mockImplementation((de, a) => {
      if (String(de).endsWith('.restore')) throw Object.assign(new Error('EPERM: archivo en uso'), { code: 'EPERM' })
      return real(de, a)
    })
    await expect(restoreBackup(ctx, copiaPath)).rejects.toThrow('EPERM')
    expect(renombra.mock.calls.some((c) => String(c[0]).endsWith('.restore'))).toBe(true)
    renombra.mockRestore()

    expect(ctx.db).toBe(vieja)
    expect(ctx.queue.busy).toBe(false)
    expect(sha(file)).toBe(antes)
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.restore'))).toEqual([])
    expect(nombres(s)).toEqual(['Actual'])
    expect(ctx.db.get<{ n: number }>(auditoria('copia.sqlite'))!.n).toBe(0)
    account(s, { name: 'Después' })
    expect(nombres(s)).toEqual(['Actual', 'Después'])
    ctx.db.close()
  })

  it('(c) sin archivo (en memoria) la base vieja también se cierra', async () => {
    const dir = tmpDir()
    const s = await memoryApp()
    account(s, { name: 'De la copia' })
    const copiaPath = path.join(dir, 'copia.sqlite')
    fs.writeFileSync(copiaPath, s.db.exportBytes())
    account(s, { name: 'Después' })
    const vieja = s.db
    await restoreBackup(s, copiaPath)
    expect(s.db).not.toBe(vieja)
    expect(() => vieja.all('SELECT 1')).toThrow()
    expect(nombres(s)).toEqual(['De la copia'])
  })
})

describe('copias de seguridad a medias', () => {
  it('si no se puede escribir la copia, no queda ningún archivo y no aparece en la lista', async () => {
    const dir = tmpDir()
    const backups = path.join(dir, 'backups')
    const s = await memoryApp()
    const src = { db: s.db, paths: { dbPath: null, backupsDir: backups } }
    const real = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p, ...rest) => {
      if (String(p).endsWith('.sqlite.tmp')) {
        real(p, 'a medias')
        throw Object.assign(new Error('ENOSPC: no queda espacio en el disco'), { code: 'ENOSPC' })
      }
      return real(p, ...(rest as [Parameters<typeof real>[1]]))
    })
    expect(() => createBackup(src, 'manual')).toThrow('ENOSPC')
    vi.restoreAllMocks()
    expect(fs.readdirSync(backups)).toEqual([])
    expect(listBackups(src)).toEqual([])
    // Una copia correcta sí aparece, y un .tmp suelto (p. ej. de un corte de luz) no.
    const ok = createBackup(src, 'manual')
    fs.writeFileSync(path.join(backups, 'finanzas-20260101-000000-manual.sqlite.tmp'), 'a medias')
    expect(listBackups(src).map((b) => b.name)).toEqual([ok.name])
    expect(fs.readFileSync(ok.path).length).toBe(ok.size)
  })
})
