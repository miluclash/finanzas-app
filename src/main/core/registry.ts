// Registro de módulos. Cada sección de la app (finanzas, entreno…) es un módulo que se registra
// aquí con sus migraciones, sus handlers IPC y sus ganchos. El núcleo no conoce los detalles de
// ningún módulo: solo trabaja con esta interfaz (docs/EVOLUCION.md §3.1).
import type { CoreContext } from './context'
import type { Db } from './db'
import type { DialogProvider } from './handlers'
import {
  DIMENSION_GROUPINGS,
  METRIC_AGGREGATIONS,
  METRIC_FILTER_KEYS,
  METRIC_PRESENTATIONS,
  METRIC_UNITS,
  TIME_GROUPINGS,
  type MetricDef as MetricContract,
  type MetricOption,
  type MetricOptionKind
} from '@shared/core/metrics-types'
import type { AiSuggestion, AiToolDef as AiToolContract } from '@shared/core/ai-types'
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
 * Métrica que un módulo expone al constructor de gráficos y a la IA local: el contrato de
 * `src/shared/core/metrics-types.ts`, con `compute` recibiendo el contexto del núcleo. El registro
 * comprueba al crearse que los ids son únicos en toda la app y que unidad, agregación,
 * agrupaciones, divisiones y filtros son valores del contrato.
 */
export type MetricDef = MetricContract<CoreContext>

/**
 * Herramienta que la IA local puede usar: el contrato de `src/shared/core/ai-types.ts` con el
 * contexto del núcleo. Las de lectura devuelven datos resumidos; las de acción solo proponen
 * cambios, que se escriben cuando Michael confirma.
 */
export type AiToolDef = AiToolContract<CoreContext>

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

export interface AppModule<H extends HandlerMap = HandlerMap, I extends ModuleId = ModuleId> {
  id: I
  /** Nombre visible de la sección. */
  name: string
  /** Migraciones del módulo; sus versiones tienen que caer en su rango de `MIGRATION_RANGES`. */
  migrations: readonly Migration[]
  /** Construye los handlers IPC del módulo (necesitan el contexto porque guardan estado). */
  ipc: (ctx: CoreContext, deps: ModuleDeps) => H
  /** Métricas para el constructor de gráficos (cada una con `module` = id de este módulo). */
  metrics: readonly MetricDef[]
  /**
   * Listas para los filtros del constructor (ejercicios, categorías, cuentas…). Devuelve null si
   * este módulo no conoce esa lista; el núcleo junta las respuestas de todos los módulos.
   */
  metricOptions?(ctx: CoreContext, kind: MetricOptionKind): MetricOption[] | null
  /** Herramientas de la IA local (nombres `<id>_<nombre>`, únicos en toda la app). */
  aiTools: readonly AiToolDef[]
  /**
   * Sugerencias que calcula el módulo (revisión semanal de entreno, avisos de finanzas). Funciones
   * puras sobre el estado en memoria: funcionan aunque Ollama esté apagado.
   */
  suggestions?(ctx: CoreContext): AiSuggestion[]
  importers?: readonly ImporterDef[]
  exporters?: readonly ExporterDef[]
  /**
   * Datos iniciales. Se llama al arrancar, después de migrar, dentro de su propia operación de la
   * cola (`<modulo>:semilla`); tiene que ser idempotente y no escribir nada si no hace falta.
   */
  seed?(db: Db): void
  /**
   * Paso de arranque. Se llama al arrancar, después de todas las semillas, dentro de su propia
   * operación de la cola (`<modulo>:arranque`), con el contexto (fecha de hoy incluida). Tiene que
   * ser idempotente y no escribir nada si no hace falta (abrir una base al día no toca el archivo).
   */
  startup?(ctx: CoreContext): void
  /** El módulo no tiene datos del usuario (para la pantalla de bienvenida). */
  isEmpty?(ctx: CoreContext): boolean
  /** Tablas que debe tener una copia `.sqlite` para aceptarla al restaurar. */
  requiredTables?: readonly string[]
  /**
   * Restaura una exportación JSON. Devuelve `false` si el JSON no es de este módulo (y no toca
   * nada) y `true` si lo reconoce y lo ha restaurado. Se llama dentro de una operación de la cola.
   */
  restoreJson?(ctx: CoreContext, obj: unknown): boolean
}

/** Ayuda para declarar un módulo conservando el tipo exacto de sus handlers. */
export function defineModule<H extends HandlerMap, const I extends ModuleId>(m: AppModule<H, I>): AppModule<H, I> {
  return m
}

export interface Registry {
  readonly modules: readonly AppModule[]
  /** Todas las migraciones (núcleo y módulos), ordenadas por versión. */
  readonly migrations: readonly Migration[]
  /** Tablas que tiene que tener una copia `.sqlite`: `schema_migrations` y las de cada módulo. */
  readonly requiredTables: readonly string[]
  /** Métricas de todos los módulos, en el orden del registro. */
  readonly metrics: readonly MetricDef[]
  get(id: ModuleId): AppModule | undefined
  metric(id: string): MetricDef | undefined
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

const GROUPINGS: readonly string[] = [...TIME_GROUPINGS, ...DIMENSION_GROUPINGS]

/** Comprueba las métricas de un módulo contra el contrato (y que sus ids no estén ya usados). */
function checkMetrics(m: AppModule, seen: Map<string, string>): void {
  const bad = (id: string, why: string) => new Error(`Métrica «${id}» de ${m.id}: ${why}`)
  const notIn = (xs: readonly unknown[], allowed: readonly string[]) => xs.find((x) => !allowed.includes(x as string))
  if (!Array.isArray(m.metrics))
    throw new Error(`El módulo ${m.id} no tiene lista de métricas (¿un ciclo de importaciones la deja sin definir al registrarlo?).`)
  for (const d of m.metrics) {
    if (typeof d.id !== 'string' || !d.id.trim()) throw new Error(`Métrica sin id en ${m.id}.`)
    const prev = seen.get(d.id)
    if (prev) throw new Error(`Id de métrica repetido: «${d.id}» (${prev} y ${m.id}).`)
    seen.set(d.id, m.id)
    if (d.module !== m.id) throw bad(d.id, `su módulo es «${String(d.module)}» y tiene que ser «${m.id}».`)
    if (typeof d.name !== 'string' || !d.name.trim()) throw bad(d.id, 'le falta el nombre.')
    if (!METRIC_UNITS.includes(d.unit)) throw bad(d.id, `unidad no válida «${String(d.unit)}».`)
    if (!METRIC_AGGREGATIONS.includes(d.aggregation)) throw bad(d.id, `agregación no válida «${String(d.aggregation)}».`)
    if (!Array.isArray(d.groupings) || d.groupings.length === 0) throw bad(d.id, 'tiene que admitir al menos una agrupación.')
    const g = notIn(d.groupings, GROUPINGS)
    if (g !== undefined) throw bad(d.id, `agrupación no válida «${String(g)}».`)
    if (!Array.isArray(d.splits)) throw bad(d.id, 'le falta la lista de divisiones (vacía si no admite ninguna).')
    const sp = notIn(d.splits, DIMENSION_GROUPINGS)
    if (sp !== undefined) throw bad(d.id, `división no válida «${String(sp)}».`)
    if (!Array.isArray(d.filters)) throw bad(d.id, 'le falta la lista de filtros (vacía si no admite ninguno).')
    const f = notIn(d.filters, METRIC_FILTER_KEYS)
    if (f !== undefined) throw bad(d.id, `filtro no válido «${String(f)}».`)
    if (d.presentation !== undefined && !METRIC_PRESENTATIONS.includes(d.presentation)) throw bad(d.id, `presentación no válida «${String(d.presentation)}».`)
    if (typeof d.compute !== 'function') throw bad(d.id, 'le falta la función de cálculo.')
  }
}

/**
 * Crea el registro y lo valida: ids únicos, migraciones dentro del rango de su dueño, versiones
 * no repetidas y métricas conformes al contrato (ids únicos en toda la app). Los nombres de handler se validan al construirlos (`mergeHandlers`), porque solo
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
  const metricIds = new Map<string, string>()
  for (const m of modules) checkMetrics(m, metricIds)
  const list = [...modules]
  const metrics = list.flatMap((m) => m.metrics)
  const byId = new Map(metrics.map((d) => [d.id, d]))
  return {
    modules: list,
    migrations,
    requiredTables,
    metrics,
    get: (id) => list.find((m) => m.id === id),
    metric: (id) => byId.get(id)
  }
}

/**
 * Junta handlers de varios dueños (núcleo y módulos) en un solo objeto. Los handlers de cada dueño
 * se definen sin prefijo; aquí se publican como `<dueño>:<nombre>` (`finanzas:tx.save`). Lanza
 * error si dos dueños usan el mismo nombre, si el id de un dueño contiene `:` o si un handler ya
 * viene con el prefijo de su dueño (o con otro).
 */
export function mergeHandlers(groups: ReadonlyArray<{ owner: string; handlers: HandlerMap }>): HandlerMap {
  const out: HandlerMap = {}
  const owners = new Map<string, string>()
  for (const g of groups) {
    if (!g.owner || g.owner.includes(':')) throw new Error(`Id de dueño no válido: «${g.owner}» (no puede estar vacío ni contener «:»).`)
    for (const [name, fn] of Object.entries(g.handlers)) {
      if (name.includes(':')) throw new Error(`Handler «${name}» de ${g.owner}: el nombre se define sin prefijo, lo añade el registro.`)
      const full = `${g.owner}:${name}`
      const prev = owners.get(full)
      if (prev) throw new Error(`Handler «${full}» repetido (${prev} y ${g.owner}).`)
      owners.set(full, g.owner)
      out[full] = fn
    }
  }
  return out
}
