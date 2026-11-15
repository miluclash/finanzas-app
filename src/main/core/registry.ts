// Registro de módulos. Cada sección de la app (finanzas, entreno…) es un módulo que se registra
// aquí con sus migraciones, sus handlers IPC y sus ganchos. El núcleo no conoce los detalles de
// ningún módulo: solo trabaja con esta interfaz (docs/EVOLUCION.md §3.1).
import type { CoreContext } from './context'
import type { Db } from './db'
import type { DialogProvider } from './handlers'
import { MIGRATION_RANGES, type Migration, type MigrationOwner, type VersionRange } from './migrations'

/** Identificadores de módulo. Cada uno tiene su rango de migraciones en `MIGRATION_RANGES`. */
export type ModuleId = Exclude<MigrationOwner, 'core'>

/**
 * Handler IPC. Los argumentos llegan de la interfaz; el tipo exacto de cada handler se conserva
 * en el objeto que devuelve `ipc` (de ahí sale el tipo de la API que usa la interfaz).
 */
export type Handler = (...args: never[]) => unknown
export type HandlerMap = Record<string, Handler>

/** Lo que el núcleo pasa a cada módulo para construir sus handlers. */
export interface ModuleDeps {
  dialogs: DialogProvider
  appVersion: string
}

/**
 * Métrica que un módulo expone al constructor de gráficos y a la IA local.
 * Marcador de posición: se define de verdad en la fase de gráficos. En F1 todos van vacíos.
 */
export interface MetricDef {
  id: string
  name: string
}

/**
 * Herramienta que la IA local puede usar. Marcador de posición: se define en la fase de IA local.
 */
export interface AiToolDef {
  name: string
  description: string
}

/** Importador declarado por un módulo. Marcador de posición (los importadores actuales van por `ipc`). */
export interface ImporterDef {
  id: string
  name: string
}

/** Exportador declarado por un módulo. Marcador de posición (los exportadores actuales van por `ipc`). */
export interface ExporterDef {
  id: string
  name: string
}

export interface AppModule<H extends HandlerMap = HandlerMap> {
  id: ModuleId
  /** Nombre visible de la sección. */
  name: string
  /** Migraciones del módulo; sus versiones tienen que caer en su rango de `MIGRATION_RANGES`. */
  migrations: readonly Migration[]
  /** Construye los handlers IPC del módulo (necesitan el contexto porque guardan estado). */
  ipc: (ctx: CoreContext, deps: ModuleDeps) => H
  metrics: readonly MetricDef[]
  aiTools: readonly AiToolDef[]
  importers?: readonly ImporterDef[]
  exporters?: readonly ExporterDef[]
  /** Datos iniciales. Se llama al arrancar, después de migrar; tiene que ser idempotente. */
  seed?(db: Db): void
  /** El módulo no tiene datos del usuario (para la pantalla de bienvenida). */
  isEmpty?(ctx: CoreContext): boolean
  /** Tablas que debe tener una copia `.sqlite` para aceptarla al restaurar. */
  requiredTables?: readonly string[]
  /**
   * Restaura una exportación JSON. Devuelve `false` si el JSON no es de este módulo (y no toca
   * nada) y `true` si lo reconoce y lo ha restaurado.
   */
  restoreJson?(ctx: CoreContext, obj: unknown): boolean
}

/** Ayuda para declarar un módulo conservando el tipo exacto de sus handlers. */
export function defineModule<H extends HandlerMap>(m: AppModule<H>): AppModule<H> {
  return m
}

export interface Registry {
  readonly modules: readonly AppModule[]
  /** Todas las migraciones (núcleo y módulos), ordenadas por versión. */
  readonly migrations: readonly Migration[]
  /** Tablas que tiene que tener una copia `.sqlite`: `schema_migrations` y las de cada módulo. */
  readonly requiredTables: readonly string[]
  get(id: ModuleId): AppModule | undefined
}

function checkRange(owner: string, range: VersionRange, migrations: readonly Migration[], seen: Map<number, string>): void {
  for (const m of migrations) {
    if (!Number.isInteger(m.version)) throw new Error(`Migración «${m.name}» de ${owner}: la versión tiene que ser un número entero.`)
    if (m.version < range[0] || m.version > range[1])
      throw new Error(`Migración ${m.version} («${m.name}») de ${owner}: fuera de su rango ${range[0]}–${range[1]}.`)
    const prev = seen.get(m.version)
    if (prev) throw new Error(`Versión de migración ${m.version} repetida (${prev} y ${owner}).`)
    seen.set(m.version, owner)
  }
}

/**
 * Crea el registro y lo valida: ids únicos, migraciones dentro del rango de su dueño y versiones
 * no repetidas. Los nombres de handler se validan al construirlos (`mergeHandlers`), porque solo
 * existen cuando hay un contexto.
 */
export function createRegistry(modules: readonly AppModule[], coreMigrations: readonly Migration[] = []): Registry {
  const ids = new Set<string>()
  for (const m of modules) {
    if (ids.has(m.id)) throw new Error(`Módulo registrado dos veces: ${m.id}.`)
    if (!(m.id in MIGRATION_RANGES) || m.id === ('core' as string)) throw new Error(`Módulo desconocido: ${m.id}.`)
    ids.add(m.id)
  }
  const seen = new Map<number, string>()
  checkRange('core', MIGRATION_RANGES.core, coreMigrations, seen)
  for (const m of modules) checkRange(m.id, MIGRATION_RANGES[m.id], m.migrations, seen)
  const migrations = [...coreMigrations, ...modules.flatMap((m) => m.migrations)].sort((a, b) => a.version - b.version)
  const requiredTables = ['schema_migrations', ...modules.flatMap((m) => m.requiredTables ?? [])]
  const list = [...modules]
  return {
    modules: list,
    migrations,
    requiredTables,
    get: (id) => list.find((m) => m.id === id)
  }
}

/**
 * Junta handlers de varios dueños (núcleo y módulos) en un solo objeto. Lanza error si dos
 * dueños usan el mismo nombre.
 */
export function mergeHandlers(groups: ReadonlyArray<{ owner: string; handlers: HandlerMap }>): HandlerMap {
  const out: HandlerMap = {}
  const owners = new Map<string, string>()
  for (const g of groups) {
    for (const [name, fn] of Object.entries(g.handlers)) {
      const prev = owners.get(name)
      if (prev) throw new Error(`Handler «${name}» repetido (${prev} y ${g.owner}).`)
      owners.set(name, g.owner)
      out[name] = fn
    }
  }
  return out
}
