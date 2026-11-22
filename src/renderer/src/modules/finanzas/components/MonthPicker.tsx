import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { addMonthsToMonth, formatMonth } from '@shared/dates'
import { IconButton } from '../../../core/ui'

/** Selector de mes con flechas. `max` es el último mes que se puede elegir (por defecto, sin límite) */
export function MonthPicker({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Mes">
      <IconButton variant="ghost" etiqueta="Mes anterior" icono={<CaretLeft size={16} />} onClick={() => onChange(addMonthsToMonth(month, -1))} />
      <span className="t-body min-w-36 text-center font-semibold capitalize" aria-live="polite">
        {formatMonth(month, true)}
      </span>
      <IconButton variant="ghost" etiqueta="Mes siguiente" icono={<CaretRight size={16} />} disabled={!!max && month >= max} onClick={() => onChange(addMonthsToMonth(month, 1))} />
    </div>
  )
}
