// Estado de finanzas en el proceso principal: snapshot y contexto cacheados sobre la base del núcleo.
import { buildCtx, type Ctx } from '@shared/modules/finanzas/ctx'
import type { DataSnapshot } from '@shared/modules/finanzas/types'
import { createAppRegistry } from '../../app'
import { createCoreContext, initCore, type CoreContext, type CorePaths } from '../../core/context'
import type { Db } from '../../core/db'
import { loadSnapshot } from './store'

/** Un único `AppState` por contexto del núcleo (lo comparten los handlers y quien lo cree). */
const states = new WeakMap<CoreContext, AppState>()

export class AppState {
  private snapshot: DataSnapshot | null = null
  private ctxCache: { today: string; ctx: Ctx } | null = null

  private constructor(readonly core: CoreContext) {
    core.onChange(() => this.invalidate())
  }

  /** Estado de finanzas de un contexto (lo crea la primera vez). */
  static for(core: CoreContext): AppState {
    let s = states.get(core)
    if (!s) {
      s = new AppState(core)
      states.set(core, s)
    }
    return s
  }

  /** Crea el contexto del núcleo con los módulos de la app, migra, siembra y devuelve el estado. */
  static init(db: Db, paths: CorePaths): AppState {
    const core = createCoreContext(db, paths, createAppRegistry())
    initCore(core)
    return AppState.for(core)
  }

  get db(): Db {
    return this.core.db
  }

  get paths(): CorePaths {
    return this.core.paths
  }

  /** Permite fijar la fecha de hoy en tests. */
  get todayOverride(): string | null {
    return this.core.todayOverride
  }

  set todayOverride(v: string | null) {
    this.core.todayOverride = v
  }

  /** Sustituye la base de datos (restaurar copia). */
  replaceDb(db: Db): void {
    this.core.replaceDb(db)
  }

  invalidate(): void {
    this.snapshot = null
    this.ctxCache = null
  }

  today(): string {
    return this.core.today()
  }

  snap(): DataSnapshot {
    if (!this.snapshot) this.snapshot = loadSnapshot(this.db)
    return this.snapshot
  }

  ctx(): Ctx {
    const today = this.today()
    if (!this.ctxCache || this.ctxCache.today !== today) this.ctxCache = { today, ctx: buildCtx(this.snap(), today) }
    return this.ctxCache.ctx
  }

  now(): string {
    return new Date().toISOString()
  }
}
