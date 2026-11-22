// Capa de compatibilidad de las páginas de Finanzas que aún no se han reestilizado (parte B de F2).
// Conserva la API que usan hoy (Button, Field, Segmented, Section…) pero dibuja con el sistema de diseño
// nuevo (src/renderer/src/core/ui y core/design). Las páginas nuevas importan de core/ui, no de aquí.
// Cuando la última página migre, este archivo se borra.
import { CheckCircle, Info, Tray, Warning, WarningCircle, X } from '@phosphor-icons/react'
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { formatEur, formatNumber, parseEurToCents } from '@shared/money'
import { Count, EmptyState as EmptyStateBase, ErrorState, LoadingState, PageHeader as PageHeaderBase, Toaster as ToasterBase, cx } from '../core/ui'

export { cx }
export const Toaster = ToasterBase

// ---------- Botones ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode; loading?: boolean }
>(function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('btn', variant === 'primary' ? 'btn-accent' : `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('btn btn-ghost btn-icon btn-sm', className)} {...rest}>
      {children}
    </button>
  )
}

// ---------- Formularios ----------

export function Field({
  label,
  hint,
  error,
  children,
  className,
  required
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
  required?: boolean
}) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-2', className)}>
      <span className="t-label font-semibold">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="t-label flex items-start gap-1 text-error">
          <WarningCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden />
          {error}
        </span>
      ) : hint ? (
        <span className="t-meta">{hint}</span>
      ) : null}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input', className)} {...rest}>
      {children}
    </select>
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input h-auto min-h-16 py-2', className)} {...rest} />
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cx('flex items-start gap-3 t-body', disabled && 'opacity-60')}>
      <input type="checkbox" className="checkbox size-5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="t-meta block">{hint}</span>}
      </span>
    </label>
  )
}

/** Importe en euros con formato español. Trabaja en céntimos. */
export function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  placeholder = '0,00',
  autoFocus,
  className,
  id,
  disabled
}: {
  value: number | null
  onChange: (cents: number | null) => void
  allowNegative?: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
  id?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(value === null ? '' : formatNumber(value))
  const [invalid, setInvalid] = useState(false)
  const last = useRef<number | null>(value)
  useEffect(() => {
    if (value !== last.current) {
      setText(value === null ? '' : formatNumber(value))
      last.current = value
    }
  }, [value])
  return (
    <div className={cx('input-wrap', className)}>
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="input tnum has-unit text-right"
        style={{ '--unit-w': '1ch' } as React.CSSProperties}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          let c = parseEurToCents(t)
          if (c !== null && !allowNegative) c = Math.abs(c)
          setInvalid(t.trim() !== '' && c === null)
          last.current = c
          onChange(c)
        }}
        onBlur={() => {
          if (last.current !== null) setText(formatNumber(last.current))
        }}
      />
      <span className="input-unit">€</span>
    </div>
  )
}

export function DateInput({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return <input type="date" className={cx('input tnum', className)} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md'
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className={cx('seg flex-wrap', size === 'sm' && 'seg-sm')}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Presentación ----------

export function Amount({
  cents,
  sign = true,
  colored = true,
  className,
  strong
}: {
  cents: number | null | undefined
  sign?: boolean
  colored?: boolean
  className?: string
  strong?: boolean
}) {
  if (cents === null || cents === undefined) return <span className={cx('tnum text-ink-3', className)}>—</span>
  return (
    <span className={cx('tnum', strong && 'font-semibold', colored && cents > 0 && 'text-success', className)}>
      {formatEur(cents, { sign: sign && cents > 0 })}
    </span>
  )
}

/** Etiqueta: un único estilo (borde, fondo y forma); el tono solo cambia el color del texto. */
export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'pos' | 'neg' | 'warn' | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'tag',
        tone === 'pos' && 'text-success',
        tone === 'neg' && 'text-error',
        tone === 'warn' && 'text-warning',
        tone === 'accent' && 'text-accent-text'
      )}
    >
      {children}
    </span>
  )
}

export function Progress({ value, tone = 'accent', className }: { value: number | null; tone?: 'accent' | 'pos' | 'warn' | 'neg'; className?: string }) {
  const v = Math.max(0, Math.min(1, value ?? 0))
  const color = tone === 'accent' ? 'var(--accent-mark)' : tone === 'pos' ? 'var(--success)' : tone === 'warn' ? 'var(--warning)' : 'var(--error)'
  return (
    <div className={cx('progress', className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${v * 100}%`, background: color }} />
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <PageHeaderBase titulo={title} texto={description} acciones={actions} className="mb-0!" />
}

export function Section({
  title,
  actions,
  children,
  className,
  boxed,
  description
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  boxed?: boolean
  description?: ReactNode
}) {
  return (
    <section className={cx(boxed && 'card', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="t-card-title">{title}</h2>}
            {description && <p className="t-meta">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </section>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: Array<{ id: T; label: string; count?: number }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="tablist" className="tabs">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <Count>{t.count}</Count>}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="r-card border border-dashed border-line-strong">
      <EmptyStateBase icono={<Tray size={24} aria-hidden />} titulo={title} texto={typeof text === 'string' ? text : ''} accion={action} compacto />
      {typeof text !== 'string' && text && <div className="t-label mx-auto max-w-md px-6 pb-6 text-center">{text}</div>}
    </div>
  )
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="py-8">
      <LoadingState etiqueta={text} filas={2} />
      <p className="t-meta mt-3" aria-hidden>
        {text}
      </p>
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return <ErrorState titulo="Algo no ha salido bien" texto={error instanceof Error ? error.message : String(error)} />
}

export function Notice({ tone, children }: { tone: 'warn' | 'neg' | 'info' | 'pos'; children: ReactNode }) {
  const Icon = tone === 'neg' ? WarningCircle : tone === 'warn' ? Warning : tone === 'pos' ? CheckCircle : Info
  return (
    <div
      className={cx(
        't-label flex items-start gap-2 r-control px-3 py-2 text-ink',
        tone === 'neg' && 'bg-error-soft',
        tone === 'warn' && 'bg-warning-soft',
        tone === 'info' && 'bg-info-soft',
        tone === 'pos' && 'bg-success-soft'
      )}
    >
      <Icon
        size={16}
        weight="fill"
        aria-hidden
        className={cx('mt-0.5 shrink-0', tone === 'neg' && 'text-error', tone === 'warn' && 'text-warning', tone === 'info' && 'text-info', tone === 'pos' && 'text-success')}
      />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ---------- Diálogos ----------

/** Diálogo nativo (`<dialog>`): el navegador ya atrapa el foco y cierra con Esc. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="elevated r-modal m-auto max-h-[90vh] w-[calc(100vw-32px)] overflow-hidden p-0 text-ink"
      style={{ maxWidth: width }}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
            <h2 className="t-section">{title}</h2>
            <IconButton label="Cerrar" onClick={onClose}>
              <X size={16} aria-hidden />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-raised px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

// Confirmación global: const ok = await confirmDialog({...})
interface ConfirmOpts {
  title: string
  text?: ReactNode
  confirm?: string
  danger?: boolean
}
let confirmSetter: ((v: (ConfirmOpts & { resolve: (b: boolean) => void }) | null) => void) | null = null

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmSetter) return resolve(window.confirm(opts.title))
    confirmSetter({ ...opts, resolve })
  })
}

export function ConfirmHost() {
  const [cur, setCur] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null)
  useEffect(() => {
    confirmSetter = setCur
    return () => {
      confirmSetter = null
    }
  }, [])
  const close = (v: boolean) => {
    cur?.resolve(v)
    setCur(null)
  }
  return (
    <Modal
      open={!!cur}
      onClose={() => close(false)}
      title={cur?.title ?? ''}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <button type="button" className={cx('btn', cur?.danger ? 'btn-danger-solid' : 'btn-accent')} onClick={() => close(true)} autoFocus>
            {cur?.confirm ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="t-body text-ink-2">{cur?.text}</div>
    </Modal>
  )
}

/** Fila etiqueta / valor para resúmenes. */
export function KV({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('t-label flex items-baseline justify-between gap-4 py-1', className)}>
      <span>{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  )
}
