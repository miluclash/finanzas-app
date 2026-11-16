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
 * Escrituras: solo dentro de una operación de la cola de escritura (`beginOp` … `commitOp` /
 * `rollbackOp`, que abre `WriteQueue`). Fuera de una operación, `run`, `exec` y `tx` lanzan
 * siempre "Escritura fuera de la cola: …". Las lecturas (`all`, `get`) son libres.
 *
 * Dentro de una operación hay una única transacción externa; `tx` usa siempre SAVEPOINT y nada
 * se guarda en disco hasta `commitOp`, que guarda una sola vez y solo si hubo cambios.
 * `onChange` se llama en los mismos momentos que antes de la cola (al cerrar la `tx` de servicio
 * más externa o tras un `run`/`exec` suelto), y además al confirmar o deshacer la operación, para
 * que las cachés se invaliden igual que siempre.
 */
export class Db {
  /** Niveles de `tx` abiertos (sin contar la transacción externa de la cola). */
  private depth = 0
  /** Operación de la cola en curso (null si no hay ninguna). */
  private op: OpMarks | null = null
  /** Hay cambios confirmados en memoria que no se han podido guardar en disco. */
  private pendingPersist = false
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

  /**
   * Abre una base a partir de sus bytes y la vincula a `filePath` (sin leer ni escribir el archivo).
   * Se usa al restaurar una copia: la base nueva existe antes de sustituir el archivo.
   */
  static async fromBuffer(buf: Uint8Array, filePath: string): Promise<Db> {
    const SQL = await loadSql()
    return new Db(new SQL.Database(buf), filePath)
  }

  /**
   * Abre una base a partir de sus bytes, en memoria y sin archivo: guardar no escribe nada en disco.
   * No es de solo lectura (dentro de la cola se puede escribir en ella). Se usa para validar copias
   * antes de restaurar y para restaurar sin `dbPath`.
   */
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

  /** Hay cambios confirmados en memoria que falta guardar en disco (falló un guardado). */
  get hasPendingSave(): boolean {
    return this.pendingPersist
  }

  run(sql: string, params?: Params): void {
    this.checkInOp(sql)
    this.db.run(sql, params as never)
    this.afterWrite()
  }

  exec(sql: string): void {
    this.checkInOp(sql)
    this.db.exec(sql)
    this.afterWrite()
  }

  changes(): number {
    return this.db.getRowsModified()
  }

  /** Fuera de una operación de la cola no se puede escribir, nunca. */
  private checkInOp(what: string): void {
    if (!this.op) {
      const resumen = what.replace(/\s+/g, ' ').trim().slice(0, 80)
      throw new Error(`Escritura fuera de la cola: ${resumen}`)
    }
  }

  private afterWrite(): void {
    // Dentro de una tx de servicio se avisa al cerrarla. Una escritura suelta avisa al momento
    // (como hacía el autocommit de antes); el guardado en disco espera a `commitOp`.
    if (this.depth === 0) this.onChange?.()
  }

  /** Ejecuta `fn` dentro de una transacción (SAVEPOINT, anidable). Si falla, deshace su parte. */
  tx<T>(fn: () => T): T {
    this.checkInOp('transacción')
    const level = this.depth
    const sp = `sp${level}`
    this.db.run(`SAVEPOINT ${sp}`)
    this.depth = level + 1
    let result: T
    try {
      result = fn()
    } catch (e) {
      this.depth = level
      this.db.run(`ROLLBACK TO ${sp}; RELEASE ${sp}`)
      throw e
    }
    this.depth = level
    this.db.run(`RELEASE ${sp}`)
    // Fin de la tx de servicio más externa: invalidar cachés (el guardado lo hace `commitOp`).
    if (level === 0) this.onChange?.()
    return result
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
   * lanza `SaveError`. Si queda una `tx` de servicio abierta, deshace la operación y lanza.
   */
  commitOp(): void {
    const start = this.op
    if (!start) throw new Error('No hay ninguna operación de la cola abierta.')
    if (this.depth > 0) {
      // Se deshace la operación para no dejarla abierta para siempre (bloquearía la base).
      try {
        this.rollbackOp()
      } catch {
        // Se conserva el error de abajo, que es el que explica qué ha pasado.
      }
      throw new Error('No se puede cerrar la operación con una transacción de servicio abierta.')
    }
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

  /**
   * Guarda en disco de forma atómica (archivo temporal + renombrado). No es para uso general:
   * solo la llaman `commitOp` y `flush`. Es pública únicamente para poder espiarla en los tests.
   */
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
    try {
      fs.writeFileSync(tmp, Buffer.from(data))
    } catch (e) {
      // Con el disco lleno puede quedar un temporal a medias: fuera.
      try {
        fs.rmSync(tmp, { force: true })
      } catch {
        // Se conserva el error original.
      }
      throw e
    }
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
