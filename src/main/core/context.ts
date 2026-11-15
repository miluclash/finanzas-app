// Contexto del núcleo: la base de datos abierta, las rutas, la cola de escritura y el registro de
// módulos. Lo comparten todos los módulos.
//
// Las rutas llegan siempre como parámetro: el núcleo no lee FINANZAS_DATA_DIR ni `app.getPath`.
// Con `dbPath`/`backupsDir` a null (tests, línea base del dorado) no se escribe ningún archivo.
//
// Ojo: importa `createBackup` de backup.ts, que a su vez importa `coreOf` de aquí. Es un ciclo
// inofensivo (ninguno de los dos usa al otro al cargarse, solo dentro de funciones).
import { todayISO } from '@shared/dates'
import { createBackup } from './backup'
import type { Db } from './db'
import { hasTables, migrate, pendingMigrations } from './migrations'
import type { Registry } from './registry'
import { WriteQueue } from './writeQueue'

export interface CorePaths {
  dbPath: string | null
  backupsDir: string | null
}

export class CoreContext {
  private current: Db
  private readonly listeners = new Set<() => void>()
  /** Cola de escritura: la única vía para modificar la base. */
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
 * Arranque de la base, síncrono y por la cola (`runNow`: al arrancar la cola está libre):
 *
 * 1. Si hay migraciones pendientes, la base ya tenía tablas y hay carpeta de copias, copia
 *    `antes-de-migrar` en el paso previo de la primera operación.
 * 2. Migraciones pendientes de todos los módulos, en orden de versión, una operación cada una.
 * 3. La semilla de cada módulo (`<modulo>:semilla`), en el orden del registro.
 *
 * Abrir una base que ya está al día no guarda nada (no toca el archivo).
 */
export function initCore(ctx: CoreContext): void {
  const db = ctx.db
  const needsBackup =
    !!ctx.paths.backupsDir && pendingMigrations(db, ctx.registry.migrations).length > 0 && hasTables(db)
  let first = true
  migrate(db, ctx.registry.migrations, (label, fn) => {
    const before = first && needsBackup ? () => void createBackup(ctx, 'antes-de-migrar') : undefined
    first = false
    ctx.queue.runNow(label, fn, before ? { before } : {})
  })
  for (const m of ctx.registry.modules) {
    const seed = m.seed
    if (seed) ctx.queue.runNow(`${m.id}:semilla`, () => seed(ctx.db))
  }
}

/** Las funciones del núcleo aceptan el contexto o cualquier objeto que lo lleve (p. ej. `AppState`). */
export type CoreRef = CoreContext | { readonly core: CoreContext }

export function coreOf(ref: CoreRef): CoreContext {
  return ref instanceof CoreContext ? ref : ref.core
}
