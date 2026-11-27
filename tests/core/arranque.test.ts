// Arranque sin archivos, todos los handlers de escritura por la cola, lecturas síncronas y
// escritura fuera de la cola prohibida. Los handlers se buscan por sufijo (`x` o `<módulo>:x`)
// para no depender de si los nombres de la API llevan prefijo de módulo.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppHandlers } from '../../src/main/app'
import { Db } from '../../src/main/core/db'
import type { DialogProvider } from '../../src/main/core/handlers'
import { saveAccount } from '../../src/main/modules/finanzas/catalog'
import { AppState } from '../../src/main/modules/finanzas/state'
import { account, escribir, memoryApp } from '../helpers'

type Fn = (...args: unknown[]) => unknown
type Mapa = Record<string, Fn>

const dirs: string[] = []
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-arranque-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** Diálogos falsos: nunca eligen nada. */
const sinDialogos: DialogProvider = {
  openFile: async () => null,
  saveFile: async () => null,
  openDir: async () => null,
  showItem: () => undefined,
  openPath: () => undefined
}

function handlersDe(s: AppState): Mapa {
  return createAppHandlers(s.core, sinDialogos, '0.0.0') as unknown as Mapa
}

const coincide = (clave: string, sufijo: string) => clave === sufijo || clave.endsWith(`:${sufijo}`)

function buscar(h: Mapa, sufijo: string): { clave: string; fn: Fn } {
  const claves = Object.keys(h).filter((k) => coincide(k, sufijo))
  if (claves.length !== 1) throw new Error(`Se esperaba exactamente un handler que acabe en «${sufijo}» y hay ${claves.length}: ${claves.join(', ')}`)
  return { clave: claves[0], fn: h[claves[0]] }
}

/** El error es el de la guarda de db.ts: alguien ha intentado escribir sin pasar por la cola. */
function esEscrituraFuera(e: unknown): boolean {
  return (e instanceof Error ? e.message : String(e)).includes('Escritura fuera de la cola')
}

/**
 * Llama al handler con esos argumentos y espera a que acabe, bien o mal. Que falle da igual (solo
 * importa por dónde ha pasado), salvo si es porque ha escrito fuera de la cola: eso se relanza.
 */
async function llamar(fn: Fn, ...args: unknown[]): Promise<void> {
  try {
    await fn(...args)
  } catch (e) {
    if (esEscrituraFuera(e)) throw e
  }
}

const esPromesa = (v: unknown) => !!v && typeof (v as { then?: unknown }).then === 'function'

const ESCRITURA = [
  'settings.update', 'accounts.save', 'accounts.delete', 'accounts.reconcile', 'accounts.deleteReconciliation',
  'groups.save', 'groups.delete', 'categories.save', 'categories.delete',
  'subcategories.save', 'subcategories.delete', 'subcategories.merge',
  'tx.save', 'tx.saveTransfer', 'tx.setStatus', 'tx.delete', 'tx.dismissDuplicate',
  'budgets.set', 'budgets.copy', 'recurring.save', 'recurring.delete',
  'goals.save', 'goals.delete', 'goals.allocate', 'goals.deleteAllocation',
  'scenarios.save', 'scenarios.delete',
  'inv.saveBlock', 'inv.deleteBlock', 'inv.saveInstrument', 'inv.deleteInstrument',
  'inv.saveOp', 'inv.deleteOp', 'inv.savePrice', 'inv.deletePrice',
  'import.apply', 'tr.apply',
  // Núcleo: el único handler del asistente que escribe sin argumentos (los demás rechazan antes de encolar).
  'ai.threads.deleteAll'
]

const LECTURA = [
  'catalog.get', 'accounts.list', 'tx.list', 'dashboard.get', 'alerts.get', 'monthly.summaries', 'networth.series',
  'budgets.report', 'recurring.list', 'goals.list', 'forecast.run', 'inv.overview', 'inv.plan', 'inv.ops',
  'inv.prices', 'tx.reviewQueue', 'tx.suggest', 'tx.validate', 'tx.get', 'accounts.reconciliations', 'categories.usage'
]

describe('arranque sin archivos (dbPath y backupsDir a null)', () => {
  function espiasFs() {
    return {
      writeFileSync: vi.spyOn(fs, 'writeFileSync'),
      renameSync: vi.spyOn(fs, 'renameSync'),
      mkdirSync: vi.spyOn(fs, 'mkdirSync'),
      rmSync: vi.spyOn(fs, 'rmSync'),
      copyFileSync: vi.spyOn(fs, 'copyFileSync')
    }
  }
  const total = (e: ReturnType<typeof espiasFs>) => Object.values(e).reduce((n, sp) => n + sp.mock.calls.length, 0)

  it('control positivo: con dbPath en una carpeta temporal los espías sí ven escrituras', async () => {
    const dir = tmpDir()
    const db = await Db.open(path.join(dir, 'control.sqlite'))
    const espias = espiasFs()
    const s = AppState.init(db, { dbPath: path.join(dir, 'control.sqlite'), backupsDir: null })
    s.todayOverride = '2026-10-11'
    account(s, { name: 'Control' })
    expect(total(espias)).toBeGreaterThan(0)
    expect(espias.writeFileSync).toHaveBeenCalled()
    expect(fs.existsSync(path.join(dir, 'control.sqlite'))).toBe(true)
  })

  it('montar la app, escribir y pedir copias no toca el sistema de archivos', async () => {
    const espias = espiasFs()
    const db = await Db.open(null)
    const s = AppState.init(db, { dbPath: null, backupsDir: null })
    s.todayOverride = '2026-10-11'
    account(s, { name: 'A' })
    account(s, { name: 'B' })
    escribir(s, () => s.db.run("UPDATE settings SET value = value WHERE 1 = 0"))
    const h = handlersDe(s)

    // Sin carpeta de copias: la automática no hace nada y la manual avisa al usuario.
    await expect(buscar(h, 'backup.auto').fn()).resolves.toBeNull()
    await expect(buscar(h, 'backup.create').fn()).rejects.toThrow(/carpeta de copias/i)
    // Una escritura por el handler (por la cola) tampoco crea archivos.
    await llamar(buscar(h, 'accounts.save').fn, { name: 'C' })
    await s.core.queue.onIdle()

    expect(s.snap().accounts.length).toBeGreaterThanOrEqual(2)
    const llamadas = Object.entries(espias).filter(([, sp]) => sp.mock.calls.length > 0).map(([n, sp]) => `${n} (${sp.mock.calls.length})`)
    expect(llamadas, `Sin dbPath ni backupsDir no debe escribirse ningún archivo, pero hubo: ${llamadas.join(', ')}`).toEqual([])
  })
})

describe('todos los handlers de escritura pasan por la cola', () => {
  it('cada handler de la lista llama a enqueue con una etiqueta que acaba en «:<sufijo>»', async () => {
    const s = await memoryApp()
    const h = handlersDe(s)
    const enqueue = vi.spyOn(s.core.queue, 'enqueue')
    const fallos: string[] = []
    for (const sufijo of ESCRITURA) {
      const { fn } = buscar(h, sufijo)
      enqueue.mockClear()
      await llamar(fn)
      const etiquetas = enqueue.mock.calls.map((c) => c[0])
      if (!etiquetas.some((e) => e.endsWith(`:${sufijo}`))) fallos.push(`${sufijo} (etiquetas: ${etiquetas.join(', ') || 'ninguna'})`)
    }
    expect(fallos, `Estos handlers de escritura no usan la cola con su etiqueta: ${fallos.join('; ')}`).toEqual([])
  })

  it('los handlers que llaman a enqueue son exactamente los de la lista', async () => {
    const s = await memoryApp()
    const h = handlersDe(s)
    const enqueue = vi.spyOn(s.core.queue, 'enqueue')
    const llaman: string[] = []
    for (const [clave, fn] of Object.entries(h)) {
      enqueue.mockClear()
      await llamar(fn)
      if (enqueue.mock.calls.length > 0) llaman.push(clave)
    }
    const esperados = ESCRITURA.map((x) => buscar(h, x).clave)
    expect(llaman.sort()).toEqual(esperados.sort())
  })
})

describe('las lecturas siguen siendo síncronas', () => {
  it('los handlers de lectura del colector del dorado no devuelven una promesa', async () => {
    const s = await memoryApp()
    const h = handlersDe(s)
    const cuenta = account(s, { name: 'Cuenta' })
    const id = (cuenta as unknown as { id?: string })?.id ?? 'x'
    const args: Record<string, unknown[]> = {
      'tx.list': [{}],
      'budgets.report': ['2026-10'],
      'tx.suggest': ['café'],
      'tx.validate': [{ accountId: id, amountCents: -100, date: '2026-10-01', description: 'x', type: 'EXPENSE' }],
      'tx.get': ['no-existe'],
      'accounts.reconciliations': [id],
      'categories.usage': ['no-existe']
    }
    const beginOp = vi.spyOn(s.core.db, 'beginOp')
    const promesas: string[] = []
    const escriben: string[] = []
    for (const sufijo of LECTURA) {
      const { fn } = buscar(h, sufijo)
      beginOp.mockClear()
      let r: unknown
      let error: unknown = null
      try {
        r = fn(...(args[sufijo] ?? []))
      } catch (e) {
        error = e // Lanzar síncronamente no es una promesa, pero no puede ser por escribir.
      }
      if (esPromesa(r)) {
        promesas.push(sufijo)
        await Promise.resolve(r).catch((e: unknown) => (error = e))
      }
      if (error !== null && esEscrituraFuera(error)) escriben.push(`${sufijo} (escritura fuera de la cola)`)
      if (beginOp.mock.calls.length > 0) escriben.push(`${sufijo} (abre una operación de la cola)`)
    }
    expect(promesas, `Estas lecturas devuelven una promesa y deberían ser síncronas: ${promesas.join(', ')}`).toEqual([])
    expect(escriben, `Estas lecturas escriben: ${escriben.join(', ')}`).toEqual([])
    expect(s.core.db.inOp).toBe(false)
  })

  it('control: el test de lecturas detecta una lectura que escribe fuera de la cola', async () => {
    const s = await memoryApp()
    const lecturaQueEscribe = () => s.db.run("UPDATE settings SET value = value WHERE 1 = 0")
    let error: unknown = null
    try {
      lecturaQueEscribe()
    } catch (e) {
      error = e
    }
    expect(esEscrituraFuera(error)).toBe(true)
    await expect(llamar(lecturaQueEscribe)).rejects.toThrow('Escritura fuera de la cola')
  })
})

describe('escribir fuera de la cola', () => {
  it('un servicio sin operación abierta lanza «Escritura fuera de la cola» y no deja nada escrito', async () => {
    const s = await memoryApp()
    const antes = s.snap().accounts.length
    expect(() =>
      saveAccount(s, {
        name: 'Fuera',
        type: 'CHECKING',
        openingBalanceCents: 0,
        openingDate: '2026-06-01',
        active: true,
        includeNetWorth: true,
        includeLiquidity: true
      })
    ).toThrow(/Escritura fuera de la cola/)
    expect(s.db.all("SELECT id FROM accounts WHERE name = 'Fuera'")).toEqual([])
    expect(s.snap().accounts.length).toBe(antes)
  })
})
