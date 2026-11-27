// Cliente tipado del asistente (`core:ai.*`) con hooks de React Query, y la respuesta en curso (`ai:event`).
//
// Se tipa con `AiHandlers` del contrato (`src/shared/core/ai-types.ts`) y llama a `window.finanzas.call`
// con el mismo manejo de errores que `lib/api.ts` (reutiliza `ApiError`). Si el proceso principal aún no
// tiene un handler («Método desconocido»), es un error normal: los hooks lo devuelven en `error`.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import type {
  AiAcceptInput,
  AiEvent,
  AiProposal,
  AiSendInput,
  AiSendResult,
  AiSettings,
  AiSettingsPatch,
  AiStatus,
  AiSuggestion,
  AiThread,
  AiThreadDetail,
  AiHandlers
} from '@shared/core/ai-types'
import { ApiError } from '../../lib/api'
import { toast } from '../../lib/toast'

type AiKey = keyof AiHandlers
type AiArgs<K extends AiKey> = Parameters<AiHandlers[K]>
type AiResult<K extends AiKey> = Awaited<ReturnType<AiHandlers[K]>>

/** Llama a `core:ai.<clave>` con los tipos del contrato. */
export async function aiApi<K extends AiKey>(clave: K, ...args: AiArgs<K>): Promise<AiResult<K>> {
  const res = await window.finanzas.call(`core:${clave}`, args as unknown[])
  if (!res.ok) throw new ApiError(res.error ?? 'Error desconocido', !!res.user, !!res.saved)
  return res.data as AiResult<K>
}

/* ======================= Claves de consulta ======================= */
export const CLAVE_ESTADO = ['core:ai.status'] as const
const CLAVE_AJUSTES = ['core:ai.settings.get'] as const
const CLAVE_HILOS = ['core:ai.threads.list'] as const
const claveHilo = (id: string) => ['core:ai.threads.get', id] as const
const CLAVE_SUGERENCIAS = ['core:ai.suggestions'] as const

/* ======================= Lecturas ======================= */
/** Estado del asistente. Si Ollama está apagado, el estado lo dice: no es un error de la consulta. */
export function useAiStatus() {
  return useQuery<AiStatus, ApiError>({ queryKey: CLAVE_ESTADO, queryFn: () => aiApi('ai.status'), staleTime: 15_000 })
}
export function useAiSettings() {
  return useQuery<AiSettings, ApiError>({ queryKey: CLAVE_AJUSTES, queryFn: () => aiApi('ai.settings.get') })
}
export function useAiThreads() {
  return useQuery<AiThread[], ApiError>({ queryKey: CLAVE_HILOS, queryFn: () => aiApi('ai.threads.list') })
}
export function useAiThread(id: string | null) {
  return useQuery<AiThreadDetail | null, ApiError>({ queryKey: claveHilo(id ?? ''), queryFn: () => aiApi('ai.threads.get', id as string), enabled: id !== null })
}
/** Sugerencias de todos los módulos (las calcula la app, funcionan con Ollama apagado). */
export function useAiSuggestions() {
  return useQuery<AiSuggestion[], ApiError>({ queryKey: CLAVE_SUGERENCIAS, queryFn: () => aiApi('ai.suggestions') })
}

/* ======================= Mutaciones ======================= */
/** Refresca todo lo que pueda haber cambiado tras aplicar una propuesta, sin volver a preguntar por Ollama. */
function refrescarDatos(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== CLAVE_ESTADO[0] })
}

export function useAiSaveSettings() {
  const qc = useQueryClient()
  return useMutation<AiSettings, ApiError, AiSettingsPatch>({
    mutationFn: (patch) => aiApi('ai.settings.save', patch),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: CLAVE_AJUSTES }), qc.invalidateQueries({ queryKey: CLAVE_ESTADO })])
    },
    onError: (e) => toast.error(e.message)
  })
}

export function useAiDeleteThread() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => aiApi('ai.threads.delete', id),
    onSuccess: async (_r, id) => {
      qc.removeQueries({ queryKey: claveHilo(id) })
      await qc.invalidateQueries({ queryKey: CLAVE_HILOS })
    },
    onError: (e) => toast.error(e.message)
  })
}

export function useAiDeleteAllThreads() {
  const qc = useQueryClient()
  return useMutation<number, ApiError, void>({
    mutationFn: () => aiApi('ai.threads.deleteAll'),
    onSuccess: async (n) => {
      qc.removeQueries({ queryKey: ['core:ai.threads.get'] })
      await qc.invalidateQueries({ queryKey: CLAVE_HILOS })
      toast.success(n === 1 ? 'Se ha borrado 1 conversación' : `Se han borrado ${n} conversaciones`)
    },
    onError: (e) => toast.error(e.message)
  })
}

export function useAiSend() {
  const qc = useQueryClient()
  return useMutation<AiSendResult, ApiError, AiSendInput & { /** Mensajes de Michael que ya tiene la conversación. */ mensajesPrevios?: number }>({
    mutationFn: ({ mensajesPrevios: _m, ...input }) => aiApi('ai.send', input),
    onSuccess: async (r, v) => {
      respuestas.registrarEnvio(r.threadId, r.runId, v.text, v.mensajesPrevios ?? 0)
      await Promise.all([qc.invalidateQueries({ queryKey: CLAVE_HILOS }), qc.invalidateQueries({ queryKey: claveHilo(r.threadId) })])
    },
    onError: (e) => toast.error(e.message)
  })
}

export function useAiCancel() {
  return useMutation<boolean, ApiError, string>({ mutationFn: (runId) => aiApi('ai.cancel', runId), onError: (e) => toast.error(e.message) })
}

/** Confirma una propuesta. Al aplicarla se refresca el resto de la app. */
export function useAiAccept() {
  const qc = useQueryClient()
  return useMutation<AiProposal, ApiError, AiAcceptInput>({
    mutationFn: (input) => aiApi('ai.proposals.accept', input),
    onSuccess: async (p) => {
      await Promise.all([refrescarDatos(qc), qc.invalidateQueries({ queryKey: claveHilo(p.threadId) })])
    },
    onError: async (e) => {
      toast.error(e.message)
      // Si el error dejó la propuesta a medias, que la pantalla enseñe lo que quedó
      await refrescarDatos(qc)
    }
  })
}

export function useAiReject() {
  const qc = useQueryClient()
  return useMutation<AiProposal, ApiError, string>({
    mutationFn: (id) => aiApi('ai.proposals.reject', id),
    onSuccess: (p) => qc.invalidateQueries({ queryKey: claveHilo(p.threadId) }),
    onError: (e) => toast.error(e.message)
  })
}

/* ======================= Respuesta en curso (eventos `ai:event`) ======================= */
export interface RespuestaEnCurso {
  runId: string
  threadId: string
  /** Texto que va llegando del mensaje actual (se vacía cuando el mensaje queda guardado). */
  texto: string
  /** Herramienta que está usando ahora (lo que se enseña: «Consultando…»). */
  herramienta: { name: string; label: string } | null
  estado: 'activa' | 'error'
  error?: { code: string; message: string }
  /** Lo que escribió Michael, hasta que el hilo guardado lo incluya. */
  pregunta?: { texto: string; mensajesPrevios: number }
}

type Estado = ReadonlyMap<string, RespuestaEnCurso>

/** Almacén sencillo (como `lib/toast`): sobrevive a que el panel se cierre y se abra durante una respuesta. */
class Respuestas {
  private estado: Estado = new Map()
  private oyentes = new Set<() => void>()
  private qc: QueryClient | null = null
  private baja: (() => void) | null = null
  private usos = 0

  leer = (): Estado => this.estado
  suscribir = (fn: () => void) => {
    this.oyentes.add(fn)
    return () => this.oyentes.delete(fn)
  }

  private poner(threadId: string, cambio: (r: RespuestaEnCurso | undefined) => RespuestaEnCurso | null) {
    const m = new Map(this.estado)
    const nuevo = cambio(m.get(threadId))
    if (nuevo) m.set(threadId, nuevo)
    else m.delete(threadId)
    this.estado = m
    for (const o of this.oyentes) o()
  }

  registrarEnvio(threadId: string, runId: string, texto: string, mensajesPrevios: number) {
    this.poner(threadId, (r) => ({ ...(r && r.runId === runId ? r : { runId, threadId, texto: '', herramienta: null, estado: 'activa' as const }), pregunta: { texto, mensajesPrevios } }))
  }

  /** Cierra un aviso de error de la respuesta. */
  descartar(threadId: string) {
    this.poner(threadId, () => null)
  }

  /** Un componente que necesita los eventos se engancha; el primero abre la suscripción y el último la cierra. */
  conectar(qc: QueryClient) {
    this.qc = qc
    if (this.usos++ === 0 && typeof window !== 'undefined' && window.finanzas?.onAiEvent) this.baja = window.finanzas.onAiEvent((e) => void this.recibir(e))
    return () => {
      if (--this.usos === 0) {
        this.baja?.()
        this.baja = null
      }
    }
  }

  private async recibir(e: AiEvent) {
    const qc = this.qc
    switch (e.type) {
      case 'start':
        this.poner(e.threadId, (r) => ({ ...(r?.runId === e.runId ? r : undefined), runId: e.runId, threadId: e.threadId, texto: '', herramienta: null, estado: 'activa' }))
        void qc?.invalidateQueries({ queryKey: claveHilo(e.threadId) })
        void qc?.invalidateQueries({ queryKey: CLAVE_HILOS })
        break
      case 'delta':
        this.poner(e.threadId, (r) => ({ ...(r ?? { runId: e.runId, threadId: e.threadId, herramienta: null, estado: 'activa' as const }), texto: (r?.texto ?? '') + e.text }))
        break
      case 'tool':
        this.poner(e.threadId, (r) => ({ ...(r ?? { runId: e.runId, threadId: e.threadId, texto: '', estado: 'activa' as const }), herramienta: e.state === 'start' ? { name: e.name, label: e.label } : null }))
        break
      case 'message': {
        // Se añade al hilo guardado al momento (sin esperar a la consulta) para que el texto no parpadee
        qc?.setQueryData<AiThreadDetail | null>(claveHilo(e.threadId), (d) => (d && !d.messages.some((m) => m.id === e.message.id) ? { ...d, messages: [...d.messages, e.message] } : d))
        this.poner(e.threadId, (r) => (r ? { ...r, texto: '', herramienta: null } : null))
        await qc?.invalidateQueries({ queryKey: claveHilo(e.threadId) })
        break
      }
      case 'done':
        await Promise.all([qc?.invalidateQueries({ queryKey: claveHilo(e.threadId) }), qc?.invalidateQueries({ queryKey: CLAVE_HILOS })])
        // Si antes llegó un error, el aviso se queda hasta que Michael lo cierre
        this.poner(e.threadId, (r) => (r && r.runId === e.runId && r.estado !== 'error' ? null : (r ?? null)))
        break
      case 'error':
        // Parar a propósito no es un error
        if (e.code === 'aborted') {
          await qc?.invalidateQueries({ queryKey: claveHilo(e.threadId) })
          this.poner(e.threadId, (r) => (r && r.runId === e.runId ? null : (r ?? null)))
        } else {
          void qc?.invalidateQueries({ queryKey: claveHilo(e.threadId) })
          // Ollama se ha apagado o falta el modelo: que el aviso del panel se ponga al día
          if (e.code === 'unreachable' || e.code === 'model_missing' || e.code === 'timeout') void qc?.invalidateQueries({ queryKey: CLAVE_ESTADO })
          this.poner(e.threadId, (r) => ({ ...(r ?? { runId: e.runId, threadId: e.threadId, herramienta: null }), texto: r?.texto ?? '', estado: 'error', error: { code: e.code, message: e.message } }))
        }
        break
    }
  }
}

const respuestas = new Respuestas()

/** Engancha la escucha de `ai:event`. Se monta una vez en el shell para no perder eventos si el panel está cerrado. */
export function useAiEvents(): void {
  const qc = useQueryClient()
  useEffect(() => respuestas.conectar(qc), [qc])
}

/** La respuesta en curso de una conversación (o `undefined`). */
export function useRespuestaEnCurso(threadId: string | null): RespuestaEnCurso | undefined {
  const m = useSyncExternalStore(respuestas.suscribir, respuestas.leer)
  return threadId ? m.get(threadId) : undefined
}

/** Cierra el aviso de error de una respuesta. */
export function descartarRespuesta(threadId: string) {
  respuestas.descartar(threadId)
}

/* ======================= Petición desde fuera del panel («Coméntalo» de la tarjeta) ======================= */
export interface SolicitudAsistente {
  suggestionIds: string[]
  text: string
}
let solicitud: SolicitudAsistente | null = null
const oyentesSolicitud = new Set<() => void>()
const suscribirSolicitud = (fn: () => void) => (oyentesSolicitud.add(fn), () => void oyentesSolicitud.delete(fn))

/** Pide al asistente que comente unas sugerencias: abre el panel y envía la conversación. */
export function pedirComentario(suggestionIds: string[], text = TEXTO_COMENTAR) {
  solicitud = { suggestionIds, text }
  for (const o of oyentesSolicitud) o()
}
/** Petición pendiente de atender (la abre el shell y la envía el panel, que la consume con `consumir`). */
export function useSolicitudAsistente() {
  const s = useSyncExternalStore(suscribirSolicitud, () => solicitud)
  return {
    solicitud: s,
    consumir: () => {
      solicitud = null
      for (const o of oyentesSolicitud) o()
    }
  }
}

export const TEXTO_COMENTAR = 'Explícame estas sugerencias'
