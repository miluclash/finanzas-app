// Ayudas para escribir herramientas de la IA local (núcleo y módulos): validar argumentos con Zod,
// declarar herramientas de lectura y de acción, resolver nombres a ids, formatear importes y
// recortar listas. No hacen nada por sí solas: las usan `coreTools.ts` y los `aiTools.ts` de cada módulo.
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type {
  AiActionPlan,
  AiActionToolDef,
  AiChange,
  AiJsonSchema,
  AiReadToolDef
} from '@shared/core/ai-types'
import { formatEur } from '@shared/money'
import { formatDate } from '@shared/dates'
import { UserError } from '../errors'

/** Valida los argumentos de una herramienta; si no valen, lanza un error que el modelo puede leer. */
export function parseArgs<T>(schema: z.ZodType<T>, args: unknown, tool: string): T {
  const r = schema.safeParse(args ?? {})
  if (r.success) return r.data
  const issues = r.error.issues.slice(0, 5).map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
  throw new UserError(`Argumentos no válidos para ${tool}: ${issues.join('; ')}`)
}

interface ToolBase {
  name: string
  description: string
  label: string
  parameters: AiJsonSchema
}

/** Herramienta de lectura con sus argumentos validados. */
export function readTool<C, A>(def: ToolBase & { args: z.ZodType<A>; run(ctx: C, args: A): unknown }): AiReadToolDef<C> {
  return {
    kind: 'read',
    name: def.name,
    description: def.description,
    label: def.label,
    parameters: def.parameters,
    run: (ctx, args) => def.run(ctx, parseArgs(def.args, args, def.name))
  }
}

/**
 * El registro cambió desde la propuesta. Lo lanza la comprobación de la huella DENTRO de la operación
 * de la cola que escribe (así no se cuela ninguna escritura entre comprobar y escribir); el
 * orquestador lo trata como propuesta caducada.
 */
export class StaleChangeError extends UserError {
  constructor() {
    super('El registro ha cambiado desde la propuesta y no se ha tocado. Pide la propuesta otra vez.')
    this.name = 'StaleChangeError'
  }
}

/**
 * Herramienta de acción con sus argumentos validados. `plan` no escribe; `apply` escribe un cambio
 * confirmado (por la cola, con el mismo servicio que la página). `apply` recibe `guard`, que hay que
 * llamar al principio de la función encolada: recalcula la huella del registro en ese mismo turno de
 * la cola y lanza `StaleChangeError` si ya no es la de la propuesta.
 */
export function actionTool<C, A>(
  def: ToolBase & {
    args: z.ZodType<A>
    plan(ctx: C, args: A): AiActionPlan
    apply(ctx: C, change: AiChange, guard: () => void): Promise<void>
    fingerprint(ctx: C, change: AiChange): string | null
  }
): AiActionToolDef<C> {
  const guard = (ctx: C, change: AiChange) => () => {
    if (def.fingerprint(ctx, change) !== change.fingerprint) throw new StaleChangeError()
  }
  return {
    kind: 'action',
    name: def.name,
    description: def.description,
    label: def.label,
    parameters: def.parameters,
    plan: (ctx, args) => def.plan(ctx, parseArgs(def.args, args, def.name)),
    apply: (ctx, change) => def.apply(ctx, change, guard(ctx, change)),
    fingerprint: (ctx, change) => def.fingerprint(ctx, change)
  }
}

/** Esquema JSON de un objeto de parámetros (lo que ve el modelo). */
export function params(properties: Record<string, Record<string, unknown>>, required: string[] = []): AiJsonSchema {
  const out: AiJsonSchema = { type: 'object', properties }
  if (required.length) out.required = required
  return out
}

/** Huella de un registro (para saber si cambió desde la propuesta). `null` si no existe. */
export function fingerprintOf(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return createHash('sha1').update(JSON.stringify(value)).digest('hex')
}

/** Importe en euros (con decimales, como lo escribe el modelo) → céntimos enteros. */
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100)
}

/** Céntimos → «12,99 €». */
export const eur = (cents: number | null | undefined): string => formatEur(cents)

/** «2026-11-03» → «03/11/2026». */
export const fecha = (d: string | null | undefined): string => formatDate(d)

/** Proporción → «12,5 %» (o null). */
export function pct(ratio: number | null | undefined): string | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return null
  return `${(Math.round(ratio * 1000) / 10).toString().replace('.', ',')} %`
}

/** Texto normalizado para comparar nombres (sin mayúsculas ni tildes). */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca un elemento por id o por nombre (sin mayúsculas ni tildes; exacto primero, después que
 * contenga el texto). Si no hay ninguno o hay varios, lanza un error con las opciones.
 */
export function resolveByName<T>(
  items: readonly T[],
  query: string | number,
  getId: (x: T) => string | number,
  getName: (x: T) => string,
  what: string
): T {
  const byId = items.find((x) => String(getId(x)) === String(query))
  if (byId) return byId
  const q = norm(String(query))
  if (!q) throw new UserError(`Indica ${what}.`)
  const exact = items.filter((x) => norm(getName(x)) === q)
  if (exact.length === 1) return exact[0]
  const partial = exact.length ? exact : items.filter((x) => norm(getName(x)).includes(q))
  if (partial.length === 1) return partial[0]
  const show = (xs: readonly T[]) =>
    xs
      .slice(0, 15)
      .map((x) => `${getName(x)} (id ${getId(x)})`)
      .join(', ')
  if (partial.length > 1) throw new UserError(`Hay varios resultados para ${what} «${query}»: ${show(partial)}. Usa el id.`)
  throw new UserError(`No encuentro ${what} «${query}». Opciones: ${show(items)}${items.length > 15 ? '…' : ''}.`)
}

/** Recorta una lista y dice cuántos había. */
export function limited<T>(xs: readonly T[], max: number): { items: T[]; total: number; recortado: boolean } {
  return { items: xs.slice(0, max), total: xs.length, recortado: xs.length > max }
}
