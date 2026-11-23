import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { cx } from './cx'

/** Campo de texto de varias líneas, con la misma etiqueta, ayuda y error que TextField */
export const TextArea = forwardRef<HTMLTextAreaElement, { label: string; ayuda?: string; error?: string; className?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ label, ayuda, error, className, ...rest }, ref) {
  const id = useId()
  const hid = `${id}-h`
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={error || ayuda ? hid : undefined} {...rest} className={cx('input h-auto min-h-16 py-2')} />
      {error ? (
        <p id={hid} className="field-error">
          <WarningCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={hid} className="field-help">
            {ayuda}
          </p>
        )
      )}
    </div>
  )
})
