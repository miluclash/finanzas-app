// Contenido del panel del asistente: estado de Ollama, conversaciones, chat con respuesta en directo,
// propuestas de cambio y sugerencias. No calcula nada: todo llega del proceso principal por IPC.
import { CaretDown, CaretRight, ChatsCircle, Copy, Lightbulb, PaperPlaneRight, ShieldCheck, Sparkle, Stop, Trash } from '@phosphor-icons/react'
import type { AiMessage, AiStatus, AiSuggestion } from '@shared/core/ai-types'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, StatusBadge, Tag, cx } from '../ui'
import { toast } from '../../lib/toast'
import {
  TEXTO_COMENTAR,
  descartarRespuesta,
  useAiCancel,
  useAiDeleteThread,
  useAiSend,
  useAiStatus,
  useAiSuggestions,
  useAiThread,
  useAiThreads,
  useRespuestaEnCurso,
  useSolicitudAsistente
} from './aiApi'
import { PropuestaCard } from './Propuesta'
import { ListaSugerencias, motivoSinAsistente } from './Sugerencias'
import { TextoAsistente } from './TextoAsistente'

export type Vista = 'chat' | 'lista'

const EJEMPLOS = ['¿Qué me toca hoy?', '¿Cuánto he gastado en ocio este mes?', '¿Cómo voy con mis objetivos?']

/* ======================= Estado del asistente ======================= */
function EstadoAsistente({ q }: { q: ReturnType<typeof useAiStatus> }) {
  if (q.isLoading)
    return (
      <div role="status" className="t-meta flex items-center gap-2 px-4 py-3">
        <span className="spinner" aria-hidden /> Comprobando el asistente…
      </div>
    )
  if (q.error || !q.data)
    return (
      <div className="p-4">
        <Aviso tono="error">
          <span className="t-strong">No se ha podido consultar el asistente</span>
          <span>{q.error?.message ?? 'Inténtalo de nuevo.'}</span>
          <div className="mt-1">
            <Button size="sm" onClick={() => q.refetch()} cargando={q.isFetching}>
              Reintentar
            </Button>
          </div>
        </Aviso>
      </div>
    )
  const s = q.data
  if (s.state === 'ready')
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <StatusBadge tono="success">Listo</StatusBadge>
        <span className="t-meta tnum">{s.settings.model}</span>
        <Tag icono={<ShieldCheck size={14} weight="fill" aria-hidden />}>Solo en tu equipo</Tag>
      </div>
    )
  return (
    <div className="p-4">
      <ProblemaAsistente s={s} q={q} />
    </div>
  )
}

/** Cuando el asistente no está listo: qué pasa y qué hacer, con el mensaje del proceso principal tal cual. */
function ProblemaAsistente({ s, q }: { s: AiStatus; q: ReturnType<typeof useAiStatus> }) {
  const comando = `ollama pull ${s.settings.model}`
  if (s.state === 'disabled')
    return (
      <Aviso tono="info">
        <span className="t-strong">El asistente está desactivado</span>
        <span>{s.message}</span>
        <div className="mt-1">
          <Link to="/ajustes#asistente" className="btn btn-secondary btn-sm">
            Ir a Ajustes
          </Link>
        </div>
      </Aviso>
    )
  return (
    <Aviso tono="warning">
      <span className="t-strong">{s.state === 'unreachable' ? 'No encuentro Ollama' : `Falta el modelo ${s.settings.model}`}</span>
      <span>{s.message}</span>
      <ol className="mt-1 list-decimal pl-5">
        {s.state === 'unreachable' && (
          <>
            <li>Instala Ollama desde ollama.com, si aún no lo tienes.</li>
            <li>Ábrelo y déjalo en marcha.</li>
          </>
        )}
        <li>
          Descarga el modelo con este comando en una terminal:
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <code className="tnum r-tag bg-interactive px-2 py-1">{comando}</code>
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy size={14} aria-hidden />}
              onClick={() => navigator.clipboard.writeText(comando).then(() => toast.success('Comando copiado'), () => toast.error('No se ha podido copiar'))}
            >
              Copiar
            </Button>
          </span>
        </li>
      </ol>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => q.refetch()} cargando={q.isFetching}>
          Reintentar
        </Button>
        <Link to="/ajustes#asistente" className="btn btn-ghost btn-sm">
          Ajustes del asistente
        </Link>
      </div>
    </Aviso>
  )
}

/* ======================= Conversaciones ======================= */
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
function fechaHilo(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : FECHA.format(d)
}

function Conversaciones({ threadId, onAbrir, onNueva, onBorrado }: { threadId: string | null; onAbrir: (id: string) => void; onNueva: () => void; onBorrado: (id: string) => void }) {
  const q = useAiThreads()
  const borrar = useAiDeleteThread()
  const [aBorrar, setABorrar] = useState<{ id: string; title: string } | null>(null)
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="t-card-title">Conversaciones</h3>
        <Button size="sm" variant="secondary" onClick={onNueva}>
          Nueva conversación
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState filas={2} etiqueta="Cargando las conversaciones" />
      ) : q.error || !q.data ? (
        <ErrorState
          titulo="No se han podido cargar las conversaciones"
          texto={q.error?.message ?? 'Inténtalo de nuevo.'}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : q.data.length === 0 ? (
        <EmptyState compacto icono={<ChatsCircle size={24} aria-hidden />} titulo="Aún no hay conversaciones" texto="Cuando hables con el asistente, quedarán guardadas aquí, solo en tu equipo." />
      ) : (
        <ul className="flex flex-col gap-1">
          {q.data.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAbrir(t.id)}
                aria-current={t.id === threadId ? 'true' : undefined}
                className={cx('flex min-w-0 flex-1 flex-col items-start r-control px-3 py-2 text-left hover:bg-interactive', t.id === threadId && 'bg-interactive')}
              >
                <span className="t-body w-full truncate text-ink">{t.title || 'Conversación sin título'}</span>
                <span className="t-meta">{fechaHilo(t.updatedAt)}</span>
              </button>
              <IconButton variant="ghost" size="sm" etiqueta={`Borrar la conversación «${t.title || 'sin título'}»`} icono={<Trash size={16} />} onClick={() => setABorrar({ id: t.id, title: t.title })} />
            </li>
          ))}
        </ul>
      )}
      {aBorrar && (
        <ConfirmDialog
          titulo="¿Borrar la conversación?"
          texto={`Se borrará «${aBorrar.title || 'Conversación sin título'}» con todos sus mensajes. No se puede deshacer. Los cambios que ya hayas confirmado se quedan como están.`}
          confirmar="Borrar"
          onCancelar={() => setABorrar(null)}
          onConfirmar={() => {
            const { id } = aBorrar
            setABorrar(null)
            borrar.mutate(id, { onSuccess: () => onBorrado(id) })
          }}
        />
      )}
    </div>
  )
}

/* ======================= Mensajes ======================= */
function MensajeUsuario({ texto }: { texto: string }) {
  return (
    <li className="flex justify-end">
      <div className="max-w-[88%] r-card bg-interactive px-3 py-2">
        <span className="sr-only">Tú: </span>
        <p className="t-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{texto}</p>
      </div>
    </li>
  )
}

function MensajeAsistente({ m }: { m: AiMessage }) {
  return (
    <li className="flex flex-col gap-3">
      {m.content.trim() && (
        <div>
          <span className="sr-only">Asistente: </span>
          <TextoAsistente texto={m.content} />
        </div>
      )}
      {m.proposals?.map((p) => <PropuestaCard key={p.id} propuesta={p} />)}
    </li>
  )
}

function Consultando({ etiqueta }: { etiqueta: string }) {
  return (
    <p className="t-label flex items-center gap-2">
      <span className="spinner" aria-hidden />
      <span>{etiqueta}</span>
    </p>
  )
}

/* ======================= Chat ======================= */
function Chat({
  threadId,
  enviarComentario,
  puedeEnviar,
  motivo,
  enviarEjemplo,
  enviando
}: {
  threadId: string | null
  enviarComentario: (s: AiSuggestion) => void
  puedeEnviar: boolean
  motivo: string | null
  enviarEjemplo: (t: string) => void
  enviando: string | null
}) {
  const hilo = useAiThread(threadId)
  const run = useRespuestaEnCurso(threadId)
  const sugerencias = useAiSuggestions()
  const [verSugerencias, setVerSugerencias] = useState(false)
  const idSug = useId()
  const lista = useRef<HTMLDivElement>(null)
  const pegado = useRef(true)
  const mensajes = (hilo.data?.messages ?? []).filter((m) => m.role === 'user' || m.content.trim() || m.proposals?.length)
  const usuarios = (hilo.data?.messages ?? []).filter((m) => m.role === 'user').length
  const preguntaPendiente = run?.pregunta && usuarios <= run.pregunta.mensajesPrevios ? run.pregunta.texto : (enviando ?? null)
  const vacio = mensajes.length === 0 && !run && enviando === null
  const nSug = sugerencias.data?.length ?? 0

  // Sigue el final de la conversación salvo que Michael haya subido a leer
  useLayoutEffect(() => {
    const el = lista.current
    if (el && pegado.current) el.scrollTop = el.scrollHeight
  }, [mensajes.length, run?.texto, run?.herramienta, run?.estado, preguntaPendiente, hilo.data])

  if (threadId && hilo.isLoading) return <div className="p-4"><LoadingState filas={3} etiqueta="Cargando la conversación" /></div>
  // Mientras se responde, un hilo que aún no se ha podido leer no es un error: se enseña lo que va llegando
  if (threadId && !run && enviando === null && (hilo.error || hilo.data === null))
    return (
      <div className="p-4">
        <ErrorState
          titulo="No se ha podido abrir la conversación"
          texto={hilo.error?.message ?? 'Ya no existe. Empieza una nueva.'}
          accion={
            hilo.error && (
              <Button size="sm" onClick={() => hilo.refetch()}>
                Reintentar
              </Button>
            )
          }
        />
      </div>
    )

  const panelSugerencias = (
    <ListaSugerencias
      datos={sugerencias.data}
      cargando={sugerencias.isLoading}
      error={sugerencias.error}
      onReintentar={() => sugerencias.refetch()}
      onComentar={enviarComentario}
      motivo={motivo}
      compacta
    />
  )

  return (
    <div
      ref={lista}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      onScroll={(e) => {
        const el = e.currentTarget
        pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
    >
      {vacio ? (
        <>
          <div className="flex flex-col items-center gap-3 px-2 py-4 text-center">
            <div className="grid size-12 place-items-center r-card border border-line-strong bg-raised">
              <Sparkle size={24} weight="duotone" className="text-accent-text" aria-hidden />
            </div>
            <div>
              <h3 className="t-section">¿En qué te ayudo?</h3>
              <p className="t-label mt-1">Pregúntame por tus finanzas o tu entreno. Si me pides un cambio, te lo enseño antes y solo se aplica cuando lo confirmes.</p>
            </div>
            {puedeEnviar && (
              <ul className="flex flex-wrap justify-center gap-2" aria-label="Preguntas de ejemplo">
                {EJEMPLOS.map((e) => (
                  <li key={e}>
                    <Button size="sm" variant="secondary" onClick={() => enviarEjemplo(e)}>
                      {e}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(sugerencias.isLoading || sugerencias.error || nSug > 0) && (
            <section aria-labelledby={idSug} className="flex flex-col gap-3">
              <h3 id={idSug} className="t-card-title flex items-center gap-2">
                <Lightbulb size={18} weight="duotone" className="text-accent-text" aria-hidden />
                Sugerencias
              </h3>
              {panelSugerencias}
            </section>
          )}
        </>
      ) : (
        <>
          {nSug > 0 && (
            <section>
              <button
                type="button"
                className="t-label flex w-full items-center gap-2 r-control px-2 py-2 text-left hover:bg-interactive"
                aria-expanded={verSugerencias}
                aria-controls={idSug}
                onClick={() => setVerSugerencias((v) => !v)}
              >
                {verSugerencias ? <CaretDown size={14} aria-hidden /> : <CaretRight size={14} aria-hidden />}
                <Lightbulb size={16} weight="duotone" className="text-accent-text" aria-hidden />
                <span className="t-strong text-ink">Sugerencias</span>
                <span className="count tnum" aria-label={`${nSug} sugerencias`}>
                  {nSug}
                </span>
              </button>
              {verSugerencias && (
                <div id={idSug} className="mt-2">
                  {panelSugerencias}
                </div>
              )}
            </section>
          )}
          <ol role="log" aria-live="polite" aria-relevant="additions text" aria-busy={!!run && run.estado === 'activa'} aria-label="Conversación" className="flex flex-col gap-4">
            {mensajes.map((m) => (m.role === 'user' ? <MensajeUsuario key={m.id} texto={m.content} /> : <MensajeAsistente key={m.id} m={m} />))}
            {preguntaPendiente && <MensajeUsuario texto={preguntaPendiente} />}
            {(run || enviando !== null) && run?.estado !== 'error' && (
              <li className="flex flex-col gap-2">
                {run?.texto && (
                  <div>
                    <span className="sr-only">Asistente: </span>
                    <TextoAsistente texto={run.texto} />
                  </div>
                )}
                {run?.herramienta ? <Consultando etiqueta={`${run.herramienta.label}…`} /> : !run?.texto && <Consultando etiqueta="Pensando…" />}
              </li>
            )}
          </ol>
          {run?.estado === 'error' && run.error && (
            <Aviso tono="error">
              <span className="t-strong">No he podido terminar la respuesta</span>
              <span>{run.error.message}</span>
              <div className="mt-1">
                <Button size="sm" variant="secondary" onClick={() => descartarRespuesta(run.threadId)}>
                  Entendido
                </Button>
              </div>
            </Aviso>
          )}
        </>
      )}
    </div>
  )
}

/* ======================= Entrada de texto ======================= */
function Compositor({ puedeEnviar, motivo, ocupado, onEnviar, onParar, entrada }: { puedeEnviar: boolean; motivo: string | null; ocupado: boolean; onEnviar: (t: string) => void; onParar: () => void; entrada: React.RefObject<HTMLTextAreaElement | null> }) {
  const [texto, setTexto] = useState('')
  const nota = useId()
  const enviar = () => {
    const t = texto.trim()
    if (!t || !puedeEnviar || ocupado) return
    onEnviar(t)
    setTexto('')
  }
  return (
    <div className="border-t border-line p-4">
      <label htmlFor="ia-entrada" className="sr-only">
        Pregunta al asistente
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="ia-entrada"
          ref={entrada}
          className="input h-auto min-h-10 flex-1 resize-none py-2"
          rows={Math.min(6, Math.max(1, texto.split('\n').length))}
          value={texto}
          placeholder={puedeEnviar ? 'Escribe tu pregunta' : 'El asistente no está disponible'}
          disabled={!puedeEnviar}
          aria-describedby={nota}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              enviar()
            }
          }}
        />
        {ocupado ? (
          <IconButton variant="secondary" etiqueta="Parar la respuesta" icono={<Stop size={18} weight="fill" />} onClick={onParar} />
        ) : (
          <IconButton variant="accent" etiqueta="Enviar" icono={<PaperPlaneRight size={18} weight="fill" />} disabled={!puedeEnviar || !texto.trim()} onClick={enviar} />
        )}
      </div>
      <p id={nota} className="t-meta mt-2">
        {puedeEnviar ? 'Intro envía. Mayús + Intro añade una línea.' : (motivo ?? 'Comprobando el asistente…')}
      </p>
    </div>
  )
}

/* ======================= Panel ======================= */
export function PanelAsistente({ vista, setVista, threadId, setThreadId }: { vista: Vista; setVista: (v: Vista) => void; threadId: string | null; setThreadId: (id: string | null) => void }) {
  const estado = useAiStatus()
  const enviar = useAiSend()
  const cancelar = useAiCancel()
  const run = useRespuestaEnCurso(threadId)
  const hilo = useAiThread(threadId)
  const entrada = useRef<HTMLTextAreaElement>(null)
  const { solicitud, consumir } = useSolicitudAsistente()
  const listo = estado.data?.state === 'ready'
  const motivo = motivoSinAsistente(estado.data, estado.error)
  const ocupado = enviar.isPending || run?.estado === 'activa'
  const mensajesPrevios = hilo.data?.messages.filter((m) => m.role === 'user').length ?? 0

  const mandar = (text: string, suggestionIds?: string[], hiloDestino: string | null = threadId) => {
    setVista('chat')
    enviar.mutate(
      { threadId: hiloDestino, text, suggestionIds, mensajesPrevios: hiloDestino === threadId ? mensajesPrevios : 0 },
      { onSuccess: (r) => setThreadId(r.threadId) }
    )
  }

  // Petición desde fuera del panel («Coméntalo» en la tarjeta): conversación nueva con las sugerencias
  useEffect(() => {
    if (!solicitud || estado.isLoading) return
    consumir()
    if (listo) {
      setThreadId(null)
      mandar(solicitud.text, solicitud.suggestionIds, null)
    } else if (motivo) toast.info(motivo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud, estado.isLoading])

  // Al cambiar de conversación o volver al chat, el foco va a la entrada
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    if (vista === 'chat') entrada.current?.focus()
  }, [vista, threadId])

  return (
    <>
      <EstadoAsistente q={estado} />
      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        {vista === 'lista' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><Conversaciones
            threadId={threadId}
            onAbrir={(id) => (setThreadId(id), setVista('chat'))}
            onNueva={() => (setThreadId(null), setVista('chat'))}
            onBorrado={(id) => id === threadId && setThreadId(null)}
          /></div>
        ) : (
          <Chat
            threadId={threadId}
            enviarComentario={(s) => mandar(TEXTO_COMENTAR, [s.id])}
            puedeEnviar={listo}
            motivo={motivo}
            enviarEjemplo={(t) => mandar(t)}
            enviando={enviar.isPending ? (enviar.variables?.text ?? null) : null}
          />
        )}
      </div>
      {vista === 'chat' && <Compositor puedeEnviar={listo} motivo={motivo} ocupado={ocupado} entrada={entrada} onEnviar={(t) => mandar(t)} onParar={() => run && cancelar.mutate(run.runId)} />}
    </>
  )
}
