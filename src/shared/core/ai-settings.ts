// Validación de los ajustes del asistente (F6). La usan el almacén de ajustes (`core_settings`) y el
// proveedor: la URL de Ollama solo puede apuntar a este equipo (regla 8 de CLAUDE.md).
import { z } from 'zod'
import { AI_LOCAL_HOSTS } from './ai-types'

/** `true` si la URL es http(s) y su host es de este equipo (`localhost`, `127.0.0.1`, `::1`). */
export function isLocalAiUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  return (AI_LOCAL_HOSTS as readonly string[]).includes(u.hostname)
}

const BaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(isLocalAiUrl, { message: 'La dirección de Ollama tiene que ser de este equipo (localhost, 127.0.0.1 o ::1).' })
  .transform((s) => s.replace(/\/+$/, ''))

const ModelSchema = z
  .string()
  .trim()
  .min(1, 'Elige un modelo.')
  .max(120)
  .regex(/^[A-Za-z0-9._:/-]+$/, 'Nombre de modelo no válido.')

export const AiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    baseUrl: BaseUrlSchema,
    model: ModelSchema,
    think: z.boolean()
  })
  .strict()

export const AiSettingsPatchSchema = AiSettingsSchema.partial().strict()
