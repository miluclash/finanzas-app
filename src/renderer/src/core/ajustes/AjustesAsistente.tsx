// Ajustes → Asistente: activar o apagar la IA local, elegir modelo, dirección de Ollama, razonamiento,
// probar la conexión y borrar las conversaciones. Sustituye a la antigua sección de conexión con Claude.
import { ArrowsClockwise, Trash } from '@phosphor-icons/react'
import { AI_LOCAL_HOSTS, DEFAULT_AI_SETTINGS, type AiSettings, type AiStatusState } from '@shared/core/ai-types'
import { useState } from 'react'
import { useAiDeleteAllThreads, useAiSaveSettings, useAiSettings, useAiStatus, useAiThreads } from '../asistente/aiApi'
import { Aviso, Button, ConfirmDialog, ErrorState, LoadingState, Select, StatusBadge, Switch, TextField, type Tono } from '../ui'

const ESTADO: Record<AiStatusState, { tono: Tono; texto: string }> = {
  ready: { tono: 'success', texto: 'Listo' },
  disabled: { tono: 'neutral', texto: 'Desactivado' },
  unreachable: { tono: 'warning', texto: 'No encuentro Ollama' },
  model_missing: { tono: 'warning', texto: 'Falta el modelo' }
}

/** Misma regla que el proceso principal: solo direcciones de este equipo. */
function validarDireccion(v: string): string | null {
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Tiene que empezar por http:// o https://.'
    if (!(AI_LOCAL_HOSTS as readonly string[]).includes(u.hostname)) return 'Solo se admite una dirección de este equipo: localhost, 127.0.0.1 o ::1.'
    return null
  } catch {
    return `No es una dirección válida. Por ejemplo: ${DEFAULT_AI_SETTINGS.baseUrl}`
  }
}

function Fila({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-4 first:pt-0">
      <div className="min-w-0 max-w-xl">
        <div className="t-body t-strong text-ink">{titulo}</div>
        <p className="t-label mt-1">{texto}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1">{children}</div>
    </div>
  )
}

export function AjustesAsistente() {
  const ajustes = useAiSettings()
  const estado = useAiStatus()
  if (ajustes.isLoading) return <LoadingState filas={3} etiqueta="Cargando los ajustes del asistente" />
  if (ajustes.error || !ajustes.data)
    return (
      <ErrorState
        titulo="No se han podido cargar los ajustes del asistente"
        texto={ajustes.error?.message ?? 'Inténtalo de nuevo.'}
        accion={
          <Button size="sm" onClick={() => ajustes.refetch()}>
            Reintentar
          </Button>
        }
      />
    )
  return <Formulario ajustes={ajustes.data} estado={estado} />
}

function Formulario({ ajustes, estado }: { ajustes: AiSettings; estado: ReturnType<typeof useAiStatus> }) {
  const guardar = useAiSaveSettings()
  const borrarTodo = useAiDeleteAllThreads()
  const hilos = useAiThreads()
  const [direccion, setDireccion] = useState(ajustes.baseUrl)
  const [modelo, setModelo] = useState(ajustes.model)
  const [confirmar, setConfirmar] = useState(false)
  const errorDireccion = direccion.trim() === ajustes.baseUrl ? null : validarDireccion(direccion)
  const modelos = estado.data?.models ?? []
  const modeloEnLista = modelos.some((m) => m.name === ajustes.model)
  const s = estado.data
  const n = hilos.data?.length

  const guardarDireccion = () => {
    const v = direccion.trim()
    if (v === ajustes.baseUrl || validarDireccion(v)) return
    guardar.mutate({ baseUrl: v })
  }
  const guardarModelo = () => {
    const v = modelo.trim()
    if (v && v !== ajustes.model) guardar.mutate({ model: v })
  }

  return (
    <div>
      <Fila titulo="Asistente activado" texto="Si lo apagas, el panel lo dice y no se usa el modelo. Las sugerencias se siguen viendo.">
        <Switch checked={ajustes.enabled} label="Asistente activado" onChange={(v) => guardar.mutate({ enabled: v })} disabled={guardar.isPending} />
        <span className="t-meta w-20">{ajustes.enabled ? 'Activado' : 'Desactivado'}</span>
      </Fila>

      <div className="grid gap-6 border-b border-line py-4 @xl:grid-cols-2">
        {modelos.length > 0 ? (
          <Select
            label="Modelo"
            ayuda={modeloEnLista ? 'Los modelos que tienes descargados en Ollama.' : `«${ajustes.model}» no está descargado. Elige otro o descárgalo con «ollama pull ${ajustes.model}».`}
            value={ajustes.model}
            disabled={guardar.isPending}
            onChange={(e) => guardar.mutate({ model: e.target.value })}
          >
            {!modeloEnLista && <option value={ajustes.model}>{ajustes.model} (sin descargar)</option>}
            {modelos.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </Select>
        ) : (
          <TextField
            label="Modelo"
            ayuda={`No puedo ver tus modelos ahora mismo. Escribe el nombre, por ejemplo ${DEFAULT_AI_SETTINGS.model}.`}
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            onBlur={guardarModelo}
            onKeyDown={(e) => e.key === 'Enter' && guardarModelo()}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        <div>
          <TextField
            label="Dirección de Ollama"
            ayuda="Solo de este equipo. Por defecto, http://localhost:11434."
            error={errorDireccion ?? undefined}
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            onBlur={guardarDireccion}
            onKeyDown={(e) => e.key === 'Enter' && guardarDireccion()}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <Fila titulo="Razonamiento" texto="El modelo piensa antes de contestar. Las respuestas salen más cuidadas, pero tardan bastante más. Apagado va mejor para el día a día.">
        <Switch checked={ajustes.think} label="Razonamiento" onChange={(v) => guardar.mutate({ think: v })} disabled={guardar.isPending} />
        <span className="t-meta w-20">{ajustes.think ? 'Activado' : 'Apagado'}</span>
      </Fila>

      <div className="flex flex-col gap-3 border-b border-line py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-body t-strong text-ink">Estado de la conexión</div>
            <div className="mt-2" role="status" aria-live="polite">
              {estado.isLoading || estado.isFetching ? (
                <span className="t-label flex items-center gap-2">
                  <span className="spinner" aria-hidden /> Comprobando…
                </span>
              ) : s ? (
                <StatusBadge tono={ESTADO[s.state].tono}>{ESTADO[s.state].texto}</StatusBadge>
              ) : (
                <StatusBadge tono="error">No se ha podido comprobar</StatusBadge>
              )}
            </div>
          </div>
          <Button variant="secondary" icon={<ArrowsClockwise size={16} aria-hidden />} onClick={() => estado.refetch()} cargando={estado.isFetching}>
            Probar conexión
          </Button>
        </div>
        {!estado.isFetching &&
          (s ? (
            s.state === 'ready' ? (
              <p className="t-label">{s.message}</p>
            ) : (
              <Aviso tono={s.state === 'disabled' ? 'info' : 'warning'}>
                <span>{s.message}</span>
              </Aviso>
            )
          ) : (
            estado.error && (
              <Aviso tono="error">
                <span>{estado.error.message}</span>
              </Aviso>
            )
          ))}
      </div>

      <Fila titulo="Conversaciones" texto={`Se guardan solo en tu equipo. ${n === undefined ? '' : n === 0 ? 'Ahora no hay ninguna.' : n === 1 ? 'Ahora hay 1.' : `Ahora hay ${n}.`} Borrarlas no deshace los cambios que ya confirmaste.`}>
        <Button variant="danger" icon={<Trash size={16} aria-hidden />} onClick={() => setConfirmar(true)} disabled={n === 0 || borrarTodo.isPending}>
          Borrar todas las conversaciones
        </Button>
      </Fila>

      {confirmar && (
        <ConfirmDialog
          titulo="¿Borrar todas las conversaciones?"
          texto="Se borrarán todas las conversaciones con el asistente y sus mensajes. No se puede deshacer. Tus datos de finanzas y entreno no se tocan."
          confirmar="Borrar todas"
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => (setConfirmar(false), borrarTodo.mutate())}
        />
      )}
    </div>
  )
}
