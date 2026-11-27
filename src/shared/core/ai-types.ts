// Contrato de la IA local (F6). Lo comparten el núcleo, los módulos y la interfaz:
// proveedor de modelo (`LlmProvider`), herramientas que registra cada módulo, propuestas de cambio
// con confirmación, sugerencias, conversaciones guardadas, métodos `core:ai.*` y eventos `ai:event`.
//
// Solo tipos y constantes. El proveedor Ollama, el orquestador y el almacén viven en
// `src/main/core/ai/`; las herramientas de cada módulo en `src/main/modules/<módulo>/aiTools.ts`.
// Ver docs/EVOLUCION.md §8 y el plan de F6.
//
// Reglas que fija este contrato:
// - Solo el proceso principal habla con el modelo, y solo en localhost (`AI_LOCAL_HOSTS`).
// - Las herramientas `read` devuelven datos resumidos y limitados (nunca tablas enteras).
// - Las herramientas `action` NO escriben: devuelven un plan de cambios. Se escribe solo cuando
//   Michael confirma, llamando a `apply`, que usa el mismo servicio que la página (y por tanto la
//   cola de escritura, la validación y la auditoría de siempre).
import type { ISODate } from '../types'

// ---------------------------------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------------------------------

/** Canal de eventos del proceso principal a la interfaz (streaming de respuestas). */
export const AI_EVENT_CHANNEL = 'ai:event'

/** Hosts admitidos para el proveedor. Cualquier otra URL se rechaza. */
export const AI_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'] as const

/** Ajustes por defecto del asistente. */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:8b',
  think: false
}

/** Pasos máximos del bucle de herramientas por petición de Michael. */
export const AI_MAX_TOOL_STEPS = 6
/** Tamaño máximo (caracteres) del resultado de una herramienta que se envía al modelo. */
export const AI_TOOL_RESULT_MAX_CHARS = 8000
/** Movimientos máximos que devuelve una búsqueda de movimientos. */
export const AI_TX_SEARCH_MAX = 50
/** Mensajes anteriores de la conversación que se reenvían al modelo como contexto. */
export const AI_HISTORY_MAX_MESSAGES = 20
/**
 * A partir de cuántos cambios relacionados (mismo tipo, misma petición, mismo criterio) se
 * agrupan en una sola propuesta que se confirma de una vez. Por debajo, o sin criterio común,
 * cada cambio es una propuesta que se confirma por separado (decisión de Michael, 27/11/2026).
 */
export const AI_GROUP_MIN = 3

/** Nombre de herramienta: `<dueño>_<nombre>` en minúsculas (Ollama no admite puntos). */
export const AI_TOOL_NAME_RE = /^(core|finanzas|entreno)_[a-z][a-z0-9_]*$/

// ---------------------------------------------------------------------------------------------------
// Proveedor de modelo
// ---------------------------------------------------------------------------------------------------

/** Esquema JSON (subconjunto) de los parámetros de una herramienta, tal como lo recibe el modelo. */
export interface AiJsonSchema {
  type: 'object'
  properties: Record<string, Record<string, unknown>>
  required?: string[]
  additionalProperties?: boolean
}

export interface LlmToolCall {
  /** Id propio (el orquestador lo genera si el proveedor no da uno). */
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; toolName: string }

export interface LlmToolSchema {
  name: string
  description: string
  parameters: AiJsonSchema
}

export interface LlmChatRequest {
  model: string
  messages: LlmMessage[]
  tools?: LlmToolSchema[]
  /** Modo de razonamiento del modelo (Qwen 3). Apagado por defecto. */
  think?: boolean
  signal?: AbortSignal
}

/** Trozos que va devolviendo el proveedor. Siempre termina en `done` o lanza `LlmError`. */
export type LlmChunk =
  | { type: 'delta'; text: string }
  | { type: 'toolCalls'; calls: LlmToolCall[] }
  | { type: 'done'; promptTokens?: number; completionTokens?: number }

export interface LlmModelInfo {
  name: string
  /** Tamaño en bytes, si el proveedor lo da. */
  size?: number
}

export const LLM_ERROR_CODES = ['disabled', 'unreachable', 'model_missing', 'timeout', 'aborted', 'bad_url', 'bad_response'] as const
export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number]

/** Forma de los errores del proveedor (el proveedor lanza un `Error` con estas propiedades). */
export interface LlmErrorInfo {
  code: LlmErrorCode
  /** Mensaje en español para Michael. */
  message: string
}

/**
 * Proveedor intercambiable. Hoy solo existe `OllamaProvider`; uno futuro (p. ej. un puente con
 * Claude) sería otra implementación sin tocar el resto.
 */
export interface LlmProvider {
  readonly id: string
  /** Modelos disponibles. Lanza `LlmError` (`unreachable`, `timeout`…) si no responde. */
  listModels(signal?: AbortSignal): Promise<LlmModelInfo[]>
  /** Conversación con herramientas, en streaming. */
  chat(req: LlmChatRequest): AsyncIterable<LlmChunk>
}

// ---------------------------------------------------------------------------------------------------
// Ajustes y estado
// ---------------------------------------------------------------------------------------------------

export interface AiSettings {
  /** Si está apagado, el panel lo dice y no se llama al proveedor. */
  enabled: boolean
  /** URL de Ollama; tiene que ser de `AI_LOCAL_HOSTS`. */
  baseUrl: string
  model: string
  think: boolean
}

export type AiSettingsPatch = Partial<AiSettings>

export type AiStatusState = 'disabled' | 'unreachable' | 'model_missing' | 'ready'

export interface AiStatus {
  state: AiStatusState
  settings: AiSettings
  /** Modelos descargados (vacío si Ollama no responde). */
  models: LlmModelInfo[]
  /** Explicación en español para mostrar tal cual (qué pasa y qué hacer). */
  message: string
}

// ---------------------------------------------------------------------------------------------------
// Herramientas que registra cada módulo (y el núcleo)
// ---------------------------------------------------------------------------------------------------

export type AiToolOwner = 'core' | 'finanzas' | 'entreno'

interface AiToolBase {
  /** `<dueño>_<nombre>` (ver `AI_TOOL_NAME_RE`). Único en toda la app. */
  name: string
  /** Para el modelo: qué hace y cuándo usarla (en español). */
  description: string
  /** Lo que ve Michael mientras se usa («Consultando el resumen del mes»). */
  label: string
  parameters: AiJsonSchema
}

/**
 * Herramienta de lectura. Valida `args` (Zod) y devuelve datos serializables, resumidos y
 * limitados. Si los argumentos no valen, lanza un error con un mensaje útil para el modelo.
 */
export interface AiReadToolDef<C> extends AiToolBase {
  kind: 'read'
  run(ctx: C, args: unknown): unknown
}

/**
 * Herramienta que propone cambios. `plan` NO escribe: valida `args` con el mismo esquema que el
 * handler de la página y devuelve los cambios con su antes/después. `apply` escribe un cambio
 * confirmado llamando al mismo servicio que la página (cola, validación y auditoría de siempre).
 * `fingerprint` resume el estado actual del registro para detectar si cambió desde la propuesta.
 */
export interface AiActionToolDef<C> extends AiToolBase {
  kind: 'action'
  plan(ctx: C, args: unknown): AiActionPlan
  apply(ctx: C, change: AiChange): Promise<void>
  fingerprint(ctx: C, change: AiChange): string | null
}

export type AiToolDef<C> = AiReadToolDef<C> | AiActionToolDef<C>

// ---------------------------------------------------------------------------------------------------
// Propuestas de cambio
// ---------------------------------------------------------------------------------------------------

export type AiChangeOp = 'create' | 'update' | 'delete'

/** Un campo que cambia, ya formateado para mostrarlo (importes con €, fechas en español…). */
export interface AiFieldDiff {
  label: string
  before: string | null
  after: string | null
}

/** Vista previa especial de un cambio (hoy solo gráficos, con `GraficoVista`). */
export type AiChangePreview = { kind: 'chart'; title: string; spec: unknown }

/** Un cambio sobre un registro, tal como lo devuelve `plan`. */
export interface AiChangeDraft {
  /** Entidad, p. ej. `transaction`, `budget`, `trn_goal`, `chart`. */
  entity: string
  /** Id del registro; `null` al crear. */
  entityId: string | null
  op: AiChangeOp
  /** Descripción corta en español («Steam · 12,99 € · 3 nov 2026»). */
  label: string
  fields: AiFieldDiff[]
  preview?: AiChangePreview
  /** Entrada para `apply` (la misma que recibe el handler de la página). */
  payload: unknown
  /** Huella del registro al proponer (`null` al crear). */
  fingerprint: string | null
}

export interface AiActionPlan {
  /**
   * Criterio común cuando los cambios salen de una sola regla («movimientos de Steam → Ocio»).
   * Con criterio y al menos `AI_GROUP_MIN` cambios, se agrupan; si no, van uno a uno.
   */
  criterion: string | null
  changes: AiChangeDraft[]
}

export type AiChangeStatus = 'pending' | 'applied' | 'failed' | 'skipped'

export interface AiChange extends AiChangeDraft {
  id: string
  status: AiChangeStatus
  /** Motivo si falló. */
  error?: string
}

/**
 * Estado de una propuesta:
 * - `pending`: esperando a Michael.
 * - `applied`: aplicada entera.
 * - `partial`: un grupo que se paró a mitad (los cambios dicen cuáles se aplicaron).
 * - `rejected`: descartada.
 * - `stale`: el registro cambió desde que se propuso; hay que pedirla otra vez.
 * - `failed`: falló el primer cambio y no se aplicó nada.
 */
export type AiProposalStatus = 'pending' | 'applied' | 'partial' | 'rejected' | 'stale' | 'failed'

export interface AiProposal {
  id: string
  threadId: string
  /** Mensaje del asistente al que pertenece. */
  messageId: string
  tool: string
  /** `single`: un cambio que se confirma solo. `group`: varios relacionados que se confirman a la vez. */
  mode: 'single' | 'group'
  /** Título en español («Cambiar categoría de 12 movimientos a Ocio»). */
  title: string
  criterion: string | null
  changes: AiChange[]
  status: AiProposalStatus
  createdAt: string
  resolvedAt: string | null
}

// ---------------------------------------------------------------------------------------------------
// Sugerencias (las calcula la app; la IA solo las explica)
// ---------------------------------------------------------------------------------------------------

export type AiSuggestionSeverity = 'info' | 'warning' | 'success'

export interface AiSuggestion {
  /** Clave estable (`entreno.review.stagnation.<ejercicio>`), para no repetirla. */
  id: string
  module: 'finanzas' | 'entreno'
  severity: AiSuggestionSeverity
  title: string
  detail: string
  /** Ruta de la app donde verlo (p. ej. `/entreno/objetivos`). */
  href?: string
  /** Fecha de referencia del cálculo (lunes de la semana revisada, o hoy). */
  asOf: ISODate
}

// ---------------------------------------------------------------------------------------------------
// Conversaciones guardadas (`core_ai_threads`, `core_ai_messages`)
// ---------------------------------------------------------------------------------------------------

export interface AiThread {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
}

export type AiMessageRole = 'user' | 'assistant' | 'tool'

export interface AiMessage {
  id: string
  threadId: string
  role: AiMessageRole
  content: string
  /** Llamadas a herramientas que hizo el asistente en este mensaje. */
  toolCalls?: LlmToolCall[]
  /** En mensajes `tool`: a qué llamada responde y qué herramienta era. */
  toolCallId?: string
  toolName?: string
  /** Propuestas que salieron de este mensaje (solo en mensajes del asistente). */
  proposals?: AiProposal[]
  createdAt: string
}

export type NewAiMessage = Omit<AiMessage, 'id' | 'threadId' | 'createdAt'>

export interface AiThreadDetail {
  thread: AiThread
  messages: AiMessage[]
}

/**
 * Almacén de conversaciones y propuestas (proceso principal). Lecturas síncronas desde la base en
 * memoria; escrituras por la cola (devuelven promesa).
 */
export interface AiStore {
  listThreads(): AiThread[]
  getThread(id: string): AiThreadDetail | null
  createThread(input: { title: string; model: string }): Promise<AiThread>
  renameThread(id: string, title: string): Promise<void>
  appendMessage(threadId: string, msg: NewAiMessage): Promise<AiMessage>
  deleteThread(id: string): Promise<void>
  /** Borra todas las conversaciones; devuelve cuántas había. */
  deleteAllThreads(): Promise<number>
  getProposal(id: string): AiProposal | null
  updateProposal(p: AiProposal): Promise<void>
}

/** Ajustes del asistente guardados en `core_settings` (claves `ai.*`). */
export interface AiSettingsStore {
  get(): AiSettings
  save(patch: AiSettingsPatch): Promise<AiSettings>
}

// ---------------------------------------------------------------------------------------------------
// Métodos `core:ai.*` (canal `api` de siempre) y eventos (`ai:event`)
// ---------------------------------------------------------------------------------------------------

export interface AiSendInput {
  /** `null` empieza una conversación nueva. */
  threadId: string | null
  text: string
  /** Sugerencias que hay que explicar («Coméntalo»); se añaden como contexto. */
  suggestionIds?: string[]
}

export interface AiSendResult {
  threadId: string
  /** Identifica los eventos de esta respuesta. */
  runId: string
}

export interface AiAcceptInput {
  proposalId: string
}

/**
 * Firmas de los handlers del núcleo (`core:ai.<clave>`). La implementación las respeta; la
 * interfaz las usa con `api('core:ai.<clave>', …)`.
 */
export interface AiHandlers {
  'ai.status': () => Promise<AiStatus>
  'ai.settings.get': () => AiSettings
  'ai.settings.save': (patch: AiSettingsPatch) => Promise<AiSettings>
  'ai.threads.list': () => AiThread[]
  'ai.threads.get': (id: string) => AiThreadDetail | null
  'ai.threads.delete': (id: string) => Promise<void>
  'ai.threads.deleteAll': () => Promise<number>
  /** Empieza a responder y vuelve en seguida; la respuesta llega por `ai:event`. */
  'ai.send': (input: AiSendInput) => Promise<AiSendResult>
  'ai.cancel': (runId: string) => boolean
  'ai.proposals.accept': (input: AiAcceptInput) => Promise<AiProposal>
  'ai.proposals.reject': (proposalId: string) => Promise<AiProposal>
  /** Sugerencias de todos los módulos. Funciona aunque Ollama esté apagado. */
  'ai.suggestions': () => AiSuggestion[]
}

export type AiEvent =
  | { type: 'start'; runId: string; threadId: string }
  /** Texto nuevo de la respuesta en curso. */
  | { type: 'delta'; runId: string; threadId: string; text: string }
  /** El asistente usa una herramienta (`label` es lo que se muestra). */
  | { type: 'tool'; runId: string; threadId: string; name: string; label: string; state: 'start' | 'end'; ok?: boolean }
  /** Mensaje ya guardado (del asistente, con sus propuestas si las hay). */
  | { type: 'message'; runId: string; threadId: string; message: AiMessage }
  | { type: 'done'; runId: string; threadId: string }
  | { type: 'error'; runId: string; threadId: string; code: LlmErrorCode | 'internal'; message: string }
