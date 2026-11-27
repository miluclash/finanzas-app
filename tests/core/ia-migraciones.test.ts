// Migraciones 1003–1004 (core_ai_threads, core_ai_messages y core_settings): sobre una base vacía y
// sobre una base de F5 con datos (copia `antes-de-migrar`, nada más cambia) y al restaurar una copia
// de antes de F6.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { APP_MODULES } from '../../src/main/app'
import { createAiStore } from '../../src/main/core/aiStore'
import { restoreBackup } from '../../src/main/core/backup'
import { createAiSettingsStore } from '../../src/main/core/coreSettings'
import { CORE_MIGRATIONS } from '../../src/main/core/coreMigrations'
import { createCoreContext, initCore } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import { createRegistry } from '../../src/main/core/registry'
import { DEFAULT_AI_SETTINGS } from '../../src/shared/core/ai-types'
import { entrenoApp, escribir } from '../entreno/helpers'

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-f6-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const now = '2026-11-20T10:00:00.000Z'
const NUEVAS = ['core_ai_messages', 'core_ai_threads', 'core_settings']
const tablas = (db: Db) =>
  db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name)
const versiones = (db: Db) => db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version').map((r) => r.version)

/** Contenido de todas las tablas salvo schema_migrations y las nuevas de F6. */
function volcado(db: Db): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const t of tablas(db)) if (t !== 'schema_migrations' && !NUEVAS.includes(t)) out[t] = db.all(`SELECT * FROM "${t}" ORDER BY rowid`)
  return out
}

/** Base tal como la dejaba F5 (migraciones del núcleo hasta la 1002), con datos de los tres dueños. */
async function baseF5(file: string): Promise<void> {
  const f5 = CORE_MIGRATIONS.filter((m) => m.version <= 1002)
  const ctx = createCoreContext(await Db.open(file), { dbPath: file, backupsDir: null }, createRegistry(APP_MODULES, f5))
  initCore(ctx)
  const db = ctx.db
  escribir(ctx, () => {
    db.run("INSERT INTO accounts (id, name, type, opening_balance_cents, opening_date, created_at, updated_at) VALUES ('acc-ficticia', 'Cuenta ficticia', 'CHECKING', 1000, '2026-01-01', ?, ?)", [now, now])
    db.run("INSERT INTO trn_exercises (title, created_at, updated_at) VALUES ('Press ficticio', ?, ?)", [now, now])
    db.run("INSERT INTO core_charts (title, module, spec, created_at, updated_at) VALUES ('Gráfico', 'entreno', '{}', ?, ?)", [now, now])
    db.run("INSERT INTO core_dashboards (dashboard_id, cards, updated_at) VALUES ('inicio', '[]', ?)", [now])
  })
  expect(versiones(db)).toContain(1002)
  expect(versiones(db)).not.toContain(1003)
  db.close()
}

describe('migraciones del núcleo 1003–1004', () => {
  it('base vacía: crea las tablas de F6 vacías y el almacén y los ajustes funcionan', async () => {
    const { ctx, db } = await entrenoApp()
    expect(versiones(db)).toEqual(expect.arrayContaining([1001, 1002, 1003, 1004]))
    for (const t of NUEVAS) expect(tablas(db)).toContain(t)
    for (const t of NUEVAS) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n).toBe(0)
    const indices = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'core_ai_%' ORDER BY name").map((r) => r.name)
    expect(indices).toEqual(['core_ai_messages_proposals', 'core_ai_threads_updated'])
    expect(createAiStore(ctx).listThreads()).toEqual([])
    expect(createAiSettingsStore(ctx).get()).toEqual(DEFAULT_AI_SETTINGS)
  })

  it('sobre una base de F5 con datos: copia antes de migrar, añade las tablas y no toca nada más', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'finanzas.sqlite')
    const backups = path.join(dir, 'backups')
    await baseF5(file)
    const vieja = await Db.open(file)
    const antes = volcado(vieja)
    expect(antes.accounts).toHaveLength(1)
    expect(antes.core_charts).toHaveLength(1)
    vieja.close()

    const app = await entrenoApp({ dbPath: file, backupsDir: backups })
    const copias = fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))
    expect(copias).toHaveLength(1)
    expect(versiones(app.db)).toEqual(expect.arrayContaining([1003, 1004]))
    for (const t of NUEVAS) expect(tablas(app.db)).toContain(t)
    expect(volcado(app.db)).toEqual(antes)
    const copia = await Db.open(path.join(backups, copias[0]))
    expect(tablas(copia).filter((t) => NUEVAS.includes(t))).toEqual([])
    copia.close()

    // Se puede usar enseguida, y lo guardado sigue al volver a abrir (sin migrar ni copiar otra vez).
    const store = createAiStore(app.ctx)
    const t = await store.createThread({ title: 'Primera', model: 'qwen3:8b' })
    await store.appendMessage(t.id, { role: 'user', content: 'Hola' })
    await createAiSettingsStore(app.ctx).save({ think: true })
    app.db.close()
    const again = await entrenoApp({ dbPath: file, backupsDir: backups })
    expect(fs.readdirSync(backups).filter((f) => f.endsWith('-antes-de-migrar.sqlite'))).toHaveLength(1)
    expect(createAiStore(again.ctx).getThread(t.id)!.messages.map((m) => m.content)).toEqual(['Hola'])
    expect(createAiSettingsStore(again.ctx).get().think).toBe(true)
    again.db.close()
  })

  it('restaurar una copia de antes de F6 la deja al día (sin conversaciones ni ajustes)', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'f5.sqlite')
    await baseF5(file)
    const app = await entrenoApp({ dbPath: path.join(dir, 'actual.sqlite'), backupsDir: path.join(dir, 'backups') })
    const store = createAiStore(app.ctx)
    const ajustes = createAiSettingsStore(app.ctx)
    await store.createThread({ title: 'Se pierde', model: 'm' })
    await ajustes.save({ model: 'mistral:7b' })
    await restoreBackup(app.ctx, file)
    expect(versiones(app.ctx.db)).toEqual(expect.arrayContaining([1003, 1004]))
    // El almacén lee siempre la base actual del contexto.
    expect(store.listThreads()).toEqual([])
    expect(ajustes.get()).toEqual(DEFAULT_AI_SETTINGS)
    expect(app.ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_charts')!.n).toBe(1)
    app.ctx.db.close()
  })
})
