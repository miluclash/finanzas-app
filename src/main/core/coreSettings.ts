// Ajustes del núcleo (`core_settings`, migración 1004): almacén genérico clave/valor y, encima, los
// ajustes del asistente (`AiSettingsStore` del contrato, claves `ai.*`).
//
// `value` se guarda como JSON en texto, así que los booleanos y los números vuelven con su tipo.
// Lecturas síncronas desde la base en memoria; escrituras por la cola.
import { AiSettingsPatchSchema, AiSettingsSchema } from '@shared/core/ai-settings'
import { DEFAULT_AI_SETTINGS, type AiSettings, type AiSettingsPatch, type AiSettingsStore } from '@shared/core/ai-types'
import { firstZodMessage } from '@shared/core/charts/schema'
import { audit } from './audit'
import { coreOf, type CoreRef } from './context'
import type { Db } from './db'
import { UserError } from './errors'

/** Valor de una clave (`undefined` si no está o si lo guardado no es JSON). Solo lee. */
export function readSetting(db: Db, key: string): unknown {
  const row = db.get<{ value: string }>('SELECT value FROM core_settings WHERE key = ?', [key])
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as unknown
  } catch {
    return undefined
  }
}

/**
 * Guarda (o sustituye) una clave. Solo dentro de una operación de la cola (fuera, la base lanza
 * «Escritura fuera de la cola»). `undefined` no se puede guardar: para quitar una clave, `deleteSetting`.
 */
export function writeSetting(db: Db, key: string, value: unknown, ts = new Date().toISOString()): void {
  if (!key || key !== key.trim()) throw new Error(`Clave de ajuste no válida: «${key}».`)
  if (value === undefined) throw new Error(`El ajuste «${key}» no tiene valor.`)
  db.run(
    'INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, JSON.stringify(value), ts]
  )
}

/** Quita una clave (vuelve a su valor por defecto). Solo dentro de una operación de la cola. */
export function deleteSetting(db: Db, key: string): void {
  db.run('DELETE FROM core_settings WHERE key = ?', [key])
}

/** Claves de `core_settings` de cada ajuste del asistente. */
export const AI_SETTING_KEYS = {
  enabled: 'ai.enabled',
  baseUrl: 'ai.baseUrl',
  model: 'ai.model',
  think: 'ai.think'
} as const satisfies Record<keyof AiSettings, string>

const AI_FIELDS = Object.keys(AI_SETTING_KEYS) as Array<keyof AiSettings>

/** Ajustes del asistente tal como están en la base. Si falta una clave o no vale, su valor por defecto. */
export function readAiSettings(db: Db): AiSettings {
  const out: AiSettings = { ...DEFAULT_AI_SETTINGS }
  for (const f of AI_FIELDS) {
    const raw = readSetting(db, AI_SETTING_KEYS[f])
    if (raw === undefined) continue
    const r = AiSettingsSchema.shape[f].safeParse(raw)
    if (r.success) (out as unknown as Record<string, unknown>)[f] = r.data
  }
  return out
}

export function createAiSettingsStore(ref: CoreRef): AiSettingsStore {
  const ctx = coreOf(ref)
  return {
    get: () => readAiSettings(ctx.db),

    save: (patch: AiSettingsPatch): Promise<AiSettings> => {
      const r = AiSettingsPatchSchema.safeParse(patch)
      if (!r.success) return Promise.reject(new UserError(firstZodMessage(r.error, 'Ajustes del asistente no válidos.')))
      const data = r.data
      return ctx.queue.enqueue('core:ai.settings.save', () => {
        const before = readAiSettings(ctx.db)
        const ts = new Date().toISOString()
        let changed = false
        for (const f of AI_FIELDS) {
          const v = data[f]
          if (v === undefined || v === before[f]) continue
          writeSetting(ctx.db, AI_SETTING_KEYS[f], v, ts)
          changed = true
        }
        const after = readAiSettings(ctx.db)
        if (changed) audit(ctx.db, 'core_settings', 'ai', 'update', 'Ajustes del asistente', before, after)
        return after
      })
    }
  }
}
