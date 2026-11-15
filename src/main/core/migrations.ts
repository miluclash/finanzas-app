// Ejecutor de migraciones del esquema. Cada migración se aplica una sola vez, en orden de versión,
// dentro de una transacción, y queda apuntada en `schema_migrations`.
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

/** Aplica las migraciones pendientes, en orden de versión. Devuelve cuántas ha aplicado. */
export function migrate(db: Db, migrations: readonly Migration[]): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`)
  const done = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version))
  let applied = 0
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (done.has(m.version)) continue
    db.tx(() => {
      db.exec(m.up)
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString()
      ])
    })
    applied++
  }
  return applied
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
