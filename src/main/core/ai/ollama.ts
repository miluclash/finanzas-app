// Proveedor Ollama (IA local, regla 8 de CLAUDE.md). Es el ÚNICO sitio de src/main, src/shared y
// src/preload que hace peticiones de red (lo comprueba tests/core/reglas.test.ts), y solo a este
// equipo: antes de cada petición se valida la URL con `isLocalAiUrl` y no se siguen redirecciones.
//
// API de Ollama que se usa:
// - `GET  /api/tags`: modelos descargados (con un tiempo de espera corto).
// - `POST /api/chat` con `stream: true`: respuesta en NDJSON (un objeto JSON por línea). Cada línea
//   trae `message.content` (texto nuevo) y, si el modelo quiere usar herramientas,
//   `message.tool_calls`; la última lleva `done: true`. Un error llega como `{ "error": "…" }`.
import type {
  LlmChatRequest,
  LlmChunk,
  LlmMessage,
  LlmModelInfo,
  LlmProvider,
  LlmToolCall
} from '@shared/core/ai-types'
import { isLocalAiUrl } from '@shared/core/ai-settings'
import { LlmError } from './llmError'

export interface OllamaOptions {
  baseUrl: string
  /** Espera máxima hasta el primer trozo de la respuesta (incluye cargar el modelo en memoria). */
  firstChunkTimeoutMs?: number
  /** Espera máxima entre dos trozos seguidos. */
  chunkTimeoutMs?: number
  /** Espera máxima de la lista de modelos (sirve para saber si Ollama está encendido). */
  listTimeoutMs?: number
  /**
   * Ventana de contexto que se pide al modelo (`options.num_ctx`). La de Ollama por defecto (unos 4000
   * tokens) no llega: solo las descripciones de las herramientas ocupan unos 6000.
   */
  numCtx?: number
}

/** La primera carga de un modelo de 5 GB en un portátil puede tardar: se espera hasta 5 minutos. */
const FIRST_CHUNK_TIMEOUT_MS = 300_000
const CHUNK_TIMEOUT_MS = 120_000
const LIST_TIMEOUT_MS = 4_000
/** 12 288 tokens: con qwen3:8b cabe casi entero en 8 GB de VRAM (lo que no cabe, Ollama lo pasa a la RAM). */
export const OLLAMA_NUM_CTX = 12_288

type Reason = 'timeout' | 'aborted' | null

interface OllamaToolCall {
  id?: string
  function?: { name?: unknown; arguments?: unknown }
}

let callSeq = 0
const newCallId = (): string => `call_${Date.now().toString(36)}_${(++callSeq).toString(36)}`

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
      // argumentos ilegibles: la herramienta los rechazará con un mensaje útil
    }
  }
  return {}
}

/** Mensajes del contrato → formato de Ollama. */
export function toOllamaMessages(messages: readonly LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'assistant') {
      const out: Record<string, unknown> = { role: 'assistant', content: m.content }
      if (m.toolCalls?.length) out.tool_calls = m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } }))
      return out
    }
    if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.toolName }
    return { role: m.role, content: m.content }
  })
}

function shortText(s: string, max = 200): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Texto del error de Ollama (`{ "error": "…" }`) o el cuerpo tal cual. */
function errorText(body: string): string {
  try {
    const v = JSON.parse(body) as { error?: unknown }
    if (typeof v.error === 'string') return v.error
  } catch {
    // no es JSON
  }
  return body
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama'
  private readonly base: string
  private readonly firstChunkTimeoutMs: number
  private readonly chunkTimeoutMs: number
  private readonly listTimeoutMs: number
  private readonly numCtx: number

  constructor(opts: OllamaOptions) {
    this.base = opts.baseUrl.trim().replace(/\/+$/, '')
    this.firstChunkTimeoutMs = opts.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS
    this.chunkTimeoutMs = opts.chunkTimeoutMs ?? CHUNK_TIMEOUT_MS
    this.listTimeoutMs = opts.listTimeoutMs ?? LIST_TIMEOUT_MS
    this.numCtx = opts.numCtx ?? OLLAMA_NUM_CTX
  }

  /** URL de un endpoint, comprobando que es de este equipo (si no, `bad_url`). */
  private url(endpoint: string): string {
    const full = `${this.base}${endpoint}`
    if (!isLocalAiUrl(this.base) || !isLocalAiUrl(full))
      throw new LlmError('bad_url', 'La dirección de Ollama tiene que ser de este equipo (localhost, 127.0.0.1 o ::1). Cámbiala en Ajustes → Asistente.')
    return full
  }

  private netError(e: unknown, reason: Reason, what: 'chat' | 'list'): LlmError {
    if (e instanceof LlmError) return e
    if (reason === 'aborted') return new LlmError('aborted', 'Respuesta cancelada.')
    if (reason === 'timeout')
      return what === 'chat'
        ? new LlmError(
            'timeout',
            'Ollama no ha respondido a tiempo. Si es la primera pregunta, puede que aún esté cargando el modelo: espera un poco y vuelve a intentarlo.'
          )
        : new LlmError('timeout', `Ollama no responde en ${this.base}. Comprueba que está en marcha.`)
    return new LlmError(
      'unreachable',
      `No se puede conectar con Ollama en ${this.base}. Comprueba que está instalado y en marcha (abre Ollama o ejecuta «ollama serve»).`
    )
  }

  private httpError(status: number, body: string, model: string | null): LlmError {
    const text = errorText(body)
    if (model && (status === 404 || /not found/i.test(text)) && /model/i.test(text))
      return new LlmError('model_missing', `Falta el modelo «${model}». Descárgalo con «ollama pull ${model}» y vuelve a intentarlo.`)
    if (model && /does not support tools/i.test(text))
      return new LlmError('bad_response', `El modelo «${model}» no sabe usar herramientas. Elige otro en Ajustes → Asistente (por ejemplo, qwen3:8b).`)
    return new LlmError('bad_response', `Ollama ha respondido con un error (${status})${text ? `: ${shortText(text)}` : ''}.`)
  }

  async listModels(signal?: AbortSignal): Promise<LlmModelInfo[]> {
    const url = this.url('/api/tags')
    const ctrl = new AbortController()
    let reason: Reason = null
    const onAbort = () => {
      reason ??= 'aborted'
      ctrl.abort()
    }
    if (signal?.aborted) throw new LlmError('aborted', 'Respuesta cancelada.')
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      reason ??= 'timeout'
      ctrl.abort()
    }, this.listTimeoutMs)
    try {
      let res: Response
      let body: string
      try {
        res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'error' })
        body = await res.text()
      } catch (e) {
        throw this.netError(e, reason, 'list')
      }
      if (!res.ok) throw this.httpError(res.status, body, null)
      let data: unknown
      try {
        data = JSON.parse(body)
      } catch {
        throw new LlmError('bad_response', 'Ollama ha devuelto una lista de modelos que no se entiende.')
      }
      const models = (data as { models?: unknown }).models
      if (!Array.isArray(models)) throw new LlmError('bad_response', 'Ollama ha devuelto una lista de modelos que no se entiende.')
      const out: LlmModelInfo[] = []
      for (const m of models as Array<{ name?: unknown; model?: unknown; size?: unknown }>) {
        const name = typeof m?.name === 'string' ? m.name : typeof m?.model === 'string' ? m.model : null
        if (!name) continue
        out.push(typeof m.size === 'number' ? { name, size: m.size } : { name })
      }
      return out
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  async *chat(req: LlmChatRequest): AsyncGenerator<LlmChunk> {
    const url = this.url('/api/chat')
    if (req.signal?.aborted) throw new LlmError('aborted', 'Respuesta cancelada.')
    const ctrl = new AbortController()
    let reason: Reason = null
    const onAbort = () => {
      reason ??= 'aborted'
      ctrl.abort()
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        reason ??= 'timeout'
        ctrl.abort()
      }, ms)
    }
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOllamaMessages(req.messages),
      stream: true,
      think: req.think === true,
      options: { num_ctx: this.numCtx }
    }
    if (req.tools?.length)
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
    try {
      arm(this.firstChunkTimeoutMs)
      let res: Response | null = null
      // Un modelo sin modo de razonamiento rechaza el campo `think` (aunque sea false): se reintenta sin él.
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        let r: Response
        try {
          r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
            redirect: 'error'
          })
        } catch (e) {
          throw this.netError(e, reason, 'chat')
        }
        if (r.ok) {
          res = r
          break
        }
        let text = ''
        try {
          text = await r.text()
        } catch (e) {
          throw this.netError(e, reason, 'chat')
        }
        if (attempt === 0 && body.think === false && /does not support thinking/i.test(errorText(text))) {
          delete body.think
          continue
        }
        throw this.httpError(r.status, text, req.model)
      }
      if (!res?.body) throw new LlmError('bad_response', 'Ollama no ha devuelto ninguna respuesta.')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      const handle = (line: string): LlmChunk[] => {
        let obj: {
          error?: unknown
          done?: unknown
          message?: { content?: unknown; tool_calls?: unknown }
          prompt_eval_count?: unknown
          eval_count?: unknown
        }
        try {
          obj = JSON.parse(line)
        } catch {
          throw new LlmError('bad_response', 'Ollama ha enviado una respuesta que no se entiende.')
        }
        if (typeof obj.error === 'string') throw this.httpError(500, JSON.stringify({ error: obj.error }), req.model)
        const out: LlmChunk[] = []
        const content = obj.message?.content
        if (typeof content === 'string' && content) out.push({ type: 'delta', text: content })
        const calls = obj.message?.tool_calls
        if (Array.isArray(calls) && calls.length) {
          const list: LlmToolCall[] = []
          for (const c of calls as OllamaToolCall[]) {
            const name = c?.function?.name
            if (typeof name !== 'string' || !name) continue
            list.push({ id: typeof c.id === 'string' && c.id ? c.id : newCallId(), name, arguments: parseArguments(c.function?.arguments) })
          }
          if (list.length) out.push({ type: 'toolCalls', calls: list })
        }
        if (obj.done === true) {
          finished = true
          const done: LlmChunk = { type: 'done' }
          if (typeof obj.prompt_eval_count === 'number') done.promptTokens = obj.prompt_eval_count
          if (typeof obj.eval_count === 'number') done.completionTokens = obj.eval_count
          out.push(done)
        }
        return out
      }
      for (;;) {
        let r: Awaited<ReturnType<typeof reader.read>>
        try {
          r = await reader.read()
        } catch (e) {
          throw this.netError(e, reason, 'chat')
        }
        if (r.done) break
        arm(this.chunkTimeoutMs)
        buffer += decoder.decode(r.value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) for (const c of handle(line)) yield c
          if (finished) return
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) for (const c of handle(buffer.trim())) yield c
      if (!finished) {
        if (reason) throw this.netError(new Error('cortado'), reason, 'chat')
        throw new LlmError('bad_response', 'La respuesta de Ollama se ha cortado antes de terminar.')
      }
    } finally {
      clearTimeout(timer)
      req.signal?.removeEventListener('abort', onAbort)
      // Cierra la conexión si el consumidor deja de leer antes de tiempo (no hace nada si ya acabó).
      ctrl.abort()
    }
  }
}
