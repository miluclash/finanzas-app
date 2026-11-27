// Raíz de composición: el único sitio que conoce a la vez el núcleo y los módulos de la app.
//
// Está fuera de `core/` y de `modules/` a propósito: el núcleo no importa ningún módulo y los
// módulos no se importan entre sí; solo este archivo los junta. Añadir un módulo = añadirlo a
// APP_MODULES.
//
// De aquí salen también los tipos de la API que usa la interfaz (Handlers, ApiMethod, ApiResult,
// ApiArgs), con el tipo exacto de cada método.
import type { CoreContext } from './core/context'
import { CORE_MIGRATIONS } from './core/coreMigrations'
import { createCoreHandlers, type CoreHandlerOptions, type CoreHandlers, type DialogProvider } from './core/handlers'
import { createRegistry, mergeHandlers, type ModuleDeps, type Registry } from './core/registry'
import { entrenoModule } from './modules/entreno'
import { finanzasModule } from './modules/finanzas'

/** Módulos de la app, en el orden en que se siembran y se juntan sus handlers. */
export const APP_MODULES = [finanzasModule, entrenoModule] as const

/** Registro validado con las migraciones del núcleo y los módulos de la app. */
export function createAppRegistry(): Registry {
  return createRegistry(APP_MODULES, CORE_MIGRATIONS)
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never

/** Antepone `<P>:` a cada nombre de handler. */
type Prefixed<P extends string, H> = { [K in keyof H & string as `${P}:${K}`]: H[K] }

/** Handlers de un módulo con el prefijo de su id (cada módulo de APP_MODULES). */
type PrefixedModules = UnionToIntersection<
  (typeof APP_MODULES)[number] extends infer M
    ? M extends { id: infer I extends string; ipc: (...a: never[]) => infer H }
      ? Prefixed<I, H>
      : never
    : never
>

export type Handlers = Prefixed<'core', CoreHandlers> & PrefixedModules
export type ApiMethod = keyof Handlers
export type ApiResult<K extends ApiMethod> = Awaited<ReturnType<Handlers[K]>>
export type ApiArgs<K extends ApiMethod> = Parameters<Handlers[K]>

/**
 * Handlers del núcleo y de todos los módulos del registro del contexto. Lanza error si dos usan
 * el mismo nombre.
 */
export function createAppHandlers(ctx: CoreContext, dialogs: DialogProvider, appVersion = '0.0.0', opts: CoreHandlerOptions = {}): Handlers {
  const deps: ModuleDeps = { dialogs, appVersion }
  const merged = mergeHandlers([
    { owner: 'core', handlers: createCoreHandlers(ctx, dialogs, appVersion, opts) },
    ...ctx.registry.modules.map((m) => ({ owner: m.id, handlers: m.ipc(ctx, deps) }))
  ])
  // `mergeHandlers` pierde el tipo de cada handler; el registro del contexto es el de APP_MODULES.
  return merged as Handlers
}
