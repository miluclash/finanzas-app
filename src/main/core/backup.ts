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
import { Db, renameWithRetry } from './db'
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
    // Solo copias terminadas: los `.sqlite.tmp` de una copia en curso (o que falló) no cuentan.
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
  // Temporal + renombrado: con el disco lleno no queda una copia truncada en la lista (que solo
  // muestra los `.sqlite`).
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, Buffer.from(s.db.exportBytes()))
    renameWithRetry(tmp, file)
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      // Se conserva el error original (p. ej. disco lleno).
    }
    throw e
  }
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


/** No se ha podido poner al día la copia: el mensaje deja claro que no se ha tocado nada. */
function copiaNoUsable(e: unknown): UserError {
  const nada = 'No se ha cambiado nada: sigues con los datos que tenías.'
  // Un error de usuario ya explica qué pasa; uno inesperado (SQL de una migración) se resume y
  // lleva el detalle técnico, por si hay que mirarlo.
  if (e instanceof UserError) return new UserError(`No se ha podido poner al día la copia: ${e.message} ${nada}`)
  const detalle = e instanceof Error ? e.message : String(e)
  return new UserError(
    `Esta copia no se puede usar con esta versión de la app: no se ha podido poner al día. ${nada} (Detalle: ${detalle})`
  )
}

/**
 * Restaura una copia (.sqlite o .json exportado). Antes guarda una copia del estado actual.
 *
 * Se encola a sí misma en un turno exclusivo de la cola (`enqueueTask`): quien la llama no tiene
 * que envolverla en otra tarea (eso bloquearía la cola, ver writeQueue.ts).
 *
 * Con una copia `.sqlite` se migra ANTES de tocar el archivo:
 * 1. Se valida la copia y se abre en memoria, sin archivo. Para migrarla tiene que ser la base
 *    activa (la cola escribe en la activa); la migración es síncrona, así que ninguna lectura la ve
 *    a medias, y al terminar vuelve a estar activa la vieja.
 * 2. Si la migración falla, la base vieja sigue activa, el archivo no se ha tocado y se lanza un
 *    `UserError` que lo dice.
 * 3. Si va bien, la copia ya migrada se escribe en `<db>.restore` y se renombra sobre el archivo
 *    (si falla, se borra el `.restore` y la vieja sigue activa). Después la base nueva pasa a ser la
 *    activa, se apunta la restauración y se cierran la copia en memoria y la vieja.
 * Sin `dbPath` (memoria) es igual, pero sin archivo: la copia migrada pasa a ser la activa.
 *
 * En ningún paso hay una lectura que vea una base cerrada, y si algo falla la base activa es usable.
 */
export function restoreBackup(ref: CoreRef, file: string): Promise<{ safetyBackup: string | null }> {
  const s = coreOf(ref)
  return s.queue.enqueueTask(RESTORE_LABEL, async ({ runOp }) => {
    if (!fs.existsSync(file)) throw new UserError('El archivo no existe.')
    if (file.toLowerCase().endsWith('.json')) {
      const safety = s.paths.backupsDir ? createBackup(s, 'antes-de-restaurar').path : null
      const obj: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      runOp(RESTORE_LABEL, () => restoreJson(s, obj))
      return { safetyBackup: safety }
    }
    const buf = new Uint8Array(fs.readFileSync(file))
    await validateSqlite(buf, s.registry.requiredTables)

    // 1-2. Migrar la copia en memoria. Entre `replaceDb(copia)` y `replaceDb(old)` no hay ningún
    // `await`: nada más se ejecuta mientras la copia es la activa.
    const copia = await Db.openReadOnlyBuffer(buf)
    const old = s.db
    s.replaceDb(copia)
    try {
      migrate(copia, s.registry.migrations, runOp)
    } catch (e) {
      s.replaceDb(old)
      copia.close()
      console.error('No se pudo poner al día la copia que se iba a restaurar', e)
      throw copiaNoUsable(e)
    }
    s.replaceDb(old)

    // Copia del estado actual solo cuando ya se sabe que la copia elegida sirve (turno exclusivo:
    // nada ha cambiado desde que empezó). Así un intento fallido no deja copias sueltas.
    const safety = s.paths.backupsDir ? createBackup(s, 'antes-de-restaurar').path : null

    // 3. Sustituir el archivo por la copia migrada. Hasta `replaceDb(final)` la activa es la vieja.
    let final = copia
    const dbPath = s.paths.dbPath
    if (dbPath) {
      const tmp = dbPath + '.restore'
      let nueva: Db | null = null
      try {
        const bytes = copia.exportBytes()
        nueva = await Db.fromBuffer(bytes, dbPath)
        fs.writeFileSync(tmp, Buffer.from(bytes))
        renameWithRetry(tmp, dbPath)
      } catch (e) {
        nueva?.close()
        copia.close()
        try {
          fs.rmSync(tmp, { force: true })
        } catch {
          // Se conserva el error original (p. ej. disco lleno).
        }
        // La vieja ya es la activa: no hace falta `replaceDb`.
        throw e
      }
      final = nueva
    }
    s.replaceDb(final)
    const name = path.basename(file)
    try {
      runOp(RESTORE_LABEL, () => audit(final, 'backup', name, 'restore', `Restaurada copia ${name}`, null, null))
    } finally {
      if (final !== copia) copia.close()
      old.close()
    }
    return { safetyBackup: safety }
  })
}
