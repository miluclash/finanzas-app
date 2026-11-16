// Cola de escritura: la única vía para modificar la base de datos. Fuera de una operación de la
// cola, `Db.run`/`exec`/`tx` lanzan error (ver db.ts).
//
// Etiquetas: `<modulo>:<accion>` (`finanzas:tx.save`, `core:backup.restore`, `core:migrar`…).
//
// Las operaciones se ejecutan de una en una, en el orden en que llegan (FIFO), encadenadas
// con promesas y sin temporizadores. Cada operación es una transacción: si falla se deshace,
// su promesa se rechaza con el error original y la cola sigue con la siguiente.
//
// Ojo: dentro de una operación o de una tarea NO se puede esperar (`await`) a otra operación
// encolada con `enqueue`/`enqueueTask`: la nueva espera a que termine la actual y la actual
// espera a la nueva, así que ninguna acaba nunca.
import { audit } from './audit'
import { SaveError, type Db } from './db'

export interface AuditEntry {
  entity: string
  entityId: string
  action: string
  summary: string | null
  before?: unknown
  after?: unknown
}

export interface OpOptions {
  /** Se ejecuta en el turno de la operación, fuera de la transacción (p. ej. copias de seguridad). */
  before?: () => void | Promise<void>
  /** Entrada de `audit_log` que se escribe dentro de la misma transacción. */
  audit?: AuditEntry
}

export interface TaskContext {
  /** Ejecuta una operación transaccional síncrona sobre la base actual dentro del turno de la tarea. */
  runOp<R>(label: string, fn: () => R, opts?: { audit?: AuditEntry }): R
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === 'object' || typeof v === 'function') &&
    typeof (v as { then?: unknown }).then === 'function'
  )
}

export class WriteQueue {
  /** Final de la cadena: la siguiente operación empieza cuando esta promesa se resuelve. */
  private tail: Promise<void> = Promise.resolve()
  /** Operaciones encoladas que aún no han terminado (la que está en curso incluida). */
  private pending = 0
  /** Hay un `runNow` en curso. */
  private syncRunning = false
  private idleWaiters: Array<() => void> = []
  /** Ver `committedCount`. */
  private committed = 0

  /** `getDb` y no la `Db` directamente: restaurar una copia sustituye la base. */
  constructor(private readonly getDb: () => Db) {}

  /** Hay algo en curso o pendiente. */
  get busy(): boolean {
    return this.pending > 0 || this.syncRunning
  }

  /**
   * Operaciones confirmadas desde que se creó la cola (también las que no se pudieron guardar en
   * disco: el cambio sí está hecho en memoria). Sirve para saber si ha entrado alguna escritura
   * desde un momento dado (p. ej. desde la última copia `sin-guardar`).
   */
  get committedCount(): number {
    return this.committed
  }

  /** Hay cambios confirmados en memoria que falta guardar en disco (falló un guardado). */
  get hasPendingSave(): boolean {
    return this.getDb().hasPendingSave
  }

  /** Encola una operación síncrona que se ejecuta dentro de una transacción. */
  enqueue<T>(label: string, fn: () => T, opts: OpOptions = {}): Promise<T> {
    return this.schedule(async () => {
      if (opts.before) await opts.before()
      return this.execOp(label, fn, opts.audit)
    })
  }

  /**
   * Encola una tarea asíncrona con turno exclusivo y SIN transacción (p. ej. restaurar una
   * copia `.sqlite`, que cambia la `Db`). Para escribir, usa `ctx.runOp`.
   */
  enqueueTask<T>(label: string, task: (ctx: TaskContext) => Promise<T>): Promise<T> {
    return this.schedule(async () => {
      let open = true
      const ctx: TaskContext = {
        runOp: <R>(opLabel: string, fn: () => R, opts?: { audit?: AuditEntry }): R => {
          if (!open) throw new Error(`La tarea «${label}» ya ha terminado: no puede ejecutar «${opLabel}».`)
          return this.execOp(opLabel, fn, opts?.audit)
        }
      }
      try {
        return await task(ctx)
      } finally {
        open = false
      }
    })
  }

  /**
   * Igual que `enqueue`, pero síncrono. Solo se puede usar con la cola libre (nada en curso ni
   * pendiente) y sin operación abierta; si no, lanza error.
   */
  runNow<T>(label: string, fn: () => T, opts: { before?: () => void; audit?: AuditEntry } = {}): T {
    if (this.busy) throw new Error(`No se puede ejecutar «${label}» ahora: la cola de escritura está ocupada.`)
    if (this.getDb().inOp) throw new Error(`No se puede ejecutar «${label}» ahora: hay una operación abierta.`)
    this.syncRunning = true
    try {
      if (opts.before) {
        const r: unknown = opts.before()
        if (isThenable(r)) {
          Promise.resolve(r).catch(() => undefined)
          throw new Error(`El paso previo de «${label}» ha devuelto una promesa: en runNow tiene que ser síncrono.`)
        }
      }
      return this.execOp(label, fn, opts.audit)
    } finally {
      this.syncRunning = false
      if (this.pending === 0) this.notifyIdle()
    }
  }

  /** Se resuelve cuando la cola se queda vacía. */
  onIdle(): Promise<void> {
    if (!this.busy) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  /** Reintenta el guardado en disco que quedó pendiente (si lo hay). */
  flush(): void {
    this.getDb().flush()
  }

  private schedule<T>(work: () => Promise<T>): Promise<T> {
    this.pending++
    const run = async (): Promise<T> => {
      try {
        return await work()
      } finally {
        // Se descuenta antes de resolver la promesa del llamante: quien hace
        // `await queue.enqueue(...)` ya ve la cola libre si no queda nada más.
        this.pending--
        if (this.pending === 0) this.notifyIdle()
      }
    }
    const result = this.tail.then(run)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private notifyIdle(): void {
    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const w of waiters) w()
  }

  /** beginOp → fn → auditoría → commitOp; si algo falla antes de confirmar, rollbackOp. */
  private execOp<R>(label: string, fn: () => R, entry: AuditEntry | undefined): R {
    const db = this.getDb()
    db.beginOp()
    let result: R
    try {
      result = fn()
      if (isThenable(result)) {
        // Evita un rechazo sin capturar; lo que la promesa haga después ya queda fuera de la operación.
        Promise.resolve(result).catch(() => undefined)
        throw new Error(
          `La operación «${label}» ha devuelto una promesa: las operaciones de la cola tienen que ser síncronas.`
        )
      }
      if (entry) {
        audit(db, entry.entity, entry.entityId, entry.action, entry.summary, entry.before ?? null, entry.after ?? null)
      }
    } catch (e) {
      try {
        db.rollbackOp()
      } catch {
        // Se conserva el error original de la operación.
      }
      throw e
    }
    // Si el guardado en disco falla, `commitOp` deja los cambios confirmados y lanza SaveError:
    // también cuenta como operación confirmada.
    try {
      db.commitOp()
    } catch (e) {
      if (e instanceof SaveError) this.committed++
      throw e
    }
    this.committed++
    return result
  }
}
