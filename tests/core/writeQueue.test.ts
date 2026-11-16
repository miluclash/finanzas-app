// Contrato mínimo de la cola de escritura y del modo "operación" de Db.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Db, SaveError } from '../../src/main/core/db'
import { WriteQueue } from '../../src/main/core/writeQueue'

const dirs: string[] = []

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-cola-'))
  dirs.push(dir)
  return path.join(dir, 'prueba.sqlite')
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

async function setup(file: string | null = null): Promise<{ db: Db; q: WriteQueue }> {
  const db = await Db.open(file)
  const q = new WriteQueue(() => db)
  q.runNow('prueba:montar', () => db.exec('CREATE TABLE prueba (id INTEGER PRIMARY KEY, n INTEGER NOT NULL UNIQUE)'))
  return { db, q }
}

function ns(db: Db): number[] {
  return db.all<{ n: number }>('SELECT n FROM prueba ORDER BY id').map((r) => r.n)
}

describe('cola de escritura', () => {
  it('ejecuta en orden FIFO todas las operaciones lanzadas a la vez', async () => {
    const { db, q } = await setup()
    const orden: number[] = []
    const res = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        q.enqueue('prueba:alta', () => {
          orden.push(i)
          db.run('INSERT INTO prueba (n) VALUES (?)', [i])
          return i
        })
      )
    )
    expect(res).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(orden).toEqual(res)
    expect(ns(db)).toEqual(res)
    expect(q.busy).toBe(false)
  })

  it('si una operación falla se deshace, se rechaza y la siguiente se aplica', async () => {
    const { db, q } = await setup()
    const p1 = q.enqueue('prueba:a', () => db.run('INSERT INTO prueba (n) VALUES (1)'))
    const p2 = q.enqueue('prueba:b', () => {
      db.run('INSERT INTO prueba (n) VALUES (2)')
      throw new Error('fallo a propósito')
    })
    const p3 = q.enqueue('prueba:c', () => db.run('INSERT INTO prueba (n) VALUES (3)'))
    await expect(p1).resolves.toBeUndefined()
    await expect(p2).rejects.toThrow('fallo a propósito')
    await expect(p3).resolves.toBeUndefined()
    expect(ns(db)).toEqual([1, 3])
    expect(db.inOp).toBe(false)
  })

  it('un fallo en before rechaza la operación sin abrir transacción', async () => {
    const { db, q } = await setup()
    const fn = vi.fn(() => db.run('INSERT INTO prueba (n) VALUES (1)'))
    await expect(
      q.enqueue('prueba:a', fn, {
        before: () => {
          throw new Error('sin copia')
        }
      })
    ).rejects.toThrow('sin copia')
    expect(fn).not.toHaveBeenCalled()
    await q.enqueue('prueba:b', () => db.run('INSERT INTO prueba (n) VALUES (2)'))
    expect(ns(db)).toEqual([2])
  })

  it('una operación que devuelve una promesa se deshace y se rechaza', async () => {
    const { db, q } = await setup()
    await expect(
      q.enqueue('prueba:async', (() => {
        db.run('INSERT INTO prueba (n) VALUES (1)')
        return Promise.resolve()
      }) as () => unknown)
    ).rejects.toThrow('prueba:async')
    expect(ns(db)).toEqual([])
  })

  it('con archivo guarda una vez por operación con cambios y ninguna si no cambia nada', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const persist = vi.spyOn(db, 'persist')
    await q.enqueue('prueba:alta', () => {
      db.tx(() => {
        db.run('INSERT INTO prueba (n) VALUES (1)')
        db.run('INSERT INTO prueba (n) VALUES (2)')
      })
      db.run('INSERT INTO prueba (n) VALUES (3)')
    })
    expect(persist).toHaveBeenCalledTimes(1)
    // Sin cambios: CREATE IF NOT EXISTS sobre una tabla que ya existe e INSERT OR IGNORE ignorado.
    await q.enqueue('prueba:nada', () => {
      db.exec('CREATE TABLE IF NOT EXISTS prueba (id INTEGER PRIMARY KEY, n INTEGER NOT NULL UNIQUE)')
      db.run('INSERT OR IGNORE INTO prueba (n) VALUES (1)')
    })
    expect(persist).toHaveBeenCalledTimes(1)
    // Un cambio solo de esquema también se guarda.
    await q.enqueue('prueba:esquema', () => db.exec('CREATE TABLE otra (id INTEGER PRIMARY KEY)'))
    expect(persist).toHaveBeenCalledTimes(2)
    db.close()
    const reabierta = await Db.open(file)
    expect(ns(reabierta)).toEqual([1, 2, 3])
    reabierta.close()
  })

  it('si falla el guardado, los cambios quedan en memoria y se reintenta en el siguiente', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const real = db.persist.bind(db)
    const persist = vi.spyOn(db, 'persist').mockImplementationOnce(() => {
      throw new Error('disco lleno')
    })
    await expect(q.enqueue('prueba:alta', () => db.run('INSERT INTO prueba (n) VALUES (1)'))).rejects.toBeInstanceOf(
      SaveError
    )
    expect(ns(db)).toEqual([1])
    persist.mockImplementation(real)
    await q.enqueue('prueba:nada', () => undefined)
    expect(persist).toHaveBeenCalledTimes(2)
    db.close()
    const reabierta = await Db.open(file)
    expect(ns(reabierta)).toEqual([1])
    reabierta.close()
  })

  it('committedCount cuenta cada operación confirmada, también si falla el guardado, y no las deshechas', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    expect(q.committedCount).toBe(1) // la de montar
    await q.enqueue('prueba:a', () => db.run('INSERT INTO prueba (n) VALUES (1)'))
    expect(q.committedCount).toBe(2)
    // Una que falla y se deshace no cuenta.
    await expect(q.enqueue('prueba:mal', () => db.run('INSERT INTO prueba (n) VALUES (1)'))).rejects.toThrow()
    expect(q.committedCount).toBe(2)
    // Una confirmada cuyo guardado falla sí cuenta: el cambio está hecho en memoria.
    const persist = vi.spyOn(db, 'persist').mockImplementationOnce(() => {
      throw new Error('disco lleno')
    })
    await expect(q.enqueue('prueba:b', () => db.run('INSERT INTO prueba (n) VALUES (2)'))).rejects.toBeInstanceOf(SaveError)
    expect(q.committedCount).toBe(3)
    expect(q.hasPendingSave).toBe(true)
    persist.mockRestore()
    // Reintentar el guardado (flush) no es una operación: no cuenta.
    await q.enqueueTask('prueba:flush', async () => q.flush())
    expect(q.committedCount).toBe(3)
    expect(q.hasPendingSave).toBe(false)
    // Las operaciones de una tarea y las de runNow también cuentan.
    await q.enqueueTask('prueba:tarea', async ({ runOp }) => runOp('prueba:c', () => db.run('INSERT INTO prueba (n) VALUES (3)')))
    q.runNow('prueba:d', () => db.run('INSERT INTO prueba (n) VALUES (4)'))
    expect(q.committedCount).toBe(5)
    db.close()
  })

  it('si no se puede escribir el temporal al guardar, no queda ningún .tmp a medias', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const antes = fs.readFileSync(file)
    const real = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p, ...rest) => {
      if (String(p).endsWith('.tmp')) {
        real(p, 'a medias')
        throw Object.assign(new Error('ENOSPC: no queda espacio en el disco'), { code: 'ENOSPC' })
      }
      return real(p, ...(rest as [Parameters<typeof real>[1]]))
    })
    await expect(q.enqueue('prueba:a', () => db.run('INSERT INTO prueba (n) VALUES (1)'))).rejects.toBeInstanceOf(SaveError)
    vi.restoreAllMocks()
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(fs.readFileSync(file).equals(antes)).toBe(true)
    expect(q.hasPendingSave).toBe(true)
    db.close()
  })

  it('onChange se llama al cerrar una tx de servicio, tras un run suelto, al confirmar y en rollbackOp', async () => {
    const { db } = await setup()
    const onChange = vi.fn()
    db.onChange = onChange
    db.beginOp()
    db.tx(() => {
      db.tx(() => db.run('INSERT INTO prueba (n) VALUES (1)'))
      expect(onChange).not.toHaveBeenCalled()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(() =>
      db.tx(() => {
        db.run('INSERT INTO prueba (n) VALUES (2)')
        throw new Error('falla')
      })
    ).toThrow('falla')
    expect(onChange).toHaveBeenCalledTimes(1)
    db.run('INSERT INTO prueba (n) VALUES (3)')
    expect(onChange).toHaveBeenCalledTimes(2)
    db.commitOp()
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(ns(db)).toEqual([1, 3])

    db.beginOp()
    db.run('INSERT INTO prueba (n) VALUES (4)')
    expect(onChange).toHaveBeenCalledTimes(4)
    db.rollbackOp()
    expect(onChange).toHaveBeenCalledTimes(5)
    expect(ns(db)).toEqual([1, 3])
  })

  it('runNow funciona con la cola libre y lanza si está ocupada', async () => {
    const { db, q } = await setup()
    expect(q.runNow('prueba:ya', () => (db.run('INSERT INTO prueba (n) VALUES (1)'), 'hecho'))).toBe('hecho')
    const p = q.enqueue('prueba:luego', () => db.run('INSERT INTO prueba (n) VALUES (2)'))
    expect(q.busy).toBe(true)
    expect(() => q.runNow('prueba:ocupada', () => undefined)).toThrow('prueba:ocupada')
    await p
    await q.onIdle()
    expect(q.busy).toBe(false)
    expect(ns(db)).toEqual([1, 2])
  })

  it('enqueueTask da turno exclusivo y runOp escribe dentro de él', async () => {
    const { db, q } = await setup()
    const orden: string[] = []
    const t = q.enqueueTask('prueba:tarea', async ({ runOp }) => {
      orden.push('tarea:inicio')
      await new Promise((r) => setImmediate(r))
      runOp('prueba:dentro', () => db.run('INSERT INTO prueba (n) VALUES (1)'))
      orden.push('tarea:fin')
    })
    const o = q.enqueue('prueba:despues', () => {
      orden.push('op')
      db.run('INSERT INTO prueba (n) VALUES (2)')
    })
    await Promise.all([t, o])
    expect(orden).toEqual(['tarea:inicio', 'tarea:fin', 'op'])
    expect(ns(db)).toEqual([1, 2])
  })

  it('escribe la entrada de auditoría en la misma transacción', async () => {
    const { db, q } = await setup()
    q.runNow('prueba:montar', () =>
      db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, entity TEXT, entity_id TEXT,
        action TEXT, summary TEXT, before_json TEXT, after_json TEXT)`)
    )
    await q.enqueue('prueba:alta', () => db.run('INSERT INTO prueba (n) VALUES (1)'), {
      audit: { entity: 'prueba', entityId: '1', action: 'create', summary: 'Alta', after: { n: 1 } }
    })
    await expect(
      q.enqueue('prueba:falla', () => {
        throw new Error('no')
      }, { audit: { entity: 'prueba', entityId: '2', action: 'create', summary: null } })
    ).rejects.toThrow('no')
    const filas = db.all<{ entity_id: string; after_json: string | null }>('SELECT entity_id, after_json FROM audit_log')
    expect(filas).toEqual([{ entity_id: '1', after_json: '{"n":1}' }])
  })

  it('exportBytes dentro de una operación lanza', async () => {
    const { db } = await setup()
    db.beginOp()
    expect(() => db.exportBytes()).toThrow('transacción abierta')
    expect(() => db.beginOp()).toThrow('anidar')
    db.rollbackOp()
    expect(db.exportBytes().length).toBeGreaterThan(0)
  })

  it('la guarda está siempre activa: escribir fuera de la cola lanza y leer no', async () => {
    // Recién abierta, sin cola ni nada que activar: ya no se puede escribir.
    const suelta = await Db.open(null)
    expect('guard' in suelta).toBe(false)
    expect(() => suelta.exec('CREATE TABLE x (id INTEGER PRIMARY KEY)')).toThrow('Escritura fuera de la cola: CREATE TABLE x')
    suelta.close()
    const { db, q } = await setup()
    expect(() => db.run('INSERT INTO prueba (n) VALUES (1)')).toThrow('Escritura fuera de la cola')
    expect(() => db.exec('DELETE FROM prueba')).toThrow('Escritura fuera de la cola')
    expect(() => db.tx(() => undefined)).toThrow('Escritura fuera de la cola')
    expect(ns(db)).toEqual([])
    await q.enqueue('prueba:alta', () => db.tx(() => db.run('INSERT INTO prueba (n) VALUES (1)')))
    expect(ns(db)).toEqual([1])
  })

  it('commitOp con una tx de servicio abierta deshace la operación y no la deja abierta', async () => {
    const { db } = await setup()
    db.beginOp()
    db.run('INSERT INTO prueba (n) VALUES (1)')
    let error: unknown = null
    // Al volver de la tx su SAVEPOINT ya no existe (lo ha deshecho commitOp): también lanza.
    expect(() =>
      db.tx(() => {
        try {
          db.commitOp()
        } catch (e) {
          error = e
        }
      })
    ).toThrow()
    expect(String(error)).toContain('transacción de servicio abierta')
    expect(db.inOp).toBe(false)
    expect(ns(db)).toEqual([])
    // La base sigue usable: se puede abrir otra operación.
    db.beginOp()
    db.run('INSERT INTO prueba (n) VALUES (2)')
    db.commitOp()
    expect(ns(db)).toEqual([2])
  })
})
