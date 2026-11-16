// Batería de la cola de escritura: concurrencia, fallos, guardado, turnos, auditoría y guarda.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Db, SaveError } from '../../src/main/core/db'
import { WriteQueue } from '../../src/main/core/writeQueue'

const dirs: string[] = []

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-bateria-'))
  dirs.push(dir)
  return path.join(dir, 'prueba.sqlite')
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const AUDIT_SQL = `CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, entity TEXT NOT NULL,
  entity_id TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, before_json TEXT, after_json TEXT)`

async function setup(file: string | null = null): Promise<{ db: Db; q: WriteQueue }> {
  const db = await Db.open(file)
  const q = new WriteQueue(() => db)
  q.runNow('bateria:montar', () => db.exec('CREATE TABLE prueba (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER NOT NULL)'))
  return { db, q }
}

function ns(db: Db): number[] {
  return db.all<{ n: number }>('SELECT n FROM prueba ORDER BY id').map((r) => r.n)
}

const insertar = (db: Db, n: number): void => db.run('INSERT INTO prueba (n) VALUES (?)', [n])

async function reabrir(db: Db, file: string): Promise<number[]> {
  db.close()
  const r = await Db.open(file)
  const res = ns(r)
  r.close()
  return res
}

const rango = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i)

describe('batería de la cola de escritura', () => {
  it('100 escrituras en paralelo se resuelven todas, en orden, y persisten al reabrir', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const orden: number[] = []
    const res = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        q.enqueue('bateria:alta', () => {
          orden.push(i)
          insertar(db, i)
          return i
        })
      )
    )
    expect(res).toEqual(rango(0, 100))
    expect(orden).toEqual(rango(0, 100))
    expect(ns(db)).toEqual(rango(0, 100))
    expect(await reabrir(db, file)).toEqual(rango(0, 100))
  })

  it('si la nº 50 falla, se rechaza con su error y las otras 99 se aplican (también al reabrir)', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const promesas = Array.from({ length: 100 }, (_, i) =>
      q.enqueue('bateria:alta', () => {
        insertar(db, i)
        if (i === 50) throw new Error('fallo en la 50')
        return i
      })
    )
    const resultados = await Promise.allSettled(promesas)
    resultados.forEach((r, i) => {
      if (i === 50) {
        expect(r.status).toBe('rejected')
        expect((r as PromiseRejectedResult).reason).toEqual(new Error('fallo en la 50'))
      } else {
        expect(r).toEqual({ status: 'fulfilled', value: i })
      }
    })
    const esperado = rango(0, 100).filter((i) => i !== 50)
    expect(ns(db)).toEqual(esperado)
    expect(ns(db)).toContain(51)
    expect(await reabrir(db, file)).toEqual(esperado)
  })

  it('un fallo de una tx interna deshace solo esa parte y la op confirma el resto', async () => {
    const { db, q } = await setup()
    await q.enqueue('bateria:tx', () => {
      insertar(db, 1)
      expect(() =>
        db.tx(() => {
          insertar(db, 2)
          throw new Error('tx interna')
        })
      ).toThrow('tx interna')
      expect(ns(db)).toEqual([1])
      insertar(db, 3)
    })
    expect(ns(db)).toEqual([1, 3])
    expect(db.inOp).toBe(false)
  })

  it('guarda una vez por operación con cambios y ninguna si no cambia nada', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const persist = vi.spyOn(db, 'persist')
    await q.enqueue('bateria:alta', () => insertar(db, 1))
    expect(persist).toHaveBeenCalledTimes(1)
    await q.enqueue('bateria:varias', () => {
      insertar(db, 2)
      db.tx(() => insertar(db, 3))
      insertar(db, 4)
    })
    expect(persist).toHaveBeenCalledTimes(2)
    await q.enqueue('bateria:lectura', () => {
      db.all('SELECT * FROM prueba')
      db.get('SELECT COUNT(*) AS c FROM prueba')
    })
    await q.enqueue('bateria:existe', () => db.exec('CREATE TABLE IF NOT EXISTS prueba (id INTEGER PRIMARY KEY)'))
    await q.enqueue('bateria:ignorado', () => {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_n ON prueba (n)')
    })
    expect(persist).toHaveBeenCalledTimes(3) // solo el índice nuevo cuenta
    await q.enqueue('bateria:ignorado2', () => db.run('INSERT OR IGNORE INTO prueba (id, n) VALUES (1, 99)'))
    await q.enqueue('bateria:ignorado3', () => db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_n ON prueba (n)'))
    expect(persist).toHaveBeenCalledTimes(3)
    db.close()
  })

  it('si falla el guardado: SaveError, datos en memoria, el siguiente guardado reintenta y flush no hace nada sin pendiente', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const real = db.persist.bind(db)
    const persist = vi.spyOn(db, 'persist').mockImplementationOnce(() => {
      throw new Error('disco lleno')
    })
    await expect(q.enqueue('bateria:alta', () => insertar(db, 1))).rejects.toBeInstanceOf(SaveError)
    expect(ns(db)).toEqual([1])
    expect(db.inOp).toBe(false)
    persist.mockImplementation(real)
    await q.enqueue('bateria:nada', () => undefined)
    expect(persist).toHaveBeenCalledTimes(2)
    // Ya no hay pendiente: flush no guarda.
    q.flush()
    db.flush()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(await reabrir(db, file)).toEqual([1])
  })

  it('flush reintenta el guardado pendiente y, si vuelve a fallar, lanza SaveError', async () => {
    const file = tmpFile()
    const { db, q } = await setup(file)
    const real = db.persist.bind(db)
    const persist = vi.spyOn(db, 'persist').mockImplementation(() => {
      throw new Error('disco lleno')
    })
    await expect(q.enqueue('bateria:alta', () => insertar(db, 1))).rejects.toBeInstanceOf(SaveError)
    expect(() => q.flush()).toThrow(SaveError)
    persist.mockImplementation(real)
    q.flush()
    expect(persist).toHaveBeenCalledTimes(3)
    q.flush()
    expect(persist).toHaveBeenCalledTimes(3)
    expect(await reabrir(db, file)).toEqual([1])
  })

  describe('enqueueTask', () => {
    it('da turno exclusivo: un enqueue posterior espera a que termine la tarea', async () => {
      const { db, q } = await setup()
      const orden: string[] = []
      let soltar!: () => void
      const puerta = new Promise<void>((r) => (soltar = r))
      const t = q.enqueueTask('bateria:tarea', async ({ runOp }) => {
        orden.push('tarea:inicio')
        await puerta
        runOp('bateria:dentro', () => insertar(db, 1))
        expect(db.inOp).toBe(false)
        orden.push('tarea:fin')
        return 'ok'
      })
      const o = q.enqueue('bateria:despues', () => {
        orden.push('op')
        insertar(db, 2)
      })
      // Se deja pasar bastante tiempo de microtareas y macrotareas: la op no debe arrancar.
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))
      expect(orden).toEqual(['tarea:inicio'])
      expect(q.busy).toBe(true)
      soltar()
      await expect(t).resolves.toBe('ok')
      await o
      expect(orden).toEqual(['tarea:inicio', 'tarea:fin', 'op'])
      expect(ns(db)).toEqual([1, 2])
    })

    it('si la tarea falla, la cola sigue; y runOp ya no sirve fuera de la tarea', async () => {
      const { db, q } = await setup()
      let guardado!: (l: string, f: () => void) => unknown
      const t = q.enqueueTask('bateria:tarea', async (ctx) => {
        guardado = ctx.runOp
        ctx.runOp('bateria:antes', () => insertar(db, 1))
        throw new Error('tarea rota')
      })
      const o = q.enqueue('bateria:despues', () => insertar(db, 2))
      await expect(t).rejects.toThrow('tarea rota')
      await o
      expect(ns(db)).toEqual([1, 2])
      expect(() => guardado('bateria:tarde', () => insertar(db, 3))).toThrow('ya ha terminado')
      expect(ns(db)).toEqual([1, 2])
      await q.onIdle()
      expect(q.busy).toBe(false)
    })

    it('un fallo en runOp deshace esa operación pero la tarea puede continuar', async () => {
      const { db, q } = await setup()
      await q.enqueueTask('bateria:tarea', async ({ runOp }) => {
        expect(() =>
          runOp('bateria:mala', () => {
            insertar(db, 1)
            throw new Error('mala')
          })
        ).toThrow('mala')
        runOp('bateria:buena', () => insertar(db, 2))
      })
      expect(ns(db)).toEqual([2])
    })
  })

  describe('before', () => {
    it('se ejecuta en su turno, fuera de la transacción, y exportBytes funciona', async () => {
      const { db, q } = await setup()
      const orden: string[] = []
      let bytes = 0
      let enOp: boolean | null = null
      const p1 = q.enqueue('bateria:1', () => {
        orden.push('op1')
        insertar(db, 1)
      })
      const p2 = q.enqueue(
        'bateria:2',
        () => {
          orden.push('op2')
          expect(db.inOp).toBe(true)
          insertar(db, 2)
        },
        {
          before: () => {
            orden.push('before2')
            enOp = db.inOp
            bytes = db.exportBytes().length
          }
        }
      )
      await Promise.all([p1, p2])
      expect(orden).toEqual(['op1', 'before2', 'op2'])
      expect(enOp).toBe(false)
      expect(bytes).toBeGreaterThan(0)
      expect(ns(db)).toEqual([1, 2])
    })

    it('un before asíncrono se espera antes de abrir la operación', async () => {
      const { db, q } = await setup()
      const orden: string[] = []
      await q.enqueue('bateria:a', () => orden.push('op'), {
        before: async () => {
          await new Promise((r) => setImmediate(r))
          orden.push('before')
        }
      })
      expect(orden).toEqual(['before', 'op'])
      expect(db.inOp).toBe(false)
    })

    it('si before falla, la op no se ejecuta y la cola sigue', async () => {
      const { db, q } = await setup()
      const fn = vi.fn(() => insertar(db, 1))
      const p1 = q.enqueue('bateria:a', fn, {
        before: () => {
          throw new Error('sin copia')
        }
      })
      const p2 = q.enqueue('bateria:b', () => insertar(db, 2))
      await expect(p1).rejects.toThrow('sin copia')
      await p2
      expect(fn).not.toHaveBeenCalled()
      expect(ns(db)).toEqual([2])
      expect(db.inOp).toBe(false)
    })
  })

  it('la auditoría entra en la misma transacción: aparece si confirma y no si fn lanza', async () => {
    const { db, q } = await setup()
    q.runNow('bateria:montar', () => db.exec(AUDIT_SQL))
    await q.enqueue('bateria:ok', () => insertar(db, 1), {
      audit: { entity: 'prueba', entityId: '1', action: 'create', summary: 'Alta', before: null, after: { n: 1 } }
    })
    await expect(
      q.enqueue(
        'bateria:ko',
        () => {
          insertar(db, 2)
          throw new Error('no')
        },
        { audit: { entity: 'prueba', entityId: '2', action: 'create', summary: null } }
      )
    ).rejects.toThrow('no')
    const filas = db.all<{ entity_id: string; action: string; summary: string | null; before_json: string | null; after_json: string | null }>(
      'SELECT entity_id, action, summary, before_json, after_json FROM audit_log'
    )
    expect(filas).toEqual([{ entity_id: '1', action: 'create', summary: 'Alta', before_json: null, after_json: '{"n":1}' }])
    expect(ns(db)).toEqual([1])
  })

  it('si la auditoría falla (tabla inexistente), la operación entera se deshace', async () => {
    const { db, q } = await setup()
    await expect(
      q.enqueue('bateria:sinaudit', () => insertar(db, 1), {
        audit: { entity: 'prueba', entityId: '1', action: 'create', summary: null }
      })
    ).rejects.toThrow()
    expect(ns(db)).toEqual([])
    expect(db.inOp).toBe(false)
  })

  describe('runNow', () => {
    it('con la cola libre funciona y guarda', async () => {
      const file = tmpFile()
      const { db, q } = await setup(file)
      const persist = vi.spyOn(db, 'persist')
      expect(q.runNow('bateria:ya', () => (insertar(db, 1), 'hecho'))).toBe('hecho')
      expect(persist).toHaveBeenCalledTimes(1)
      expect(q.busy).toBe(false)
      expect(await reabrir(db, file)).toEqual([1])
    })

    it('con algo pendiente lanza y tras esperar a la última op vuelve a estar disponible', async () => {
      const { db, q } = await setup()
      const p = q.enqueue('bateria:a', () => insertar(db, 1))
      expect(() => q.runNow('bateria:b', () => insertar(db, 2))).toThrow('bateria:b')
      await p
      expect(q.runNow('bateria:c', () => insertar(db, 3))).toBeUndefined()
      expect(ns(db)).toEqual([1, 3])
    })

    it('si la op lanza, se deshace y la cola queda libre', async () => {
      const { db, q } = await setup()
      expect(() =>
        q.runNow('bateria:mala', () => {
          insertar(db, 1)
          throw new Error('mala')
        })
      ).toThrow('mala')
      expect(ns(db)).toEqual([])
      expect(q.busy).toBe(false)
      expect(db.inOp).toBe(false)
    })
  })

  describe('onIdle', () => {
    it('se resuelve solo al procesar todas las operaciones, incluidas las que fallan', async () => {
      const { db, q } = await setup()
      let idle = false
      const promesas = Array.from({ length: 10 }, (_, i) =>
        q.enqueue('bateria:op', () => {
          insertar(db, i)
          if (i % 3 === 0) throw new Error(`falla ${i}`)
        })
      )
      const rechazos = promesas.map((p) => p.catch((e: Error) => e.message))
      void q.onIdle().then(() => (idle = true))
      await Promise.resolve()
      expect(idle).toBe(false)
      await Promise.all(rechazos)
      await q.onIdle()
      expect(idle).toBe(true)
      expect(q.busy).toBe(false)
      expect(ns(db)).toEqual([1, 2, 4, 5, 7, 8])
    })

    it('con la cola vacía se resuelve al momento', async () => {
      const { q } = await setup()
      await expect(q.onIdle()).resolves.toBeUndefined()
    })

    it('espera también a la última op si es la que falla', async () => {
      const { q } = await setup()
      const orden: string[] = []
      const p = q.enqueue('bateria:ko', () => {
        throw new Error('ko')
      })
      p.catch(() => orden.push('rechazada'))
      await q.onIdle()
      orden.push('idle')
      expect(orden).toContain('idle')
      expect(q.busy).toBe(false)
    })
  })

  it('onChange se llama al cerrar una tx de servicio, tras un run suelto, en commitOp y en rollbackOp', async () => {
    const { db } = await setup()
    const onChange = vi.fn()
    db.onChange = onChange
    db.beginOp()
    db.tx(() => {
      db.tx(() => insertar(db, 1))
      expect(onChange).not.toHaveBeenCalled()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    insertar(db, 2)
    expect(onChange).toHaveBeenCalledTimes(2)
    db.commitOp()
    expect(onChange).toHaveBeenCalledTimes(3)
    db.beginOp()
    insertar(db, 3)
    expect(onChange).toHaveBeenCalledTimes(4)
    db.rollbackOp()
    expect(onChange).toHaveBeenCalledTimes(5)
    expect(ns(db)).toEqual([1, 2])
  })

  it('no usa temporizadores: con timers falsos sin avanzar, una tanda de enqueue termina', async () => {
    vi.useFakeTimers()
    const { db, q } = await setup()
    const res = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        q.enqueue('bateria:alta', () => {
          insertar(db, i)
          return i
        })
      )
    )
    await q.onIdle()
    expect(res).toEqual(rango(0, 20))
    expect(ns(db)).toEqual(rango(0, 20))
    vi.useRealTimers()
  })

  it('la guarda está siempre activa: run, exec y tx fuera de la cola lanzan; all/get funcionan; dentro de enqueue se escribe', async () => {
    const { db, q } = await setup()
    expect('guard' in db).toBe(false)
    expect(() => insertar(db, 1)).toThrow('Escritura fuera de la cola')
    expect(() => db.exec('DELETE FROM prueba')).toThrow('Escritura fuera de la cola')
    expect(() => db.tx(() => undefined)).toThrow('Escritura fuera de la cola')
    expect(db.all('SELECT * FROM prueba')).toEqual([])
    expect(db.get('SELECT COUNT(*) AS c FROM prueba')).toEqual({ c: 0 })
    await q.enqueue('bateria:alta', () => {
      insertar(db, 1)
      db.tx(() => insertar(db, 2))
      db.exec('INSERT INTO prueba (n) VALUES (3)')
    })
    expect(ns(db)).toEqual([1, 2, 3])
    // Terminada la operación, la guarda vuelve a actuar.
    expect(() => insertar(db, 4)).toThrow('Escritura fuera de la cola')
    // Y dentro de una tarea, runOp sí puede escribir.
    await q.enqueueTask('bateria:tarea', async ({ runOp }) => runOp('bateria:dentro', () => insertar(db, 5)))
    expect(ns(db)).toEqual([1, 2, 3, 5])
  })
})
