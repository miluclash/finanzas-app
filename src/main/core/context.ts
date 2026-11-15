// Contexto del núcleo: la base de datos abierta, las rutas, la cola de escritura y el registro de
// módulos. Lo comparten todos los módulos.
//
// Las rutas llegan siempre como parámetro: el núcleo no lee FINANZAS_DATA_DIR ni `app.getPath`.
// Con `dbPath`/`backupsDir` a null (tests, línea base del dorado) no se escribe ningún archivo.
import { todayISO } from '@shared/dates'
import type { Db } from './db'
import { migrate } from './migrations'
import type { Registry } from './registry'
import { WriteQueue } from './writeQueue'

export interface CorePaths {
  dbPath: string | null
  backupsDir: string | null
}

export class CoreContext {
  private current: Db
  private readonly listeners = new Set<() => void>()
  /** Cola de escritura de la base (en esta fase todavía no se usa). */
  readonly queue: WriteQueue
  /** Permite fijar la fecha de hoy en tests. */
  todayOverride: string | null = null

  /** Reparte el aviso de cambios de la base a todos los oyentes. */
  private readonly emitChange = (): void => {
    for (const l of [...this.listeners]) l()
  }

  constructor(
    db: Db,
    readonly paths: CorePaths,
    readonly registry: Registry
  ) {
    this.current = db
    db.onChange = this.emitChange
    this.queue = new WriteQueue(() => this.current)
  }

  /** Base de datos abierta (cambia al restaurar una copia). */
  get db(): Db {
    return this.current
  }

  today(): string {
    return this.todayOverride ?? todayISO()
  }

  /**
   * Avisa tras cada escritura confirmada y al sustituir la base (para que cada módulo invalide
   * su caché). Devuelve la función para darse de baja.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Sustituye la base de datos (restaurar copia). */
  replaceDb(db: Db): void {
    this.current.onChange = null
    this.current = db
    db.onChange = this.emitChange
    this.emitChange()
  }
}

/** Crea el contexto del núcleo. No toca la base. */
export function createCoreContext(db: Db, paths: CorePaths, registry: Registry): CoreContext {
  return new CoreContext(db, paths, registry)
}

/**
 * Arranque de la base: aplica las migraciones pendientes de todos los módulos (en orden de
 * versión) y después la semilla de cada módulo, en el orden del registro. Síncrono.
 */
export function initCore(ctx: CoreContext): void {
  migrate(ctx.db, ctx.registry.migrations)
  for (const m of ctx.registry.modules) m.seed?.(ctx.db)
}

/** Las funciones del núcleo aceptan el contexto o cualquier objeto que lo lleve (p. ej. `AppState`). */
export type CoreRef = CoreContext | { readonly core: CoreContext }

export function coreOf(ref: CoreRef): CoreContext {
  return ref instanceof CoreContext ? ref : ref.core
}
