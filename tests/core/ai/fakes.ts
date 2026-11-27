// Dobles de prueba del asistente: proveedor falso (sin Ollama), almacén y ajustes en memoria.
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_AI_SETTINGS,
  type AiEvent,
  type AiMessage,
  type AiProposal,
  type AiSettings,
  type AiSettingsPatch,
  type AiSettingsStore,
  type AiStore,
  type AiThread,
  type LlmChatRequest,
  type LlmChunk,
  type LlmModelInfo,
  type LlmProvider,
  type LlmToolCall
} from '../../../src/shared/core/ai-types'

export type Script = (req: LlmChatRequest, call: number) => LlmChunk[] | AsyncIterable<LlmChunk>

/** Proveedor guionizado: cada llamada a `chat` devuelve lo que diga el guion y se apunta la petición. */
export class FakeProvider implements LlmProvider {
  readonly id = 'fake'
  readonly requests: LlmChatRequest[] = []
  models: LlmModelInfo[] = [{ name: 'qwen3:8b' }]
  listError: Error | null = null

  constructor(private readonly script: Script = () => text('Hola.')) {}

  async listModels(): Promise<LlmModelInfo[]> {
    if (this.listError) throw this.listError
    return this.models
  }

  async *chat(req: LlmChatRequest): AsyncGenerator<LlmChunk> {
    this.requests.push({ ...req, messages: req.messages.map((m) => ({ ...m })) })
    const out = this.script(req, this.requests.length - 1)
    for await (const c of out as AsyncIterable<LlmChunk>) yield c
  }
}

export const text = (...parts: string[]): LlmChunk[] => [...parts.map((t): LlmChunk => ({ type: 'delta', text: t })), { type: 'done' }]

export const calls = (...list: Array<[string, Record<string, unknown>]>): LlmChunk[] => [
  { type: 'toolCalls', calls: list.map(([name, args], i): LlmToolCall => ({ id: `c${i}`, name, arguments: args })) },
  { type: 'done' }
]

/** Almacén de conversaciones en memoria (misma forma que el real, sin base de datos). */
export class MemoryStore implements AiStore {
  threads: AiThread[] = []
  messages: AiMessage[] = []
  private seq = 0
  private ts = () => new Date(Date.UTC(2026, 10, 27, 10, 0, this.seq++)).toISOString()

  listThreads() {
    return [...this.threads]
  }
  getThread(id: string) {
    const thread = this.threads.find((t) => t.id === id)
    return thread ? { thread, messages: this.messages.filter((m) => m.threadId === id) } : null
  }
  async createThread(input: { title: string; model: string }) {
    const t: AiThread = { id: randomUUID(), title: input.title, model: input.model, createdAt: this.ts(), updatedAt: this.ts() }
    this.threads.push(t)
    return t
  }
  async renameThread(id: string, title: string) {
    const t = this.threads.find((x) => x.id === id)
    if (t) t.title = title
  }
  async appendMessage(threadId: string, msg: Omit<AiMessage, 'id' | 'threadId' | 'createdAt'>) {
    if (!this.threads.some((t) => t.id === threadId)) throw new Error('Esa conversación ya no existe.')
    const id = randomUUID()
    const m: AiMessage = { ...msg, id, threadId, createdAt: this.ts() }
    if (msg.proposals) m.proposals = msg.proposals.map((p) => ({ ...p, threadId, messageId: id }))
    this.messages.push(JSON.parse(JSON.stringify(m)))
    return m
  }
  async deleteThread(id: string) {
    this.threads = this.threads.filter((t) => t.id !== id)
    this.messages = this.messages.filter((m) => m.threadId !== id)
  }
  async deleteAllThreads() {
    const n = this.threads.length
    this.threads = []
    this.messages = []
    return n
  }
  getProposal(id: string): AiProposal | null {
    for (const m of this.messages) for (const p of m.proposals ?? []) if (p.id === id) return JSON.parse(JSON.stringify(p))
    return null
  }
  async updateProposal(p: AiProposal) {
    for (const m of this.messages) if (m.proposals) m.proposals = m.proposals.map((x) => (x.id === p.id ? JSON.parse(JSON.stringify(p)) : x))
  }
}

export class MemorySettings implements AiSettingsStore {
  constructor(public value: AiSettings = { ...DEFAULT_AI_SETTINGS }) {}
  get() {
    return { ...this.value }
  }
  async save(patch: AiSettingsPatch) {
    this.value = { ...this.value, ...patch }
    return this.get()
  }
}

/** Recoge los eventos del asistente. */
export function eventLog() {
  const events: AiEvent[] = []
  return { events, emit: (e: AiEvent) => void events.push(e), types: () => events.map((e) => e.type) }
}
