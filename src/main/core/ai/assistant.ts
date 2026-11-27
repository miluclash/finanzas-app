// Orquestador del asistente local (F6). Junta el proveedor (Ollama), las herramientas del núcleo y
// de los módulos, el almacén de conversaciones y los ajustes. Todo con dependencias inyectadas para
// poder probarlo con un proveedor falso.
//
// Flujo de una petición (`send`):
// 1. Crea el hilo si hace falta, guarda el mensaje de Michael y devuelve `{ threadId, runId }` en
//    seguida. La respuesta sigue en segundo plano y llega por eventos (`AiEvent`).
// 2. Bucle de herramientas: el modelo pide herramientas, se ejecutan y se le devuelven los
//    resultados (JSON compacto y recortado), hasta `AI_MAX_TOOL_STEPS` pasos; después se le pide
//    que conteste sin más herramientas.
// 3. Las herramientas de acción SOLO proponen: su `plan` no escribe nada. Las propuestas se guardan
//    en el mensaje final del asistente y se escriben cuando Michael las confirma (`acceptProposal`),
//    con el `apply` de la herramienta (el mismo servicio que la página, por la cola).
import { randomUUID } from 'node:crypto'
import {
  AI_GROUP_MIN,
  AI_HISTORY_MAX_MESSAGES,
  AI_MAX_TOOL_STEPS,
  AI_TOOL_NAME_RE,
  AI_TOOL_RESULT_MAX_CHARS,
  type AiActionPlan,
  type AiActionToolDef,
  type AiChange,
  type AiEvent,
  type AiMessage,
  type AiProposal,
  type AiSendInput,
  type AiSendResult,
  type AiSettings,
  type AiSettingsStore,
  type AiStatus,
  type AiStore,
  type AiSuggestion,
  type AiToolDef,
  type LlmMessage,
  type LlmProvider,
  type LlmToolCall,
  type LlmToolSchema
} from '@shared/core/ai-types'
import { UserError } from '../errors'
import { LlmError } from './llmError'

/** Tamaño máximo de un resultado de herramienta de turnos anteriores al reenviarlo como contexto. */
export const AI_HISTORY_TOOL_MAX_CHARS = 1500
/** Longitud máxima de un mensaje de Michael. */
export const AI_USER_TEXT_MAX = 8000
/** Cambios máximos de una propuesta (una acción que devuelva más se rechaza). */
export const AI_PROPOSAL_MAX_CHANGES = 200

export interface AssistantDeps<C> {
  /** Contexto que reciben las herramientas (en la app, el `CoreContext`). */
  ctx: C
  store: AiStore
  settings: AiSettingsStore
  /** Proveedor para unos ajustes (en la app, `OllamaProvider` con su URL). */
  provider: (settings: AiSettings) => LlmProvider
  tools: readonly AiToolDef<C>[]
  suggestions: () => AiSuggestion[]
  emit: (event: AiEvent) => void
  /** Fecha de hoy (`AAAA-MM-DD`) para el prompt de sistema. */
  today: () => string
  now?: () => Date
  newId?: () => string
}

interface Run {
  runId: string
  threadId: string
  controller: AbortController
  settings: AiSettings
  /** Contexto de sugerencias para esta petición (no se guarda en el hilo). */
  extra: string | null
  done: Promise<void>
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «jueves, 27 de noviembre de 2026». */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]} de ${y}`
}

/** Prompt de sistema (español de España, con la fecha de hoy). No nombra la app. */
export function systemPrompt(today: string): string {
  return [
    'Eres un asistente personal que funciona en local, dentro de una aplicación de escritorio con dos secciones:',
    'Finanzas (cuentas, movimientos, presupuestos, objetivos de ahorro y patrimonio) y Entreno (sesiones, plan de la semana, objetivos, récords y rutinas).',
    `Hoy es ${longDate(today)} (${today}).`,
    '',
    'Reglas:',
    '- Responde siempre en español de España, tuteando, de forma breve y clara.',
    '- Para cualquier cifra, fecha o dato usa las herramientas. No inventes nada: si no puedes obtener un dato, dilo.',
    '- Los importes, en euros con formato español (1.234,56 €).',
    '- Para encontrar ids (categorías, cuentas, ejercicios, rutinas…) usa las herramientas de listas o de búsqueda.',
    '- Solo propones cambios cuando te los piden explícitamente, y siempre con las herramientas de acción.',
    '- Las herramientas de acción SOLO preparan una propuesta: no cambian nada. Nunca digas que algo ya está hecho, guardado o cambiado; di que lo revise y lo confirme en la tarjeta de la propuesta.',
    '- Si una herramienta devuelve un error, corrige los argumentos o explica qué ha pasado.'
  ].join('\n')
}

/** Mismo modelo aunque uno lleve `:latest` y el otro no (y sin distinguir mayúsculas). */
export function sameModel(a: string, b: string): boolean {
  const n = (x: string) => {
    const t = x.trim().toLowerCase()
    return t.includes(':') ? t : `${t}:latest`
  }
  return n(a) === n(b)
}

/** Título del hilo: las primeras palabras del primer mensaje. */
export function threadTitle(text: string): string {
  const words = text.trim().replace(/\s+/g, ' ').split(' ')
  let t = words.slice(0, 8).join(' ')
  if (t.length > 60) t = t.slice(0, 60).trimEnd()
  return t.length < text.trim().replace(/\s+/g, ' ').length ? `${t}…` : t
}

/** Texto recortado a `max` caracteres (avisando de que se ha recortado). */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const note = ' …[resultado recortado]'
  return s.slice(0, Math.max(0, max - note.length)) + note
}

/** Resultado de una herramienta en JSON compacto y recortado. */
export function toolResultText(result: unknown, max = AI_TOOL_RESULT_MAX_CHARS): string {
  let s: string
  try {
    s = result === undefined ? 'null' : typeof result === 'string' ? result : JSON.stringify(result)
  } catch {
    s = String(result)
  }
  return clip(s ?? 'null', max)
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const OP_VERB = { create: 'Crear', update: 'Cambiar', delete: 'Borrar' } as const

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export class Assistant<C> {
  private readonly runs = new Map<string, Run>()
  private readonly byThread = new Map<string, string>()
  private readonly resolving = new Set<string>()
  private readonly tools: ReadonlyMap<string, AiToolDef<C>>
  private readonly now: () => Date
  private readonly newId: () => string

  constructor(private readonly deps: AssistantDeps<C>) {
    const map = new Map<string, AiToolDef<C>>()
    for (const t of deps.tools) {
      if (!AI_TOOL_NAME_RE.test(t.name)) throw new Error(`Nombre de herramienta de IA no válido: «${t.name}».`)
      if (map.has(t.name)) throw new Error(`Herramienta de IA repetida: «${t.name}».`)
      map.set(t.name, t)
    }
    this.tools = map
    this.now = deps.now ?? (() => new Date())
    this.newId = deps.newId ?? (() => randomUUID())
  }

  /** Esquemas de las herramientas tal como los recibe el modelo. */
  toolSchemas(): LlmToolSchema[] {
    return [...this.tools.values()].map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
  }

  // -------------------------------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------------------------------

  async status(): Promise<AiStatus> {
    const settings = this.deps.settings.get()
    if (!settings.enabled)
      return { state: 'disabled', settings, models: [], message: 'El asistente está apagado. Puedes activarlo en Ajustes → Asistente.' }
    let models
    try {
      models = await this.deps.provider(settings).listModels()
    } catch (e) {
      const why = e instanceof LlmError && e.code === 'bad_url' ? e.message : `No encuentro Ollama en ${settings.baseUrl}.`
      return {
        state: 'unreachable',
        settings,
        models: [],
        message: `${why} Si no lo tienes, instálalo desde ollama.com; si ya lo tienes, ábrelo (o ejecuta «ollama serve» en una terminal) y vuelve a probar. Mientras tanto, el resto de la app funciona igual.`
      }
    }
    if (!models.some((m) => sameModel(m.name, settings.model))) {
      const others = models.length ? ` Modelos descargados: ${models.map((m) => m.name).join(', ')}.` : ''
      return {
        state: 'model_missing',
        settings,
        models,
        message: `Ollama está en marcha, pero falta el modelo «${settings.model}». Descárgalo con «ollama pull ${settings.model}» en una terminal y vuelve a probar.${others}`
      }
    }
    return { state: 'ready', settings, models, message: `Listo: Ollama responde y el modelo «${settings.model}» está descargado.` }
  }

  // -------------------------------------------------------------------------------------------------
  // Respuestas
  // -------------------------------------------------------------------------------------------------

  async send(input: AiSendInput): Promise<AiSendResult> {
    const text = typeof input?.text === 'string' ? input.text.trim() : ''
    if (!text) throw new UserError('Escribe algo para preguntar.')
    if (text.length > AI_USER_TEXT_MAX) throw new UserError(`El mensaje es demasiado largo (máximo ${AI_USER_TEXT_MAX} caracteres).`)
    const settings = this.deps.settings.get()
    if (!settings.enabled) throw new UserError('El asistente está apagado. Actívalo en Ajustes → Asistente.')
    let threadId: string
    if (input.threadId != null) {
      if (typeof input.threadId !== 'string' || !this.deps.store.getThread(input.threadId)) throw new UserError('Esa conversación ya no existe.')
      threadId = input.threadId
      if (this.byThread.has(threadId)) throw new UserError('Espera a que termine la respuesta anterior (o cancélala).')
    } else {
      threadId = (await this.deps.store.createThread({ title: threadTitle(text), model: settings.model })).id
    }
    // Se reserva el hilo antes de cualquier espera para que no entren dos respuestas a la vez.
    if (this.byThread.has(threadId)) throw new UserError('Espera a que termine la respuesta anterior (o cancélala).')
    const runId = this.newId()
    this.byThread.set(threadId, runId)
    try {
      await this.deps.store.appendMessage(threadId, { role: 'user', content: text })
    } catch (e) {
      this.byThread.delete(threadId)
      throw e
    }
    const run: Run = {
      runId,
      threadId,
      controller: new AbortController(),
      settings,
      extra: this.suggestionContext(input.suggestionIds),
      done: Promise.resolve()
    }
    this.runs.set(runId, run)
    run.done = this.execute(run)
    return { threadId, runId }
  }

  /** Cancela una respuesta en curso. `false` si ya no estaba en marcha. */
  cancel(runId: string): boolean {
    const r = this.runs.get(runId)
    if (!r) return false
    r.controller.abort()
    return true
  }

  /** Cancela todas las respuestas (al cerrar la app). */
  cancelAll(): number {
    for (const r of this.runs.values()) r.controller.abort()
    return this.runs.size
  }

  /** Cancela la respuesta en curso de un hilo, si la hay. */
  cancelThread(threadId: string): void {
    const runId = this.byThread.get(threadId)
    if (runId) this.cancel(runId)
  }

  isRunning(threadId: string): boolean {
    return this.byThread.has(threadId)
  }

  /** Espera a que termine una respuesta (para tests y para cerrar con orden). */
  async wait(runId?: string): Promise<void> {
    const list = runId ? [this.runs.get(runId)] : [...this.runs.values()]
    await Promise.all(list.map((r) => r?.done))
  }

  private suggestionContext(ids: unknown): string | null {
    if (!Array.isArray(ids) || ids.length === 0) return null
    let all: AiSuggestion[] = []
    try {
      all = this.deps.suggestions()
    } catch {
      return null
    }
    const picked = all.filter((s) => ids.includes(s.id)).slice(0, 10)
    if (!picked.length) return null
    const lines = picked.map((s) => `- [${s.module}] ${s.title}: ${s.detail} (a ${s.asOf})`)
    return `\n\nSugerencias de la app que quiero que me comentes:\n${lines.join('\n')}`
  }

  /** Historial del hilo para el modelo: los últimos mensajes, sin resultados de herramienta huérfanos. */
  private history(run: Run): LlmMessage[] {
    const detail = this.deps.store.getThread(run.threadId)
    const msgs = (detail?.messages ?? []).slice(-AI_HISTORY_MAX_MESSAGES)
    while (msgs.length && msgs[0].role === 'tool') msgs.shift()
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user')
    return msgs.map((m, i): LlmMessage => {
      if (m.role === 'user') return { role: 'user', content: i === lastUser && run.extra ? m.content + run.extra : m.content }
      if (m.role === 'tool')
        return {
          role: 'tool',
          content: i > lastUser ? m.content : clip(m.content, AI_HISTORY_TOOL_MAX_CHARS),
          toolCallId: m.toolCallId ?? '',
          toolName: m.toolName ?? ''
        }
      return m.toolCalls?.length ? { role: 'assistant', content: m.content, toolCalls: m.toolCalls } : { role: 'assistant', content: m.content }
    })
  }

  private emit(e: AiEvent): void {
    try {
      this.deps.emit(e)
    } catch (err) {
      console.warn('No se ha podido enviar un evento del asistente', err)
    }
  }

  private async execute(run: Run): Promise<void> {
    const { runId, threadId } = run
    const signal = run.controller.signal
    const proposals: AiProposal[] = []
    let text = ''
    this.emit({ type: 'start', runId, threadId })
    try {
      const provider = this.deps.provider(run.settings)
      const schemas = this.toolSchemas()
      const messages: LlmMessage[] = [{ role: 'system', content: systemPrompt(this.deps.today()) }, ...this.history(run)]
      for (let step = 0; ; step++) {
        const allowTools = step < AI_MAX_TOOL_STEPS && schemas.length > 0
        const req = allowTools
          ? { model: run.settings.model, messages, tools: schemas, think: run.settings.think, signal }
          : {
              model: run.settings.model,
              messages: [...messages, { role: 'system' as const, content: 'Ya no puedes usar más herramientas: responde con lo que tienes.' }],
              think: run.settings.think,
              signal
            }
        text = ''
        const calls: LlmToolCall[] = []
        for await (const chunk of provider.chat(req)) {
          if (signal.aborted) throw new LlmError('aborted', 'Respuesta cancelada.')
          if (chunk.type === 'delta') {
            text += chunk.text
            this.emit({ type: 'delta', runId, threadId, text: chunk.text })
          } else if (chunk.type === 'toolCalls') calls.push(...chunk.calls)
          else break
        }
        if (signal.aborted) throw new LlmError('aborted', 'Respuesta cancelada.')
        if (!allowTools || calls.length === 0) break
        // Ids únicos dentro del paso (el proveedor puede no darlos).
        const seen = new Set<string>()
        const unique = calls.map((c) => {
          const id = c.id && !seen.has(c.id) ? c.id : `call_${this.newId()}`
          seen.add(id)
          return { ...c, id, arguments: c.arguments && typeof c.arguments === 'object' ? c.arguments : {} }
        })
        const saved = await this.deps.store.appendMessage(threadId, { role: 'assistant', content: text, toolCalls: unique })
        if (text.trim()) this.emit({ type: 'message', runId, threadId, message: saved })
        messages.push({ role: 'assistant', content: text, toolCalls: unique })
        text = ''
        for (const call of unique) {
          if (signal.aborted) throw new LlmError('aborted', 'Respuesta cancelada.')
          const result = this.runTool(run, call, proposals)
          await this.deps.store.appendMessage(threadId, { role: 'tool', content: result, toolCallId: call.id, toolName: call.name })
          messages.push({ role: 'tool', content: result, toolCallId: call.id, toolName: call.name })
        }
      }
      await this.finish(run, text, proposals)
      this.emit({ type: 'done', runId, threadId })
    } catch (e) {
      if (text.trim() || proposals.length) {
        try {
          await this.finish(run, text, proposals)
        } catch (err) {
          console.warn('No se ha podido guardar la respuesta a medias', err)
        }
      }
      const code = e instanceof LlmError ? e.code : 'internal'
      const message =
        e instanceof LlmError || e instanceof UserError ? e.message : `Algo ha fallado al preparar la respuesta: ${errorMessage(e)}`
      if (code === 'internal') console.error('[asistente]', e)
      this.emit({ type: 'error', runId, threadId, code, message })
    } finally {
      this.runs.delete(runId)
      if (this.byThread.get(threadId) === runId) this.byThread.delete(threadId)
    }
  }

  /** Guarda el mensaje final del asistente (con las propuestas de toda la respuesta) y lo emite. */
  private async finish(run: Run, text: string, proposals: AiProposal[]): Promise<void> {
    const msg = await this.deps.store.appendMessage(run.threadId, {
      role: 'assistant',
      content: text,
      ...(proposals.length ? { proposals } : {})
    })
    let out: AiMessage = msg
    const stored = msg.proposals ?? []
    if (stored.some((p) => p.messageId !== msg.id || p.threadId !== run.threadId)) {
      const fixed = stored.map((p) => ({ ...p, messageId: msg.id, threadId: run.threadId }))
      for (const p of fixed) await this.deps.store.updateProposal(p)
      out = { ...msg, proposals: fixed }
    }
    this.emit({ type: 'message', runId: run.runId, threadId: run.threadId, message: out })
  }

  /** Ejecuta una herramienta. Nunca lanza: un error vuelve al modelo como texto. */
  private runTool(run: Run, call: LlmToolCall, proposals: AiProposal[]): string {
    const tool = this.tools.get(call.name)
    const base = { runId: run.runId, threadId: run.threadId, name: call.name, label: tool?.label ?? call.name }
    this.emit({ type: 'tool', ...base, state: 'start' })
    try {
      if (!tool) throw new Error(`La herramienta «${call.name}» no existe.`)
      let result: unknown
      if (tool.kind === 'read') result = tool.run(this.deps.ctx, call.arguments)
      else {
        const created = this.makeProposals(run, tool, tool.plan(this.deps.ctx, call.arguments))
        proposals.push(...created)
        result = created.length
          ? {
              estado: 'propuesta creada, pendiente de confirmar',
              propuestas: created.map((p) => ({ titulo: p.title, cambios: p.changes.length, modo: p.mode === 'group' ? 'en grupo' : 'suelta' })),
              aviso: 'Todavía no se ha cambiado nada. Dile que lo revise y lo confirme en la tarjeta de la propuesta.'
            }
          : { estado: 'sin cambios', motivo: 'Ningún registro cumple lo pedido o ya está así. No se ha creado ninguna propuesta.' }
      }
      this.emit({ type: 'tool', ...base, state: 'end', ok: true })
      return toolResultText(result)
    } catch (e) {
      this.emit({ type: 'tool', ...base, state: 'end', ok: false })
      return clip(`Error: ${errorMessage(e)}`, AI_TOOL_RESULT_MAX_CHARS)
    }
  }

  /**
   * Propuestas de un plan. Con criterio común y al menos `AI_GROUP_MIN` cambios, una sola propuesta
   * en grupo (se confirma a la vez); si no, una propuesta suelta por cambio.
   */
  private makeProposals(run: Run, tool: AiActionToolDef<C>, plan: AiActionPlan): AiProposal[] {
    const drafts = Array.isArray(plan?.changes) ? plan.changes : []
    if (drafts.length === 0) return []
    if (drafts.length > AI_PROPOSAL_MAX_CHANGES)
      throw new UserError(`Son demasiados cambios a la vez (${drafts.length}; como mucho ${AI_PROPOSAL_MAX_CHANGES}). Acota el criterio.`)
    const createdAt = this.now().toISOString()
    const changes: AiChange[] = drafts.map((d) => ({ ...d, id: this.newId(), status: 'pending' }))
    const proposal = (mode: AiProposal['mode'], title: string, list: AiChange[]): AiProposal => ({
      id: this.newId(),
      threadId: run.threadId,
      messageId: '',
      tool: tool.name,
      mode,
      title,
      criterion: plan.criterion ?? null,
      changes: list,
      status: 'pending',
      createdAt,
      resolvedAt: null
    })
    const criterion = typeof plan.criterion === 'string' && plan.criterion.trim() ? plan.criterion.trim() : null
    if (criterion && changes.length >= AI_GROUP_MIN) return [proposal('group', `${capitalize(criterion)} (${changes.length} cambios)`, changes)]
    return changes.map((c) => ({ ...proposal('single', `${OP_VERB[c.op] ?? 'Cambiar'}: ${c.label}`, [c]), criterion }))
  }

  // -------------------------------------------------------------------------------------------------
  // Propuestas
  // -------------------------------------------------------------------------------------------------

  private pendingProposal(id: unknown): AiProposal {
    if (typeof id !== 'string' || !id) throw new UserError('Propuesta no válida.')
    const p = this.deps.store.getProposal(id)
    if (!p) throw new UserError('Esa propuesta ya no existe.')
    if (p.status !== 'pending') throw new UserError('Esta propuesta ya no está pendiente.')
    if (this.resolving.has(id)) throw new UserError('Esta propuesta ya se está aplicando.')
    return p
  }

  /**
   * Aplica una propuesta pendiente. Primero comprueba que ningún registro ha cambiado desde que se
   * propuso (si alguno cambió, la propuesta caduca y no se escribe nada). Después aplica los cambios
   * en orden; si uno falla, se para (`partial`, o `failed` si fue el primero).
   */
  async acceptProposal(proposalId: string): Promise<AiProposal> {
    const p = this.pendingProposal(proposalId)
    this.resolving.add(p.id)
    try {
      const tool = this.tools.get(p.tool)
      const resolvedAt = () => this.now().toISOString()
      if (!tool || tool.kind !== 'action') {
        const out: AiProposal = {
          ...p,
          status: 'failed',
          resolvedAt: resolvedAt(),
          changes: p.changes.map((c) => ({ ...c, status: 'skipped', error: 'Esta acción ya no existe en la app.' }))
        }
        await this.deps.store.updateProposal(out)
        return out
      }
      const stale = p.changes.some((c) => {
        try {
          return tool.fingerprint(this.deps.ctx, c) !== c.fingerprint
        } catch {
          return true
        }
      })
      if (stale) {
        const out: AiProposal = { ...p, status: 'stale', resolvedAt: resolvedAt(), changes: p.changes.map((c) => ({ ...c, status: 'skipped' })) }
        await this.deps.store.updateProposal(out)
        return out
      }
      const changes: AiChange[] = p.changes.map((c) => ({ ...c }))
      let failedAt = -1
      for (let i = 0; i < changes.length; i++) {
        try {
          await tool.apply(this.deps.ctx, changes[i])
          changes[i] = { ...changes[i], status: 'applied' }
        } catch (e) {
          changes[i] = { ...changes[i], status: 'failed', error: errorMessage(e) }
          failedAt = i
          break
        }
      }
      if (failedAt >= 0) for (let i = failedAt + 1; i < changes.length; i++) changes[i] = { ...changes[i], status: 'skipped' }
      const status: AiProposal['status'] = failedAt < 0 ? 'applied' : failedAt === 0 ? 'failed' : 'partial'
      const out: AiProposal = { ...p, status, changes, resolvedAt: resolvedAt() }
      await this.deps.store.updateProposal(out)
      return out
    } finally {
      this.resolving.delete(p.id)
    }
  }

  async rejectProposal(proposalId: string): Promise<AiProposal> {
    const p = this.pendingProposal(proposalId)
    const out: AiProposal = {
      ...p,
      status: 'rejected',
      resolvedAt: this.now().toISOString(),
      changes: p.changes.map((c) => ({ ...c, status: 'skipped' }))
    }
    await this.deps.store.updateProposal(out)
    return out
  }

  // -------------------------------------------------------------------------------------------------
  // Sugerencias
  // -------------------------------------------------------------------------------------------------

  suggestions(): AiSuggestion[] {
    return this.deps.suggestions()
  }
}

/**
 * Sugerencias de todos los módulos. Un módulo que falla no tumba los demás (se avisa por consola).
 */
export function collectSuggestions<C>(modules: ReadonlyArray<{ id: string; suggestions?: (ctx: C) => AiSuggestion[] }>, ctx: C): AiSuggestion[] {
  const out: AiSuggestion[] = []
  const seen = new Set<string>()
  for (const m of modules) {
    if (!m.suggestions) continue
    try {
      for (const s of m.suggestions(ctx) ?? []) {
        if (seen.has(s.id)) continue
        seen.add(s.id)
        out.push(s)
      }
    } catch (e) {
      console.warn(`Las sugerencias de ${m.id} han fallado; se muestran las demás.`, e)
    }
  }
  return out
}
