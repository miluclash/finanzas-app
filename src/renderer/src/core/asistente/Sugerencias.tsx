// Sugerencias: las calcula la app (funcionan con Ollama apagado) y el asistente solo las explica («Coméntalo»).
// Se ven en el panel del asistente y en la tarjeta «Sugerencias» de los paneles editables.
import { ArrowRight, ChatCircleText, CheckCircle } from '@phosphor-icons/react'
import type { AiStatus, AiSuggestion } from '@shared/core/ai-types'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge, Tag, cx } from '../ui'
import type { ApiError } from '../../lib/api'

const SEVERIDAD = {
  warning: { tono: 'warning', texto: 'Para revisar' },
  info: { tono: 'info', texto: 'Información' },
  success: { tono: 'success', texto: 'Buena señal' }
} as const

const MODULO = { finanzas: 'Finanzas', entreno: 'Entreno' } as const

/** Por qué «Coméntalo» no está disponible (o `null` si lo está). */
export function motivoSinAsistente(status: Pick<AiStatus, 'state'> | undefined, error: ApiError | null): string | null {
  if (status?.state === 'ready') return null
  if (error) return 'El asistente no responde ahora mismo. Las sugerencias se ven igual; para comentarlas, inténtalo más tarde.'
  if (!status) return 'Comprobando el asistente…'
  if (status.state === 'disabled') return 'El asistente está desactivado. Actívalo en Ajustes para comentar las sugerencias.'
  if (status.state === 'unreachable') return 'Ollama no responde. Ábrelo para poder comentar las sugerencias.'
  return 'Falta descargar el modelo. Los pasos están en el panel del asistente.'
}

export function SugerenciaItem({
  s,
  onComentar,
  deshabilitado,
  nota
}: {
  s: AiSuggestion
  onComentar: (s: AiSuggestion) => void
  deshabilitado: boolean
  /** Id del texto que explica por qué está desactivado «Coméntalo». */
  nota?: string
}) {
  const sev = SEVERIDAD[s.severity]
  return (
    <li className="flex flex-col gap-2 r-control border border-line bg-raised p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tono={sev.tono}>{sev.texto}</StatusBadge>
        <Tag>{MODULO[s.module]}</Tag>
      </div>
      <div className="min-w-0">
        <p className="t-body t-strong text-ink [overflow-wrap:anywhere]">{s.title}</p>
        <p className="t-label mt-1 [overflow-wrap:anywhere]">{s.detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<ChatCircleText size={16} aria-hidden />} disabled={deshabilitado} aria-describedby={deshabilitado ? nota : undefined} onClick={() => onComentar(s)}>
          Coméntalo
        </Button>
        {s.href && (
          <Link to={s.href} className="btn btn-ghost btn-sm">
            Verlo <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
    </li>
  )
}

/** Lista de sugerencias con sus propios estados de carga, error y vacío. */
export function ListaSugerencias({
  datos,
  cargando,
  error,
  onReintentar,
  onComentar,
  motivo,
  compacta
}: {
  datos: AiSuggestion[] | undefined
  cargando: boolean
  error: ApiError | null
  onReintentar: () => void
  onComentar: (s: AiSuggestion) => void
  /** Motivo por el que no se puede comentar (o `null`). */
  motivo: string | null
  compacta?: boolean
}) {
  const nota = useId()
  if (cargando) return <LoadingState filas={2} etiqueta="Calculando las sugerencias" />
  if (error || !datos)
    return (
      <ErrorState
        titulo="No se han podido calcular las sugerencias"
        texto={error?.message ?? 'Inténtalo de nuevo.'}
        accion={
          <Button size="sm" onClick={onReintentar}>
            Reintentar
          </Button>
        }
      />
    )
  if (datos.length === 0)
    return (
      <EmptyState
        compacto={compacta}
        icono={<CheckCircle size={24} aria-hidden />}
        titulo="Todo en orden"
        texto="No hay nada que revisar ahora. Cuando haya algo que merezca tu atención, aparecerá aquí."
      />
    )
  return (
    <div className="flex flex-col gap-3">
      {motivo && (
        <p id={nota} className="t-meta">
          {motivo}
        </p>
      )}
      <ul className={cx('flex flex-col gap-2')}>
        {datos.map((s) => (
          <SugerenciaItem key={s.id} s={s} onComentar={onComentar} deshabilitado={motivo !== null} nota={nota} />
        ))}
      </ul>
    </div>
  )
}

