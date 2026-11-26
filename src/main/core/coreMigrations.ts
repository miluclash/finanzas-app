// Migraciones del núcleo (rango 1000–1999). Solo hacia delante: nunca se edita una ya publicada.
//
// 1001 `core_charts`: gráficos guardados del constructor (F5). `spec` es la especificación JSON
//      (versión 1, validada con Zod y las reglas del motor al guardar y al cargar).
// 1002 `core_dashboards`: una fila por panel con su lista ordenada de tarjetas. Sin fila, el panel
//      usa el diseño por defecto de la interfaz; "Restaurar diseño" borra la fila.
import type { Migration } from './migrations'

export const CORE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1001,
    name: 'core_charts',
    up: `CREATE TABLE core_charts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      module TEXT NOT NULL,
      spec TEXT NOT NULL CHECK (json_valid(spec)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  },
  {
    version: 1002,
    name: 'core_dashboards',
    up: `CREATE TABLE core_dashboards (
      dashboard_id TEXT PRIMARY KEY CHECK (dashboard_id IN ('inicio', 'finanzas', 'entreno')),
      cards TEXT NOT NULL CHECK (json_valid(cards) AND json_type(cards) = 'array'),
      updated_at TEXT NOT NULL
    );`
  }
]
