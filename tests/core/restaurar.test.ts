// Restaurar una copia .sqlite cuando algo falla a medias: escribir el archivo (disco lleno) o
// migrar la copia ya restaurada. También que la base vieja se cierra sin archivo (memoria).
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackup, restoreBackup } from '../../src/main/core/backup'
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

    // Se han cerrado la base de la validación y la nueva que se había abierto; la actual no.
    expect(cerrar).toHaveBeenCalledTimes(2)
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

  it('(b) si la migración falla sobre la copia restaurada: mensaje claro, base nueva activa y auditoría apuntada', async () => {
    const dir = tmpDir()
    const backups = path.join(dir, 'backups')
    // La copia: una base de finanzas que ya tiene una tabla trn_a sin la migración apuntada, así que
    // la migración 2000 (CREATE TABLE trn_a) falla sobre ella y no sobre una base nueva.
    const origen = await memoryApp()
    account(origen, { name: 'De la copia' })
    escribir(origen, () => origen.db.exec('CREATE TABLE trn_a (id INTEGER PRIMARY KEY);'))
    const copiaPath = path.join(dir, 'copia.sqlite')
    fs.writeFileSync(copiaPath, origen.db.exportBytes())

    const registro = createRegistry([
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
    const file = path.join(dir, 'finanzas.sqlite')
    const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: backups }, registro)
    initCore(ctx)
    const s = AppState.for(ctx)
    s.todayOverride = '2026-10-11'
    account(s, { name: 'Actual' })
    const vieja = ctx.db

    let error: unknown = null
    try {
      await restoreBackup(ctx, copiaPath)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(UserError)
    const msg = (error as Error).message
    expect(msg).toContain('La copia se ha restaurado, pero no se ha podido poner al día con esta versión de la app.')
    expect(msg).toContain('Se volverá a intentar')
    const antes = fs.readdirSync(backups).find((f) => f.endsWith('-antes-de-restaurar.sqlite'))
    expect(antes).toBeDefined()
    expect(msg).toContain(antes!)

    // La base nueva está activa (y la vieja cerrada); la cola, libre.
    expect(ctx.db).not.toBe(vieja)
    expect(() => vieja.all('SELECT 1')).toThrow()
    expect(ctx.queue.busy).toBe(false)
    expect(ctx.db.inOp).toBe(false)
    expect(nombres(s)).toEqual(['De la copia'])
    expect(ctx.db.all('SELECT version FROM schema_migrations ORDER BY version')).toEqual([{ version: 1 }])
    // La restauración queda apuntada, también en disco.
    const auditoria = "SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'backup' AND entity_id = 'copia.sqlite' AND action = 'restore'"
    expect(ctx.db.get<{ n: number }>(auditoria)!.n).toBe(1)
    ctx.db.close()
    const r = await Db.open(file)
    expect(r.get<{ n: number }>(auditoria)!.n).toBe(1)
    expect(r.all<{ name: string }>('SELECT name FROM accounts').map((x) => x.name)).toEqual(['De la copia'])
    r.close()
    // La copia antes-de-restaurar tiene el estado anterior.
    const previa = await Db.open(path.join(backups, antes!))
    expect(previa.all<{ name: string }>('SELECT name FROM accounts').map((x) => x.name)).toEqual(['Actual'])
    previa.close()
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
