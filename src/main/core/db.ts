// Acceso a SQLite (sql.js / WebAssembly) con guardado atómico en disco.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'

let SQL: SqlJsStatic | null = null

async function loadSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  const req = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url)
  const dir = path.dirname(req.resolve('sql.js'))
  const wasm = fs.readFileSync(path.join(dir, 'sql-wasm.wasm'))
  const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer
  SQL = await initSqlJs({ wasmBinary })
  return SQL
}

export type Params = Record<string, SqlValue> | SqlValue[]

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export class Db {
  private depth = 0
  private dirty = false
  /** Se llama tras cada escritura confirmada (para invalidar cachés). */
  onChange: (() => void) | null = null

  private constructor(
    private db: Database,
    readonly filePath: string | null
  ) {
    this.applyPragmas()
  }

  static async open(filePath: string | null): Promise<Db> {
    const SQL = await loadSql()
    let db: Database
    if (filePath && fs.existsSync(filePath)) {
      db = new SQL.Database(new Uint8Array(fs.readFileSync(filePath)))
    } else {
      db = new SQL.Database()
    }
    return new Db(db, filePath)
  }

  /** Abre un archivo SQLite sin vincularlo (para validar copias antes de restaurar). */
  static async openReadOnlyBuffer(buf: Uint8Array): Promise<Db> {
    const SQL = await loadSql()
    return new Db(new SQL.Database(buf), null)
  }

  private applyPragmas(): void {
    this.db.run('PRAGMA foreign_keys = ON;')
  }

  all<T = Record<string, unknown>>(sql: string, params?: Params): T[] {
    const stmt = this.db.prepare(sql)
    try {
      if (params) stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T = Record<string, unknown>>(sql: string, params?: Params): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  run(sql: string, params?: Params): void {
    this.db.run(sql, params as never)
    if (this.depth === 0) this.commitWrite()
    else this.dirty = true
  }

  exec(sql: string): void {
    this.db.exec(sql)
    if (this.depth === 0) this.commitWrite()
    else this.dirty = true
  }

  changes(): number {
    return this.db.getRowsModified()
  }

  /** Ejecuta `fn` dentro de una transacción (anidable con SAVEPOINT). Si falla, deshace todo. */
  tx<T>(fn: () => T): T {
    const sp = `sp${this.depth}`
    if (this.depth === 0) this.db.run('BEGIN')
    else this.db.run(`SAVEPOINT ${sp}`)
    this.depth++
    try {
      const result = fn()
      this.depth--
      if (this.depth === 0) {
        this.db.run('COMMIT')
        if (this.dirty) {
          this.dirty = false
          this.commitWrite()
        }
      } else this.db.run(`RELEASE ${sp}`)
      return result
    } catch (e) {
      this.depth--
      if (this.depth === 0) {
        this.db.run('ROLLBACK')
        this.dirty = false
      } else this.db.run(`ROLLBACK TO ${sp}; RELEASE ${sp}`)
      throw e
    }
  }

  private commitWrite(): void {
    this.persist()
    this.onChange?.()
  }

  /** Guarda en disco de forma atómica (archivo temporal + renombrado). */
  persist(): void {
    if (!this.filePath) return
    const data = this.db.export()
    // export() reabre la base de datos internamente: hay que volver a activar las claves foráneas
    this.applyPragmas()
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, Buffer.from(data))
    let lastErr: unknown = null
    for (let i = 0; i < 8; i++) {
      try {
        fs.renameSync(tmp, this.filePath)
        return
      } catch (e) {
        lastErr = e
        sleepSync(50 * (i + 1))
      }
    }
    throw lastErr
  }

  exportBytes(): Uint8Array {
    const data = this.db.export()
    this.applyPragmas()
    return data
  }

  close(): void {
    this.db.close()
  }
}
