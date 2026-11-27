// Ajustes del núcleo (core_settings, migración 1004) y ajustes del asistente (claves ai.*):
// valores por defecto, validación (solo URLs de este equipo), escritura por la cola y auditoría.
import { describe, expect, it, vi } from 'vitest'
import { AI_SETTING_KEYS, createAiSettingsStore, readSetting, writeSetting } from '../../src/main/core/coreSettings'
import { UserError } from '../../src/main/core/errors'
import { DEFAULT_AI_SETTINGS } from '../../src/shared/core/ai-types'
import { entrenoApp, escribir } from '../entreno/helpers'

async function montar() {
  const app = await entrenoApp()
  return { ...app, ajustes: createAiSettingsStore(app.ctx) }
}

const filas = (db: { all<T>(sql: string): T[] }) => db.all<{ key: string; value: string }>('SELECT key, value FROM core_settings ORDER BY key')
const auditorias = (db: { get<T>(sql: string): T | undefined }) =>
  db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'core_settings'")!.n

describe('ajustes del asistente', () => {
  it('sin nada guardado, los valores por defecto', async () => {
    const { ajustes, db } = await montar()
    expect(ajustes.get()).toEqual(DEFAULT_AI_SETTINGS)
    expect(filas(db)).toEqual([])
  })

  it('guarda solo lo que cambia, por la cola, con su auditoría; devuelve los ajustes completos', async () => {
    const { ajustes, ctx, db } = await montar()
    const spy = vi.spyOn(ctx.queue, 'enqueue')
    const r = await ajustes.save({ model: 'llama3.1:8b', think: true })
    expect(r).toEqual({ ...DEFAULT_AI_SETTINGS, model: 'llama3.1:8b', think: true })
    expect(ajustes.get()).toEqual(r)
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['core:ai.settings.save'])
    expect(filas(db)).toEqual([
      { key: 'ai.model', value: '"llama3.1:8b"' },
      { key: 'ai.think', value: 'true' }
    ])
    expect(auditorias(db)).toBe(1)
    const a = db.get<{ before_json: string; after_json: string }>("SELECT before_json, after_json FROM audit_log WHERE entity = 'core_settings'")!
    expect(JSON.parse(a.before_json)).toEqual(DEFAULT_AI_SETTINGS)
    expect(JSON.parse(a.after_json)).toEqual(r)

    // Lo mismo otra vez (o un valor igual al de por defecto): no escribe ni audita.
    await ajustes.save({ model: 'llama3.1:8b', enabled: true })
    expect(filas(db)).toHaveLength(2)
    expect(auditorias(db)).toBe(1)

    await ajustes.save({ enabled: false, baseUrl: 'http://127.0.0.1:11434/' })
    expect(ajustes.get()).toEqual({ enabled: false, baseUrl: 'http://127.0.0.1:11434', model: 'llama3.1:8b', think: true })
  })

  it('rechaza una URL que no es de este equipo con el mensaje de la validación, sin escribir nada', async () => {
    const { ajustes, ctx, db } = await montar()
    const spy = vi.spyOn(ctx.queue, 'enqueue')
    for (const baseUrl of ['http://192.168.1.20:11434', 'https://api.ejemplo.com', 'ftp://localhost', 'http://usuario:clave@localhost:11434']) {
      const e = await ajustes.save({ baseUrl }).catch((x: unknown) => x)
      expect(e).toBeInstanceOf(UserError)
      expect((e as Error).message).toMatch(/tiene que ser de este equipo/)
    }
    expect(spy).not.toHaveBeenCalled()
    expect(filas(db)).toEqual([])
  })

  it('rechaza campos desconocidos y valores de tipo equivocado', async () => {
    const { ajustes, db } = await montar()
    await expect(ajustes.save({ apiKey: 'x' } as never)).rejects.toBeInstanceOf(UserError)
    await expect(ajustes.save({ enabled: 'sí' } as never)).rejects.toBeInstanceOf(UserError)
    await expect(ajustes.save({ model: '' })).rejects.toThrow(/Elige un modelo/)
    await expect(ajustes.save({ model: 'modelo con espacios' })).rejects.toThrow(/modelo no válido/)
    expect(filas(db)).toEqual([])
  })

  it('un valor guardado que ya no vale (o que no es del tipo) vuelve al de por defecto', async () => {
    const { ajustes, ctx, db } = await montar()
    escribir(ctx, () => {
      writeSetting(db, AI_SETTING_KEYS.baseUrl, 'http://otro-equipo:11434')
      writeSetting(db, AI_SETTING_KEYS.think, 'sí')
      writeSetting(db, AI_SETTING_KEYS.model, 'mistral:7b')
    })
    expect(ajustes.get()).toEqual({ ...DEFAULT_AI_SETTINGS, model: 'mistral:7b' })
  })
})

describe('almacén genérico core_settings', () => {
  it('guarda JSON y lo lee con su tipo; fuera de la cola no deja escribir', async () => {
    const { ctx, db } = await montar()
    expect(readSetting(db, 'prueba.x')).toBeUndefined()
    escribir(ctx, () => writeSetting(db, 'prueba.x', { a: 1, b: [true] }))
    expect(readSetting(db, 'prueba.x')).toEqual({ a: 1, b: [true] })
    escribir(ctx, () => writeSetting(db, 'prueba.x', 3))
    expect(readSetting(db, 'prueba.x')).toBe(3)
    expect(() => writeSetting(db, 'prueba.y', 1)).toThrow(/fuera de la cola/)
    expect(() => escribir(ctx, () => writeSetting(db, ' mal', 1))).toThrow(/Clave/)
  })

  it('restricciones en SQL (1004): clave no vacía y sin espacios a los lados, valor JSON', async () => {
    const { ctx, db } = await montar()
    const ts = '2026-11-27T10:00:00.000Z'
    const falla = (k: string, v: string) =>
      expect(() => escribir(ctx, () => db.run('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, ?)', [k, v, ts]))).toThrow()
    falla('', '1')
    falla(' a', '1')
    falla('a', 'no es json')
    falla('a', '')
    expect(filas(db)).toEqual([])
  })
})
