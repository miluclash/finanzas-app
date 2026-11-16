// Ejecutor de migraciones del esquema. Cada migración se aplica una sola vez, en orden de versión,
// en su propia operación de la cola de escritura (si falla, no deja nada a medias), y queda
// apuntada en `schema_migrations`.
//
// Todos los módulos comparten `schema_migrations`. Cada uno tiene su rango de versiones (el
// registro de módulos comprueba que no se salgan de él ni se repitan).
import type { Db } from './db'

export interface Migration {
  version: number
  name: string
  up: string
}

/** Rango de versiones [mínima, máxima] (ambas incluidas). */
export type VersionRange = readonly [number, number]

/** Rangos de versiones de migración: uno para el núcleo y uno por módulo. */
export const MIGRATION_RANGES = {
  finanzas: [1, 999],
  core: [1000, 1999],
  entreno: [2000, 2999]
} as const satisfies Record<string, VersionRange>

export type MigrationOwner = keyof typeof MIGRATION_RANGES

/**
 * Ejecuta `fn` como una operación de la cola sobre la base que se está migrando: `queue.runNow`
 * al arrancar o el `runOp` de una tarea al restaurar una copia.
 */
export type OpRunner = (label: string, fn: () => void) => void

/** Etiqueta de la cola para las operaciones de migración. */
export const MIGRATION_LABEL = 'core:migrar'

const CREATE_SCHEMA_MIGRATIONS = `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`

/** La base tiene alguna tabla (es decir, no es un archivo nuevo). Solo lee. */
export function hasTables(db: Db): boolean {
  return (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")?.n ?? 0) > 0
}

/** Migraciones aún no aplicadas, en orden de versión. Solo lee (mira `sqlite_master`). */
export function pendingMigrations(db: Db, migrations: readonly Migration[]): Migration[] {
  const exists = !!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
  const done = new Set(
    exists ? db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version) : []
  )
  return [...migrations].sort((a, b) => a.version - b.version).filter((m) => !done.has(m.version))
}

/**
 * Aplica las migraciones pendientes, en orden de versión, a través de `runOp`: primero una
 * operación que crea `schema_migrations` si no existe (si ya existe no cambia nada y no se guarda)
 * y después una operación por migración. Devuelve cuántas ha aplicado.
 */
export function migrate(db: Db, migrations: readonly Migration[], runOp: OpRunner): number {
  const pending = pendingMigrations(db, migrations)
  runOp(MIGRATION_LABEL, () => db.exec(CREATE_SCHEMA_MIGRATIONS))
  for (const m of pending) {
    runOp(MIGRATION_LABEL, () => {
      db.exec(m.up)
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString()
      ])
    })
  }
  return pending.length
}

/**
 * Versión del esquema: la migración más alta aplicada. Con `range`, solo cuenta las de ese rango
 * (la versión del esquema de un módulo); sin él, la más alta de todas.
 */
export function schemaVersion(db: Db, range?: VersionRange): number {
  const r = range
    ? db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations WHERE version BETWEEN ? AND ?', [
        range[0],
        range[1]
      ])
    : db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations')
  return r?.v ?? 0
}
