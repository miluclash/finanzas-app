// Almacén de conversaciones del asistente (`core_ai_threads`, `core_ai_messages`, migración 1003) y
// de las propuestas de cambio, que van dentro de su mensaje (`proposals_json`). Cumple `AiStore` del
// contrato (`src/shared/core/ai-types.ts`).
//
// - Lecturas síncronas desde la base en memoria; escrituras por la cola (`core:ai.<acción>`).
// - Sin auditoría: es conversación, no datos de dominio. Lo que la IA cambia de verdad (al confirmar
//   una propuesta) lo audita el servicio de siempre.
// - Ids: `randomUUID` (los mismos que usan los importadores para sus fichas).
// - `appendMessage` rellena el `threadId` y el `messageId` de sus propuestas (el id del mensaje no
//   existe hasta guardarlo) y da id a las propuestas y cambios que lleguen sin él.
import { randomUUID } from 'node:crypto'
import type {
  AiChangeStatus,
  AiMessage,
  AiMessageRole,
  AiProposal,
  AiProposalStatus,
  AiStore,
  AiThread,
  AiThreadDetail,
  LlmToolCall,
  NewAiMessage
} from '@shared/core/ai-types'
import { coreOf, type CoreRef } from './context'
import { UserError } from './errors'

/** Longitud máxima del título de una conversación (se recorta, no se rechaza). */
export const AI_THREAD_TITLE_MAX = 120
/** Título de una conversación que empieza sin texto. */
export const AI_THREAD_DEFAULT_TITLE = 'Conversación nueva'

const ROLES: readonly AiMessageRole[] = ['user', 'assistant', 'tool']
const PROPOSAL_STATUSES: readonly AiProposalStatus[] = ['pending', 'applied', 'partial', 'rejected', 'stale', 'failed']
const CHANGE_STATUSES: readonly AiChangeStatus[] = ['pending', 'applied', 'failed', 'skipped']

interface ThreadRow {
  id: string
  title: string
  model: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  thread_id: string
  seq: number
  role: AiMessageRole
  content: string
  tool_calls_json: string | null
  tool_call_id: string | null
  tool_name: string | null
  proposals_json: string | null
  created_at: string
}

export interface AiStoreOptions {
  /** Marca de tiempo ISO (por defecto, la hora actual). */
  now?: () => string
  /** Generador de ids (por defecto, `randomUUID`). */
  newId?: () => string
}

const rowToThread = (r: ThreadRow): AiThread => ({
  id: r.id,
  title: r.title,
  model: r.model,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

function parseArray<T>(text: string | null): T[] | undefined {
  if (text == null) return undefined
  try {
    const v: unknown = JSON.parse(text)
    return Array.isArray(v) ? (v as T[]) : undefined
  } catch {
    return undefined
  }
}

function rowToMessage(r: MessageRow): AiMessage {
  const m: AiMessage = { id: r.id, threadId: r.thread_id, role: r.role, content: r.content, createdAt: r.created_at }
  const calls = parseArray<LlmToolCall>(r.tool_calls_json)
  if (calls) m.toolCalls = calls
  if (r.tool_call_id != null) m.toolCallId = r.tool_call_id
  if (r.tool_name != null) m.toolName = r.tool_name
  const proposals = parseArray<AiProposal>(r.proposals_json)
  if (proposals) m.proposals = proposals
  return m
}

/** Espacios seguidos a uno, sin espacios a los lados y recortado a `AI_THREAD_TITLE_MAX`. */
export function normalizeThreadTitle(title: unknown): string {
  if (typeof title !== 'string') return ''
  return [...title.replace(/\s+/g, ' ').trim()].slice(0, AI_THREAD_TITLE_MAX).join('').trim()
}

/** Comprueba la forma de una propuesta antes de guardarla; lanza un error con el motivo. */
function checkProposal(p: AiProposal): void {
  const bad = (why: string) => new Error(`Propuesta «${String(p?.id)}» no válida: ${why}`)
  if (!p || typeof p !== 'object') throw new Error('Propuesta no válida.')
  if (typeof p.tool !== 'string' || !p.tool) throw bad('le falta la herramienta.')
  if (p.mode !== 'single' && p.mode !== 'group') throw bad(`modo «${String(p.mode)}» desconocido.`)
  if (!PROPOSAL_STATUSES.includes(p.status)) throw bad(`estado «${String(p.status)}» desconocido.`)
  if (!Array.isArray(p.changes) || p.changes.length === 0) throw bad('no tiene cambios.')
  for (const c of p.changes) if (!c || !CHANGE_STATUSES.includes(c.status)) throw bad(`estado de cambio «${String(c?.status)}» desconocido.`)
}

/** Consulta que encuentra la propuesta `?` dentro de las propuestas de los mensajes. */
const FIND_PROPOSAL = `SELECT m.id AS message_id, m.thread_id AS thread_id, m.proposals_json AS proposals_json, j.key AS idx
  FROM core_ai_messages m, json_each(m.proposals_json) j
  WHERE m.proposals_json IS NOT NULL AND json_extract(j.value, '$.id') = ?
  LIMIT 1`

interface FoundProposal {
  message_id: string
  thread_id: string
  proposals_json: string
  idx: number
}

export function createAiStore(ref: CoreRef, opts: AiStoreOptions = {}): AiStore {
  const ctx = coreOf(ref)
  const now = opts.now ?? (() => new Date().toISOString())
  const newId = opts.newId ?? (() => randomUUID())
  const getThreadRow = (id: string) => ctx.db.get<ThreadRow>('SELECT * FROM core_ai_threads WHERE id = ?', [id])
  const findProposal = (id: string) => ctx.db.get<FoundProposal>(FIND_PROPOSAL, [id])
  const checkId = (id: unknown, what: string): string => {
    if (typeof id !== 'string' || !id) throw new UserError(`Id de ${what} no válido.`)
    return id
  }

  return {
    listThreads: () =>
      ctx.db.all<ThreadRow>('SELECT * FROM core_ai_threads ORDER BY updated_at DESC, created_at DESC, rowid DESC').map(rowToThread),

    getThread: (id): AiThreadDetail | null => {
      if (typeof id !== 'string' || !id) return null
      const t = getThreadRow(id)
      if (!t) return null
      const messages = ctx.db.all<MessageRow>('SELECT * FROM core_ai_messages WHERE thread_id = ? ORDER BY seq', [id]).map(rowToMessage)
      return { thread: rowToThread(t), messages }
    },

    createThread: (input) => {
      const title = normalizeThreadTitle(input?.title) || AI_THREAD_DEFAULT_TITLE
      const model = typeof input?.model === 'string' ? input.model.trim() : ''
      return ctx.queue.enqueue('core:ai.threads.create', () => {
        const ts = now()
        const thread: AiThread = { id: newId(), title, model, createdAt: ts, updatedAt: ts }
        ctx.db.run('INSERT INTO core_ai_threads (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
          thread.id,
          title,
          model,
          ts,
          ts
        ])
        return thread
      })
    },

    renameThread: (id, title) => {
      let threadId: string
      try {
        threadId = checkId(id, 'conversación')
      } catch (e) {
        return Promise.reject(e)
      }
      const t = normalizeThreadTitle(title)
      if (!t) return Promise.reject(new UserError('El título no puede estar vacío.'))
      return ctx.queue.enqueue('core:ai.threads.rename', () => {
        if (!getThreadRow(threadId)) throw new UserError('Esa conversación ya no existe.')
        ctx.db.run('UPDATE core_ai_threads SET title = ? WHERE id = ?', [t, threadId])
      })
    },

    appendMessage: (threadId, msg) => {
      try {
        checkId(threadId, 'conversación')
        if (!msg || !ROLES.includes(msg.role)) throw new Error(`Rol de mensaje desconocido: «${String(msg?.role)}».`)
        if (typeof msg.content !== 'string') throw new Error('El contenido del mensaje tiene que ser texto.')
        if (msg.toolCalls !== undefined && (msg.role !== 'assistant' || !Array.isArray(msg.toolCalls)))
          throw new Error('Solo los mensajes del asistente llevan llamadas a herramientas.')
        if ((msg.toolCallId !== undefined || msg.toolName !== undefined) && msg.role !== 'tool')
          throw new Error('Solo los mensajes de herramienta llevan toolCallId y toolName.')
        if (msg.proposals !== undefined && (msg.role !== 'assistant' || !Array.isArray(msg.proposals)))
          throw new Error('Solo los mensajes del asistente llevan propuestas.')
        for (const p of msg.proposals ?? []) checkProposal(p)
      } catch (e) {
        return Promise.reject(e)
      }
      const input: NewAiMessage = msg
      return ctx.queue.enqueue('core:ai.messages.append', () => {
        if (!getThreadRow(threadId)) throw new UserError('Esa conversación ya no existe.')
        const ts = now()
        const id = newId()
        const seq = (ctx.db.get<{ n: number | null }>('SELECT MAX(seq) AS n FROM core_ai_messages WHERE thread_id = ?', [threadId])?.n ?? 0) + 1
        const proposals = (input.proposals ?? []).map(
          (p): AiProposal => ({
            ...p,
            id: p.id || newId(),
            threadId,
            messageId: id,
            changes: p.changes.map((c) => ({ ...c, id: c.id || newId() }))
          })
        )
        const ids = new Set<string>()
        for (const p of proposals) {
          if (ids.has(p.id) || findProposal(p.id)) throw new Error(`Id de propuesta repetido: «${p.id}».`)
          ids.add(p.id)
        }
        const message: AiMessage = { id, threadId, role: input.role, content: input.content, createdAt: ts }
        if (input.toolCalls) message.toolCalls = input.toolCalls
        if (input.toolCallId !== undefined) message.toolCallId = input.toolCallId
        if (input.toolName !== undefined) message.toolName = input.toolName
        if (proposals.length > 0) message.proposals = proposals
        ctx.db.run(
          `INSERT INTO core_ai_messages (id, thread_id, seq, role, content, tool_calls_json, tool_call_id, tool_name, proposals_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            threadId,
            seq,
            message.role,
            message.content,
            message.toolCalls ? JSON.stringify(message.toolCalls) : null,
            message.toolCallId ?? null,
            message.toolName ?? null,
            message.proposals ? JSON.stringify(message.proposals) : null,
            ts
          ]
        )
        ctx.db.run('UPDATE core_ai_threads SET updated_at = ? WHERE id = ?', [ts, threadId])
        return message
      })
    },

    deleteThread: (id) => {
      if (typeof id !== 'string' || !id) return Promise.reject(new UserError('Id de conversación no válido.'))
      return ctx.queue.enqueue('core:ai.threads.delete', () => {
        // Los mensajes se borrarían solos (ON DELETE CASCADE); se borran también aquí para no
        // depender de `PRAGMA foreign_keys`.
        ctx.db.run('DELETE FROM core_ai_messages WHERE thread_id = ?', [id])
        ctx.db.run('DELETE FROM core_ai_threads WHERE id = ?', [id])
      })
    },

    deleteAllThreads: () =>
      ctx.queue.enqueue('core:ai.threads.deleteAll', () => {
        const n = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM core_ai_threads')?.n ?? 0
        if (n === 0 && !ctx.db.get('SELECT 1 AS x FROM core_ai_messages LIMIT 1')) return 0
        ctx.db.run('DELETE FROM core_ai_messages')
        ctx.db.run('DELETE FROM core_ai_threads')
        return n
      }),

    getProposal: (id) => {
      if (typeof id !== 'string' || !id) return null
      const found = findProposal(id)
      if (!found) return null
      const list = parseArray<AiProposal>(found.proposals_json)
      return list?.[Number(found.idx)] ?? null
    },

    updateProposal: (p) => {
      try {
        checkId(p?.id, 'propuesta')
        checkProposal(p)
      } catch (e) {
        return Promise.reject(e)
      }
      const proposal: AiProposal = p
      return ctx.queue.enqueue('core:ai.proposals.update', () => {
        const found = findProposal(proposal.id)
        if (!found) throw new UserError('Esa propuesta ya no existe.')
        if (proposal.threadId !== found.thread_id || proposal.messageId !== found.message_id)
          throw new Error(`La propuesta «${proposal.id}» no puede cambiar de conversación ni de mensaje.`)
        const list = parseArray<AiProposal>(found.proposals_json) ?? []
        list[Number(found.idx)] = proposal
        ctx.db.run('UPDATE core_ai_messages SET proposals_json = ? WHERE id = ?', [JSON.stringify(list), found.message_id])
      })
    }
  }
}
