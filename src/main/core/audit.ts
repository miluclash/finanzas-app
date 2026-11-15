// Registro de auditoría (tabla audit_log), compartido por todos los módulos.
import type { Db } from './db'

export function audit(
  db: Db,
  entity: string,
  entityId: string,
  action: string,
  summary: string | null,
  before: unknown,
  after: unknown
): void {
  db.run(
    'INSERT INTO audit_log (ts, entity, entity_id, action, summary, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      new Date().toISOString(),
      entity,
      entityId,
      action,
      summary,
      before === undefined || before === null ? null : JSON.stringify(before),
      after === undefined || after === null ? null : JSON.stringify(after)
    ]
  )
}
