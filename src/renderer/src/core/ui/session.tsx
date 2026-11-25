import { Check, Moon, type Icon } from '@phosphor-icons/react'
import { cx } from './cx'

export type EstadoSesion = 'hecha' | 'hoy' | 'planificada' | 'descanso' | 'sin-hacer'
const TEXTO: Record<EstadoSesion, string> = { hecha: 'Hecha', hoy: 'Hoy', planificada: 'Planificada', descanso: 'Descanso', 'sin-hacer': 'Sin hacer' }

/** WeekSessionCell: una celda por día. Los estados se distinguen por fondo, borde, icono y texto, nunca solo por color */
export function WeekSessionCell({ dia, icono, estado, nombre, extra }: { dia: string; icono?: Icon; estado: EstadoSesion; nombre: string; extra?: string }) {
  const I = icono ?? Moon
  return (
    <li className={cx('week-cell', `week-${estado}`)} aria-label={`${dia}: ${nombre ? `${nombre}${extra ? ` ${extra}` : ''}, ` : ''}${TEXTO[estado].toLowerCase()}`}>
      <span className="t-label font-semibold" style={{ color: 'inherit' }}>
        {dia}
      </span>
      <I size={24} weight={estado === 'hecha' || estado === 'hoy' ? 'fill' : 'regular'} className={estado === 'hoy' ? 'text-accent-text' : undefined} aria-hidden />
      <span className="t-meta w-full truncate" style={{ color: 'inherit' }} title={nombre}>
        {nombre || ' '}
        {nombre && extra ? ` ${extra}` : ''}
      </span>
      <span className="t-label flex items-center gap-1" style={{ color: 'inherit' }}>
        {estado === 'hecha' && <Check size={14} weight="bold" aria-hidden />}
        {TEXTO[estado]}
      </span>
    </li>
  )
}

/** Leyenda de los estados, con la misma forma que las celdas */
export function LeyendaSemana() {
  return (
    <ul className="t-meta flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Leyenda de la semana">
      {(['hecha', 'hoy', 'planificada', 'sin-hacer', 'descanso'] as EstadoSesion[]).map((e) => (
        <li key={e} className="flex items-center gap-2">
          <span className={cx('week-cell size-4 !p-0', `week-${e}`)} aria-hidden />
          {TEXTO[e]}
        </li>
      ))}
    </ul>
  )
}
