// Piezas pequeñas que comparten las pantallas de Entreno.
import { Barbell, DotsThreeCircle, Lightning, PersonSimpleRun, PersonSimpleSwim, type Icon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { WorkoutKind, WorkoutSummary } from '@shared/modules/entreno/types'
import { Tag } from '../../core/ui'
import { fechaDe, formatDuracion, KIND_LABEL } from './format'

export const KIND_ICON: Record<WorkoutKind, Icon> = {
  GYM: Barbell,
  SWIM: PersonSimpleSwim,
  HYROX: Lightning,
  RUN: PersonSimpleRun,
  OTHER: DotsThreeCircle
}

/** Tipo de sesión: icono y texto. */
export function KindTag({ kind }: { kind: WorkoutKind }) {
  const I = KIND_ICON[kind]
  return (
    <Tag icono={<I size={14} aria-hidden />} className="shrink-0">
      {KIND_LABEL[kind]}
    </Tag>
  )
}

export const OrigenTag = ({ source }: { source: WorkoutSummary['source'] }) => <Tag tono={source === 'HEVY' ? 'info' : 'accent'}>{source === 'HEVY' ? 'Hevy' : 'Manual'}</Tag>

/** «6 ejercicios · 22 series» */
export function resumenContenido(w: Pick<WorkoutSummary, 'exerciseCount' | 'setCount'>): string {
  const e = `${w.exerciseCount} ${w.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}`
  const s = `${w.setCount} ${w.setCount === 1 ? 'serie' : 'series'}`
  return `${e} · ${s}`
}

/** Fila de lista de sesiones (Resumen): fecha, título y datos básicos. Toda la fila es un enlace al detalle. */
export function FilaSesion({ w }: { w: WorkoutSummary }) {
  return (
    <li>
      <Link
        to={`/entreno/sesiones/${w.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 r-control px-3 py-3 text-ink hover:bg-interactive"
        aria-label={`${w.title}, ${fechaDe(w.startTime)}`}
      >
        <span className="tnum t-label w-24 shrink-0">{fechaDe(w.startTime)}</span>
        <span className="t-body min-w-0 flex-1 truncate font-semibold">{w.title}</span>
        <KindTag kind={w.kind} />
        <span className="t-meta tnum w-24 shrink-0 text-right">{formatDuracion(w.durationSeconds)}</span>
        <span className="t-meta w-44 shrink-0 text-right">{resumenContenido(w)}</span>
      </Link>
    </li>
  )
}

/** Valor que se actualiza con retraso (para no consultar en cada tecla). */
export function useRetraso<T>(valor: T, ms = 250): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setV(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return v
}

