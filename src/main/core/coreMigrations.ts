// Migraciones del núcleo (rango 1000–1999). Solo hacia delante: nunca se edita una ya publicada.
//
// 1001 `core_charts`: gráficos guardados del constructor (F5). `spec` es la especificación JSON
//      (versión 1, validada con Zod y las reglas del motor al guardar y al cargar).
// 1002 `core_dashboards`: una fila por panel con su lista ordenada de tarjetas. Sin fila, el panel
//      usa el diseño por defecto de la interfaz; "Restaurar diseño" borra la fila.
// 1003 `core_ai_threads` y `core_ai_messages`: conversaciones del asistente (F6). Los mensajes se
//      ordenan por `seq` dentro de su hilo y se borran con él (ON DELETE CASCADE). Las llamadas a
//      herramientas y las propuestas del mensaje (con su estado) van en columnas JSON; solo los
//      mensajes del asistente las llevan, y solo los de herramienta llevan `tool_call_id`/`tool_name`.
// 1004 `core_settings`: ajustes del núcleo, clave/valor. `value` es JSON en texto (`true`,
//      `"qwen3:8b"`…); hoy solo las claves `ai.*` del asistente.
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
  },
  {
    version: 1003,
    name: 'core_ai_threads y core_ai_messages',
    up: `CREATE TABLE core_ai_threads (
      id TEXT PRIMARY KEY CHECK (length(id) > 0),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX core_ai_threads_updated ON core_ai_threads (updated_at);
    CREATE TABLE core_ai_messages (
      id TEXT PRIMARY KEY CHECK (length(id) > 0),
      thread_id TEXT NOT NULL REFERENCES core_ai_threads (id) ON DELETE CASCADE,
      seq INTEGER NOT NULL CHECK (seq > 0),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      tool_calls_json TEXT CHECK (
        tool_calls_json IS NULL OR (role = 'assistant' AND json_valid(tool_calls_json) AND json_type(tool_calls_json) = 'array')
      ),
      tool_call_id TEXT CHECK (tool_call_id IS NULL OR role = 'tool'),
      tool_name TEXT CHECK (tool_name IS NULL OR role = 'tool'),
      proposals_json TEXT CHECK (
        proposals_json IS NULL OR (role = 'assistant' AND json_valid(proposals_json) AND json_type(proposals_json) = 'array')
      ),
      created_at TEXT NOT NULL,
      UNIQUE (thread_id, seq)
    );
    CREATE INDEX core_ai_messages_proposals ON core_ai_messages (thread_id) WHERE proposals_json IS NOT NULL;`
  },
  {
    version: 1004,
    name: 'core_settings',
    up: `CREATE TABLE core_settings (
      key TEXT PRIMARY KEY CHECK (length(key) > 0 AND key = trim(key)),
      value TEXT NOT NULL CHECK (json_valid(value)),
      updated_at TEXT NOT NULL
    );`
  }
]
