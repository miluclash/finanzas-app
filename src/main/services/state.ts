// Estado del proceso principal: base de datos abierta + snapshot y contexto cacheados.
import { buildCtx, type Ctx } from '@shared/domain/ctx'
import { todayISO } from '@shared/dates'
import type { DataSnapshot } from '@shared/types'
import type { Db } from '../db/db'
import { migrate } from '../db/migrations'
import { loadSnapshot, seedIfEmpty } from '../db/store'

export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

export class AppState {
  private snapshot: DataSnapshot | null = null
  private ctxCache: { today: string; ctx: Ctx } | null = null
  /** Permite fijar la fecha de hoy en tests. */
  todayOverride: string | null = null

  constructor(
    public db: Db,
    public readonly paths: { dbPath: string | null; backupsDir: string | null }
  ) {
    db.onChange = () => this.invalidate()
  }

  static init(db: Db, paths: { dbPath: string | null; backupsDir: string | null }): AppState {
    migrate(db)
    seedIfEmpty(db)
    return new AppState(db, paths)
  }

  /** Sustituye la base de datos (restaurar copia). */
  replaceDb(db: Db): void {
    this.db.onChange = null
    this.db = db
    db.onChange = () => this.invalidate()
    this.invalidate()
  }

  invalidate(): void {
    this.snapshot = null
    this.ctxCache = null
  }

  today(): string {
    return this.todayOverride ?? todayISO()
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
