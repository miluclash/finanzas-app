// Copias de seguridad (archivo SQLite completo) y restauración (copia .sqlite o exportación JSON
// de un módulo).
//
// `createBackup` y `autoBackup` no escriben en la base y no se encolan solas: quien las llama
// decide el turno (los handlers usan un turno exclusivo de la cola; el arranque, el paso previo de
// la primera migración). Nunca dentro de una operación: `exportBytes` lanza con una transacción
// abierta.
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

/**
 * Tipos de copia (van en el nombre del archivo). Solo `auto` cuenta como automática y se poda;
 * `sin-guardar` es el volcado de la base en memoria cuando no se ha podido guardar al cerrar o al
 * actualizar.
 */
export type BackupKind =
  | 'auto'
  | 'manual'
  | 'antes-de-restaurar'
  | 'antes-de-importar'
  | 'antes-de-actualizar'
  | 'antes-de-migrar'
  | 'sin-guardar'

export function createBackup(s: BackupSource, kind: BackupKind = 'manual'): BackupInfo {
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

/** Etiqueta de la cola para restaurar una copia. */
const RESTORE_LABEL = 'core:backup.restore'

/**
 * Restaura una copia (.sqlite o .json exportado). Antes guarda una copia del estado actual.
 *
 * Se encola a sí misma en un turno exclusivo de la cola (`enqueueTask`): quien la llama no tiene
 * que envolverla en otra tarea (eso bloquearía la cola, ver writeQueue.ts).
 *
 * Con una copia `.sqlite`, la base nueva sustituye a la actual (`replaceDb`) antes de migrarla, y
 * la vieja se cierra al final. Si algo falla antes de `replaceDb`, la base actual sigue intacta (y
 * no queda ningún `.restore` a medias). Si falla la migración de la copia ya restaurada, la base
 * nueva se queda activa y se lanza un `UserError` que dice dónde está el estado anterior.
 */
export function restoreBackup(ref: CoreRef, file: string): Promise<{ safetyBackup: string | null }> {
  const s = coreOf(ref)
  return s.queue.enqueueTask(RESTORE_LABEL, async ({ runOp }) => {
    if (!fs.existsSync(file)) throw new UserError('El archivo no existe.')
    const safety = s.paths.backupsDir ? createBackup(s, 'antes-de-restaurar').path : null
    if (file.toLowerCase().endsWith('.json')) {
      const obj: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      runOp(RESTORE_LABEL, () => restoreJson(s, obj))
      return { safetyBackup: safety }
    }
    const buf = new Uint8Array(fs.readFileSync(file))
    await validateSqlite(buf, s.registry.requiredTables)
    if (!s.paths.dbPath) {
      const db = await Db.openReadOnlyBuffer(buf)
      const old = s.db
      s.replaceDb(db)
      try {
        migrate(db, s.registry.migrations, runOp)
      } finally {
        old.close()
      }
      return { safetyBackup: safety }
    }
    // La base nueva se abre desde los bytes ya validados ANTES de tocar el archivo: si no se puede
    // abrir, el archivo y la base actual siguen intactos. sql.js no mantiene el archivo abierto,
    // así que se puede sustituir con la base vieja aún en memoria.
    const db = await Db.fromBuffer(buf, s.paths.dbPath)
    const tmp = s.paths.dbPath + '.restore'
    try {
      fs.writeFileSync(tmp, Buffer.from(buf))
      fs.renameSync(tmp, s.paths.dbPath)
    } catch (e) {
      db.close()
      try {
        fs.rmSync(tmp, { force: true })
      } catch {
        // Se conserva el error original (p. ej. disco lleno).
      }
      throw e
    }
    // Desde aquí el archivo ya es la copia: la base nueva se queda activa pase lo que pase.
    const old = s.db
    s.replaceDb(db)
    const name = path.basename(file)
    try {
      let migrateError: unknown = null
      try {
        migrate(db, s.registry.migrations, runOp)
      } catch (e) {
        migrateError = e
      }
      // La restauración se apunta aunque la migración haya fallado; si esto falla tampoco tapa
      // el error de la migración.
      try {
        runOp(RESTORE_LABEL, () => audit(db, 'backup', name, 'restore', `Restaurada copia ${name}`, null, null))
      } catch (e) {
        if (!migrateError) throw e
        console.error('No se pudo apuntar la restauración en el registro de cambios', e)
      }
      if (migrateError) {
        console.error('No se pudo migrar la copia restaurada', migrateError)
        const previo = safety
          ? `Lo que tenías antes está guardado en la copia ${path.basename(safety)}.`
          : 'No había carpeta de copias, así que no se ha guardado una copia de lo que tenías antes.'
        throw new UserError(
          `La copia se ha restaurado, pero no se ha podido poner al día con esta versión de la app. ${previo} ` +
            'Se volverá a intentar la próxima vez que abras la app.'
        )
      }
    } finally {
      old.close()
    }
    return { safetyBackup: safety }
  })
}
