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

/**
 * Error al guardar en disco al cerrar una operación de la cola. Los cambios ya están
 * confirmados en memoria; el siguiente guardado (o `flush()`) vuelve a intentarlo.
 */
export class SaveError extends Error {
  constructor(cause: unknown) {
    super(
      'Los cambios están hechos, pero no se han podido guardar en disco. Se reintentará en el siguiente guardado.',
      { cause }
    )
    this.name = 'SaveError'
  }
}

/** Contadores que permiten saber si una operación de la cola ha cambiado algo. */
interface OpMarks {
  totalChanges: number
  schemaVersion: number
  userVersion: number
}

/*
 * Dos modos de escritura conviven mientras dura la migración a la cola:
 *
 * - Modo antiguo (fuera de una operación): cada `run`/`exec` suelto se guarda en disco al
 *   momento y `tx` de nivel superior guarda al hacer COMMIT. Se elimina cuando todo pase
 *   por la cola.
 * - Operación de la cola (`beginOp` … `commitOp`/`rollbackOp`): una única transacción
 *   externa. Dentro, `tx` usa siempre SAVEPOINT y nada se guarda en disco hasta `commitOp`.
 *   `onChange` se sigue llamando en los mismos momentos que en el modo antiguo (al cerrar
 *   la `tx` de servicio más externa o tras un `run`/`exec` suelto) para que las cachés se
 *   invaliden igual que antes.
 *
 * Con `guard = true`, cualquier escritura fuera de una operación de la cola lanza error.
 */
export class Db {
  /** Niveles de `tx` abiertos (sin contar la transacción externa de la cola). */
  private depth = 0
  private dirty = false
  /** Operación de la cola en curso (null si no hay ninguna). */
  private op: OpMarks | null = null
  /** Hay cambios confirmados en memoria que no se han podido guardar en disco. */
  private pendingPersist = false
  /** Se llama tras cada escritura confirmada (para invalidar cachés). */
  onChange: (() => void) | null = null
  /** Si está activa, las escrituras fuera de la cola de escritura lanzan error. */
  guard = false

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

  /** Hay una operación de la cola abierta. */
  get inOp(): boolean {
    return this.op !== null
  }

  run(sql: string, params?: Params): void {
    this.checkGuard(sql)
    this.db.run(sql, params as never)
    this.afterWrite()
  }

  exec(sql: string): void {
    this.checkGuard(sql)
    this.db.exec(sql)
    this.afterWrite()
  }

  changes(): number {
    return this.db.getRowsModified()
  }

  private checkGuard(what: string): void {
    if (this.guard && !this.op) {
      const resumen = what.replace(/\s+/g, ' ').trim().slice(0, 80)
      throw new Error(`Escritura fuera de la cola: ${resumen}`)
    }
  }

  private afterWrite(): void {
    if (this.depth > 0) {
      // Dentro de una tx: se guarda (modo antiguo) o se avisa (operación) al cerrarla.
      if (!this.op) this.dirty = true
    } else if (this.op) {
      // Escritura suelta dentro de una operación: se invalida como en el autocommit de antes,
      // pero el guardado en disco espera a `commitOp`.
      this.onChange?.()
    } else {
      this.commitWrite()
    }
  }

  /** Ejecuta `fn` dentro de una transacción (anidable con SAVEPOINT). Si falla, deshace todo. */
  tx<T>(fn: () => T): T {
    this.checkGuard('transacción')
    const level = this.depth
    const sp = `sp${level}`
    // Solo el modo antiguo abre una transacción real; dentro de una operación todo es SAVEPOINT.
    const outer = level === 0 && !this.op
    if (outer) this.db.run('BEGIN')
    else this.db.run(`SAVEPOINT ${sp}`)
    this.depth = level + 1
    let result: T
    try {
      result = fn()
    } catch (e) {
      this.depth = level
      if (outer) {
        this.db.run('ROLLBACK')
        this.dirty = false
      } else this.db.run(`ROLLBACK TO ${sp}; RELEASE ${sp}`)
      throw e
    }
    this.depth = level
    if (outer) {
      try {
        this.db.run('COMMIT')
      } catch (e) {
        this.dirty = false
        try {
          this.db.run('ROLLBACK')
        } catch {
          // Si SQLite ya cerró la transacción no hay nada que deshacer.
        }
        throw e
      }
      if (this.dirty) {
        this.dirty = false
        this.commitWrite()
      }
    } else {
      this.db.run(`RELEASE ${sp}`)
      // Fin de la tx de servicio más externa dentro de una operación: invalidar sin guardar.
      if (this.op && level === 0) this.onChange?.()
    }
    return result
  }

  private commitWrite(): void {
    try {
      this.persist()
    } catch (e) {
      // Igual que antes, el error sale tal cual; además se apunta para que el siguiente
      // guardado de la cola lo reintente aunque no haya cambios.
      this.pendingPersist = true
      throw e
    }
    this.onChange?.()
  }

  private marks(): OpMarks {
    const n = (sql: string): number => {
      const res = this.db.exec(sql)
      return Number(res[0]?.values[0]?.[0] ?? 0)
    }
    return {
      totalChanges: n('SELECT total_changes()'),
      schemaVersion: n('PRAGMA schema_version'),
      userVersion: n('PRAGMA user_version')
    }
  }

  /** Abre la transacción externa de una operación de la cola. No se puede anidar. */
  beginOp(): void {
    if (this.op) throw new Error('Ya hay una operación de la cola abierta: no se puede anidar.')
    if (this.depth > 0) throw new Error('No se puede empezar una operación de la cola dentro de una transacción.')
    const marks = this.marks()
    this.db.run('BEGIN')
    this.op = marks
  }

  /**
   * Confirma la operación de la cola. Si ha cambiado algo (o había un guardado pendiente),
   * guarda en disco. Si el guardado falla, los cambios quedan confirmados en memoria y se
   * lanza `SaveError`.
   */
  commitOp(): void {
    const start = this.op
    if (!start) throw new Error('No hay ninguna operación de la cola abierta.')
    if (this.depth > 0) throw new Error('No se puede cerrar la operación con una transacción de servicio abierta.')
    const end = this.marks()
    const changed =
      end.totalChanges !== start.totalChanges ||
      end.schemaVersion !== start.schemaVersion ||
      end.userVersion !== start.userVersion
    try {
      this.db.run('COMMIT')
    } catch (e) {
      this.op = null
      try {
        this.db.run('ROLLBACK')
      } catch {
        // Si SQLite ya cerró la transacción no hay nada que deshacer.
      }
      this.onChange?.()
      throw e
    }
    this.op = null
    if (changed || this.pendingPersist) {
      try {
        this.persist()
      } catch (e) {
        this.pendingPersist = true
        this.onChange?.()
        throw new SaveError(e)
      }
    }
    this.onChange?.()
  }

  /** Deshace la operación de la cola. */
  rollbackOp(): void {
    if (!this.op) throw new Error('No hay ninguna operación de la cola abierta.')
    this.op = null
    this.depth = 0
    this.dirty = false
    try {
      this.db.run('ROLLBACK')
    } finally {
      this.onChange?.()
    }
  }

  /** Reintenta un guardado que falló. No hace nada si no hay nada pendiente. */
  flush(): void {
    if (!this.pendingPersist) return
    try {
      this.persist()
    } catch (e) {
      throw new SaveError(e)
    }
  }

  private assertNoTransaction(what: string): void {
    // `export()` de sql.js cierra y reabre la base: se perdería la transacción abierta.
    if (this.op || this.depth > 0) throw new Error(`No se puede ${what} con una transacción abierta.`)
  }

  /** Guarda en disco de forma atómica (archivo temporal + renombrado). */
  persist(): void {
    this.assertNoTransaction('guardar en disco')
    if (!this.filePath) {
      this.pendingPersist = false
      return
    }
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
        this.pendingPersist = false
        return
      } catch (e) {
        lastErr = e
        sleepSync(50 * (i + 1))
      }
    }
    throw lastErr
  }

  exportBytes(): Uint8Array {
    this.assertNoTransaction('exportar la base')
    const data = this.db.export()
    this.applyPragmas()
    return data
  }

  close(): void {
    this.db.close()
  }
}
