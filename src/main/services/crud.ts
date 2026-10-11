// Ayudantes genéricos de alta/edición/borrado con auditoría.
import { firstError } from '@shared/schemas'
import { audit } from '../db/store'
import { entityToRow, insertRow, nextId, selectById, updateRow, type TableName } from '../db/tables'
import { UserError, type AppState } from './state'

export function parseInput<T>(schema: { parse: (v: unknown) => T }, v: unknown): T {
  try {
    return schema.parse(v)
  } catch (e) {
    throw new UserError(firstError(e))
  }
}

/** Convierte errores de restricciones SQLite en mensajes comprensibles. */
export function friendlySqlError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('UNIQUE constraint failed')) throw new UserError('Ya existe un registro con ese nombre.')
  if (msg.includes('FOREIGN KEY constraint failed'))
    throw new UserError('No se puede: hay otros registros que dependen de este (por ejemplo, movimientos que lo usan).')
  if (msg.includes('CHECK constraint failed')) throw new UserError('Algún dato no cumple las reglas (importe, signo o fecha).')
  if (e instanceof Error) throw e
  throw new Error(msg)
}

export function saveEntity<T extends { id: string }>(
  s: AppState,
  table: TableName,
  id: string | null | undefined,
  build: (existing: T | null, id: string, now: string) => T,
  label: (e: T) => string
): T {
  try {
    return s.db.tx(() => {
      const existing = id ? selectById<T>(s.db, table, id) : null
      if (id && !existing) throw new UserError('El registro no existe.')
      const newId = existing?.id ?? nextId(s.db, table)
      const now = s.now()
      const entity = build(existing, newId, now)
      const row = entityToRow(table, entity as unknown as Record<string, unknown>)
      if (existing) {
        updateRow(s.db, table, newId, row)
        audit(s.db, table, newId, 'update', label(entity), existing, entity)
      } else {
        insertRow(s.db, table, row)
        audit(s.db, table, newId, 'create', label(entity), null, entity)
      }
      return selectById<T>(s.db, table, newId)!
    })
  } catch (e) {
    if (e instanceof UserError) throw e
    friendlySqlError(e)
  }
}

export function deleteEntity(s: AppState, table: TableName, id: string, label?: string): void {
  try {
    s.db.tx(() => {
      const existing = selectById<Record<string, unknown>>(s.db, table, id)
      if (!existing) throw new UserError('El registro no existe.')
      s.db.run(`DELETE FROM ${table} WHERE id = ?`, [id])
      audit(s.db, table, id, 'delete', label ?? String(existing.name ?? existing.concept ?? id), existing, null)
    })
  } catch (e) {
    if (e instanceof UserError) throw e
    friendlySqlError(e)
  }
}
