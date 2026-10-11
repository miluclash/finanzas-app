// Kit de componentes de la interfaz.
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
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
import { dismiss, subscribe, type ToastItem } from '../lib/toast'

export const cx = clsx

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
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none',
        size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110',
        variant === 'secondary' && 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'border border-neg/40 bg-surface text-neg hover:bg-neg-soft',
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
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
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink', className)}
      {...rest}
    >
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
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-neg"> *</span>}
      </span>
      {children}
      {error ? <span className="text-[12px] text-neg">{error}</span> : hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </label>
  )
}

const inputCls =
  'h-9 min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:bg-surface-2 disabled:text-muted'

/** Ancho completo salvo que se indique un ancho (w-…) en className. */
function widthCls(className?: string) {
  return className && /(^|\s)w-/.test(className) ? '' : 'w-full'
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cx(inputCls, widthCls(className), className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'pr-7', widthCls(className), className)} {...rest}>
      {children}
    </select>
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'h-auto min-h-[64px] w-full py-2', className)} {...rest} />
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
    <label className={cx('flex items-start gap-2 text-sm', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
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
    <div className={cx('relative', className)}>
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        className={cx(inputCls, 'num w-full pr-7 text-right', invalid && 'border-neg')}
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
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
    </div>
  )
}

export function DateInput({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return <input type="date" className={cx(inputCls, 'num', widthCls(className), className)} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
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
    <div role="radiogroup" className="inline-flex flex-wrap rounded-md border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[5px] font-medium',
            size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-3 py-1 text-[13px]',
            value === o.value ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line-strong)]' : 'text-muted hover:text-ink'
          )}
        >
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
  if (cents === null || cents === undefined) return <span className={cx('num text-muted', className)}>—</span>
  return (
    <span className={cx('num', strong && 'font-semibold', colored && cents > 0 && 'text-pos', className)}>
      {formatEur(cents, { sign: sign && cents > 0 })}
    </span>
  )
}

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'pos' | 'neg' | 'warn' | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-px text-[12px] font-medium',
        tone === 'neutral' && 'bg-surface-2 text-ink-2 ring-1 ring-line',
        tone === 'pos' && 'bg-pos-soft text-pos',
        tone === 'neg' && 'bg-neg-soft text-neg',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'accent' && 'bg-accent-soft text-accent'
      )}
    >
      {children}
    </span>
  )
}

export function Progress({ value, tone = 'accent', className }: { value: number | null; tone?: 'accent' | 'pos' | 'warn' | 'neg'; className?: string }) {
  const v = Math.max(0, Math.min(1, value ?? 0))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx(
          'h-full rounded-full',
          tone === 'accent' && 'bg-accent',
          tone === 'pos' && 'bg-pos',
          tone === 'warn' && 'bg-warn',
          tone === 'neg' && 'bg-neg'
        )}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
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
    <section className={cx(boxed && 'rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <div className={cx('flex items-center justify-between gap-2', boxed ? 'border-b border-line px-4 py-2.5' : 'mb-2')}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="text-[12px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cx(boxed && 'p-4')}>{children}</div>
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
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium',
            value === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[11px] text-ink-2 ring-1 ring-line">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong px-5 py-6">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {text && <p className="max-w-[60ch] text-[13px] text-muted">{text}</p>}
      {action}
    </div>
  )
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {text}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-neg/40 bg-neg-soft px-3 py-2 text-sm text-neg">
      <XCircle className="mt-0.5 size-4 shrink-0" />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'warn' | 'neg' | 'info' | 'pos'; children: ReactNode }) {
  const Icon = tone === 'neg' ? XCircle : tone === 'warn' ? AlertTriangle : tone === 'pos' ? CheckCircle2 : Info
  return (
    <div
      className={cx(
        'flex items-start gap-2 rounded-md px-3 py-2 text-[13px]',
        tone === 'neg' && 'bg-neg-soft text-neg',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'info' && 'bg-accent-soft text-ink-2',
        tone === 'pos' && 'bg-pos-soft text-pos'
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ---------- Diálogos ----------

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
      className="m-auto max-h-[90vh] w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl"
      style={{ maxWidth: width }}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="text-[16px] font-semibold">{title}</h2>
            <IconButton label="Cerrar" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
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
          <Button onClick={() => close(false)}>Cancelar</Button>
          <Button variant={cur?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {cur?.confirm ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-2">{cur?.text}</div>
    </Modal>
  )
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribe(setItems), [])
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface px-3 py-2.5 text-sm shadow-lg',
            t.kind === 'error' ? 'border-neg/50' : 'border-line'
          )}
        >
          {t.kind === 'error' ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-neg" />
          ) : t.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pos" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-accent" />
          )}
          <span className="min-w-0 flex-1">{t.text}</span>
          <button className="text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Fila etiqueta / valor para resúmenes. */
export function KV({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-1 text-[13px]', className)}>
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  )
}
