import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Info,
  Warning,
  WarningCircle,
  XCircle,
  type Icon
} from '@phosphor-icons/react'
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx, eur as eurTexto } from '../lib'

/* ---------- Botón ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  kbd?: string
}
export function Button({ variant = 'secondary', size = 'md', icon, kbd, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', !children && 'btn-icon', className)} {...rest}>
      {icon}
      {children}
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  )
}

/* ---------- Chip ---------- */
export function Chip({ tono, children, className, icon }: { tono?: 'accent' | 'pos' | 'neg' | 'warn'; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx('chip', tono && `chip-${tono}`, className)}>
      {icon}
      {children}
    </span>
  )
}

/* ---------- Estado: icono + etiqueta. El color nunca va solo ---------- */
export type Tono = 'pos' | 'neg' | 'warn' | 'info'
const ESTADO_ICONO: Record<Tono, Icon> = { pos: CheckCircle, neg: XCircle, warn: Warning, info: Info }
export function Estado({ tono, children, className }: { tono: Tono; children: ReactNode; className?: string }) {
  const I = ESTADO_ICONO[tono]
  const color = tono === 'info' ? 'text-ink-2' : tono === 'pos' ? 'text-pos' : tono === 'neg' ? 'text-neg' : 'text-warn'
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[length:var(--fs-small)] font-[560]', color, className)}>
      <I size={16} weight="fill" aria-hidden />
      {children}
    </span>
  )
}

/* ---------- Variación: flecha + cifra + respecto a qué ---------- */
export function Delta({ valor, contexto, dir, bueno, className }: { valor: string; contexto: string; dir: 'up' | 'down' | 'flat'; bueno: boolean | null; className?: string }) {
  const I = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : ArrowRight
  const color = bueno === null ? 'text-ink-2' : bueno ? 'text-pos' : 'text-neg'
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-x-1.5 text-[length:var(--fs-small)]', className)}>
      <span className={cx('inline-flex items-center gap-0.5 font-[600] tnum', color)}>
        <I size={13} weight="bold" aria-hidden />
        {valor}
      </span>
      <span className="text-ink-3">{contexto}</span>
    </span>
  )
}

/* ---------- Medidor ---------- */
export function Meter({ value, tone = 'accent', label, marker, className }: { value: number; tone?: 'accent' | 'warn' | 'neg' | 'pos'; label: string; marker?: number; className?: string }) {
  const color = tone === 'accent' ? 'var(--accent-mark)' : `var(--${tone})`
  return (
    <div
      className={cx('meter', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(value, 1) * 100)}
    >
      <i style={{ width: `${Math.min(value, 1) * 100}%`, background: color }} />
      {marker !== undefined && <b className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `calc(${marker * 100}% - 1px)` }} aria-hidden />}
    </div>
  )
}

/* ---------- Campos ---------- */
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[length:var(--fs-label)] text-neg">
          <WarningCircle size={14} weight="fill" aria-hidden />
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  )
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} {...props} className={cx('input', props.className)} />
})
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('input', props.className)} />
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
}

/* ---------- Segmentado ---------- */
export function Segmented<T extends string>({
  value,
  onChange,
  opciones,
  label
}: {
  value: T
  onChange: (v: T) => void
  opciones: { id: T; texto: string; icono?: ReactNode }[]
  label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {opciones.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.icono}
          {o.texto}
        </button>
      ))}
    </div>
  )
}

/* ---------- Cabeceras ---------- */
export function PageHeader({ titulo, texto, acciones, icono }: { titulo: string; texto?: string; acciones?: ReactNode; icono?: ReactNode }) {
  return (
    <header className="mb-[var(--density-gap)] flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="t-title flex items-center gap-2.5">
          {icono}
          {titulo}
        </h1>
        {texto && <p className="t-small mt-1.5 text-ink-2">{texto}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </header>
  )
}
export function CardHead({ titulo, icono, accion, className }: { titulo: string; icono?: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="t-label flex items-center gap-1.5">
        {icono}
        {titulo}
      </h2>
      {accion}
    </div>
  )
}

/* ---------- Estados diseñados ---------- */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden />
}
export function EmptyState({ icono, titulo, texto, accion, compacto }: { icono: ReactNode; titulo: string; texto: string; accion?: ReactNode; compacto?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center text-center', compacto ? 'gap-2 py-6' : 'gap-3 py-10')}>
      <div className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-accent-text">{icono}</div>
      <div className="t-heading">{titulo}</div>
      <p className="t-small max-w-[34ch] text-ink-2">{texto}</p>
      {accion}
    </div>
  )
}
export function ErrorState({ titulo, texto, accion }: { titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-neg bg-neg-soft p-4">
      <WarningCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-neg" aria-hidden />
      <div className="min-w-0">
        <div className="t-heading text-ink">{titulo}</div>
        <p className="t-small mt-1 text-ink-2">{texto}</p>
        {accion && <div className="mt-3">{accion}</div>}
      </div>
    </div>
  )
}

/* ---------- Cifras ---------- */
/** Importe grande: euros a tamaño completo y céntimos más pequeños y apagados */
export function CifraEur({ cents, className, signo }: { cents: number; className?: string; signo?: boolean }) {
  const t = eurTexto(cents, { sign: signo })
  const i = t.lastIndexOf(',')
  return (
    <span className={className}>
      {t.slice(0, i)}
      <span className="text-[0.5em] font-[560] tracking-normal text-ink-3">{t.slice(i)}</span>
    </span>
  )
}
/** Importe en listas y tablas: tabular, el ingreso en verde y el gasto en tinta (el rojo se reserva para lo que va mal) */
export function Importe({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx('tnum', cents > 0 && 'text-pos', className)}>{eurTexto(cents, { sign: true })}</span>
}
