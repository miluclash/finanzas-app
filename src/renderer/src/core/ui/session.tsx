import { Barbell, Check, Moon, PersonSimpleSwim } from '@phosphor-icons/react'
import { cx } from './cx'

export type EstadoSesion = 'hecha' | 'hoy' | 'planificada' | 'descanso'
const TEXTO: Record<EstadoSesion, string> = { hecha: 'Hecha', hoy: 'Hoy', planificada: 'Planificada', descanso: 'Descanso' }

/** WeekSessionCell: una celda por día. Cuatro estados que se distinguen por fondo, borde, icono y texto */
export function WeekSessionCell({ dia, tipo, estado, nombre }: { dia: string; tipo: 'gimnasio' | 'natacion' | 'descanso'; estado: EstadoSesion; nombre: string }) {
  const I = tipo === 'descanso' ? Moon : tipo === 'natacion' ? PersonSimpleSwim : Barbell
  return (
    <li className={cx('week-cell', `week-${estado}`)} aria-label={`${dia}: ${nombre}, ${TEXTO[estado].toLowerCase()}`}>
      <span className="t-label font-semibold" style={{ color: 'inherit' }}>
        {dia}
      </span>
      <I size={24} weight={estado === 'hecha' || estado === 'hoy' ? 'fill' : 'regular'} className={estado === 'hoy' ? 'text-accent-text' : undefined} aria-hidden />
      <span className="t-label flex items-center gap-1" style={{ color: 'inherit' }}>
        {estado === 'hecha' && <Check size={14} weight="bold" aria-hidden />}
        {TEXTO[estado]}
      </span>
    </li>
  )
}

/** Leyenda de los cuatro estados, con la misma forma que las celdas */
export function LeyendaSemana() {
  return (
    <ul className="t-meta flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Leyenda de la semana">
      {(['hecha', 'hoy', 'planificada', 'descanso'] as EstadoSesion[]).map((e) => (
        <li key={e} className="flex items-center gap-2">
          <span className={cx('week-cell size-4 !p-0', `week-${e}`)} aria-hidden />
          {TEXTO[e]}
        </li>
      ))}
    </ul>
  )
}
