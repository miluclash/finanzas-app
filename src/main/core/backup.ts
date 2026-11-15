// Copias de seguridad (archivo SQLite completo) y restauración (copia .sqlite o exportación JSON
// de un módulo).
import fs from 'node:fs'
import path from 'node:path'
import { audit } from './audit'
import { coreOf, type CorePaths, type CoreRef } from './context'
import { Db } from './db'
import { UserError } from './errors'
import { migrate } from './migrations'

/** Lo mínimo para hacer o listar copias: lo cumplen el contexto del núcleo y `AppState`. */
export interface BackupSource {
  readonly db: Db
  readonly paths: CorePaths
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: string
  auto: boolean
}

export function listBackups(s: BackupSource): BackupInfo[] {
  const dir = s.paths.backupsDir
  if (!dir || !fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f))
      return { name: f, path: path.join(dir, f), size: st.size, createdAt: st.mtime.toISOString(), auto: f.includes('-auto') }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function createBackup(
  s: BackupSource,
  kind: 'auto' | 'manual' | 'antes-de-restaurar' | 'antes-de-importar' | 'antes-de-actualizar' = 'manual'
): BackupInfo {
  const dir = s.paths.backupsDir
  if (!dir) throw new UserError('No hay carpeta de copias configurada.')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `finanzas-${stamp()}-${kind}.sqlite`)
  fs.writeFileSync(file, Buffer.from(s.db.exportBytes()))
  const st = fs.statSync(file)
  return { name: path.basename(file), path: file, size: st.size, createdAt: st.mtime.toISOString(), auto: kind === 'auto' }
}

/** Una copia automática al día como máximo; se conservan las 30 más recientes. */
export function autoBackup(s: BackupSource, keep = 30): BackupInfo | null {
  const dir = s.paths.backupsDir
  if (!dir) return null
  const today = stamp().slice(0, 8)
  const existing = listBackups(s).filter((b) => b.auto)
  let created: BackupInfo | null = null
  if (!existing.some((b) => b.name.includes(`finanzas-${today}`))) created = createBackup(s, 'auto')
  const autos = listBackups(s).filter((b) => b.auto)
  for (const old of autos.slice(keep)) fs.rmSync(old.path, { force: true })
  return created
}

/** Comprueba que `buf` es una base SQLite con las tablas exigidas (`registry.requiredTables`). */
export async function validateSqlite(buf: Uint8Array, requiredTables: readonly string[]): Promise<void> {
  let db: Db | null = null
  try {
    db = await Db.openReadOnlyBuffer(buf)
    const tables = new Set(db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name))
    for (const t of requiredTables) if (!tables.has(t)) throw new UserError('El archivo no es una copia de seguridad de esta app.')
  } catch (e) {
    if (e instanceof UserError) throw e
    throw new UserError('El archivo no es una base de datos válida.')
  } finally {
    db?.close()
  }
}

/** Pregunta a cada módulo si reconoce la exportación JSON; el primero que la reconoce la restaura. */
function restoreJson(ref: CoreRef, obj: unknown): void {
  const ctx = coreOf(ref)
  for (const m of ctx.registry.modules) if (m.restoreJson?.(ctx, obj)) return
  throw new UserError('El JSON no es una exportación de esta app.')
}

/** Restaura una copia (.sqlite o .json exportado). Antes guarda una copia del estado actual. */
export async function restoreBackup(ref: CoreRef, file: string): Promise<{ safetyBackup: string | null }> {
  const s = coreOf(ref)
  if (!fs.existsSync(file)) throw new UserError('El archivo no existe.')
  const safety = s.paths.backupsDir ? createBackup(s, 'antes-de-restaurar').path : null
  if (file.toLowerCase().endsWith('.json')) {
    restoreJson(s, JSON.parse(fs.readFileSync(file, 'utf8')))
    return { safetyBackup: safety }
  }
  const buf = new Uint8Array(fs.readFileSync(file))
  await validateSqlite(buf, s.registry.requiredTables)
  if (!s.paths.dbPath) {
    const db = await Db.openReadOnlyBuffer(buf)
    migrate(db, s.registry.migrations)
    s.replaceDb(db)
    return { safetyBackup: safety }
  }
  fs.writeFileSync(s.paths.dbPath + '.restore', Buffer.from(buf))
  s.db.close()
  fs.renameSync(s.paths.dbPath + '.restore', s.paths.dbPath)
  const db = await Db.open(s.paths.dbPath)
  migrate(db, s.registry.migrations)
  s.replaceDb(db)
  audit(s.db, 'backup', path.basename(file), 'restore', `Restaurada copia ${path.basename(file)}`, null, null)
  return { safetyBackup: safety }
}
