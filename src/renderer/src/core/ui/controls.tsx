import { CalendarBlank, CaretLeft, CaretRight, WarningCircle } from '@phosphor-icons/react'
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx } from './cx'
import { Popover } from './feedback'

/* ======================= Button ======================= */
export type BtnVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  kbd?: string
  cargando?: boolean
  /** Fuerza un estado para la hoja del sistema */
  estado?: 'hover' | 'active' | 'focus'
}
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', icon, kbd, cargando, estado, className, children, type = 'button', disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={cargando || undefined}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', !children && 'btn-icon', estado === 'hover' && 'is-hover', estado === 'active' && 'is-active', estado === 'focus' && 'is-focus-demo', className)}
      {...rest}
    >
      {cargando ? <span className="spinner" aria-hidden /> : icon}
      {children}
      {kbd && !cargando && <span className="kbd">{kbd}</span>}
    </button>
  )
})
/** IconButton: solo icono, con nombre accesible obligatorio */
export const IconButton = forwardRef<HTMLButtonElement, Omit<BtnProps, 'children' | 'kbd'> & { etiqueta: string; icono: ReactNode }>(function IconButton({ etiqueta, icono, ...rest }, ref) {
  return <Button ref={ref} aria-label={etiqueta} icon={icono} {...rest} />
})

/* ======================= TextField, Select ======================= */
type FieldProps = {
  label: string
  ayuda?: string
  error?: string
  unidad?: string
  icono?: ReactNode
  className?: string
  tamano?: 'sm' | 'md' | 'lg'
  /** Etiqueta solo para lectores de pantalla */
  ocultarEtiqueta?: boolean
}
export const TextField = forwardRef<HTMLInputElement, FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { estado?: 'hover' | 'focus' }>(function TextField({ label, ayuda, error, unidad, icono, className, tamano, ocultarEtiqueta, estado, ...rest }, ref) {
  const id = useId()
  const hid = `${id}-h`
  return (
    <div className={className}>
      <label htmlFor={id} className={cx('field-label', ocultarEtiqueta && 'sr-only')}>
        {label}
      </label>
      <div className="input-wrap">
        {icono && <span className="input-icon">{icono}</span>}
        <input id={id} ref={ref} aria-invalid={error ? true : undefined} aria-describedby={error || ayuda ? hid : undefined} {...rest} style={unidad ? ({ '--unit-w': `${unidad.length}ch` } as React.CSSProperties) : undefined} className={cx('input', tamano === 'sm' && 'input-sm', tamano === 'lg' && 'input-lg', unidad && 'has-unit', icono ? 'has-icon' : false, estado === 'hover' && 'is-hover', estado === 'focus' && 'is-focus')} />
        {unidad && <span className="input-unit t-label">{unidad}</span>}
      </div>
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
export function Select({ label, ayuda, error, className, tamano, ocultarEtiqueta, children, ...rest }: FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>) {
  const id = useId()
  const hid = `${id}-h`
  return (
    <div className={className}>
      <label htmlFor={id} className={cx('field-label', ocultarEtiqueta && 'sr-only')}>
        {label}
      </label>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={error || ayuda ? hid : undefined} {...rest} className={cx('input', tamano === 'sm' && 'input-sm')}>
        {children}
      </select>
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
}

/* ======================= Switch, Checkbox ======================= */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="switch" onClick={() => onChange(!checked)} />
}
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <input id={id} type="checkbox" className="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="t-body">
        {label}
      </label>
    </div>
  )
}

/* ======================= SegmentedControl ======================= */
/** Grupo de opciones excluyentes. Flechas para moverse, Tab entra y sale del grupo */
export function SegmentedControl<T extends string>({ value, onChange, opciones, label, tamano }: { value: T; onChange: (v: T) => void; opciones: { id: T; texto: string; icono?: ReactNode; desactivada?: boolean }[]; label: string; tamano?: 'sm' }) {
  const ref = useRef<HTMLDivElement>(null)
  const mover = (e: React.KeyboardEvent, i: number) => {
    const n = opciones.length
    let j = i
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + n - 1) % n
    else return
    e.preventDefault()
    onChange(opciones[j].id)
    ref.current?.querySelectorAll<HTMLElement>('button')[j]?.focus()
  }
  return (
    <div ref={ref} className={cx('seg', tamano === 'sm' && 'seg-sm')} role="radiogroup" aria-label={label}>
      {opciones.map((o, i) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} tabIndex={value === o.id ? 0 : -1} disabled={o.desactivada} onClick={() => onChange(o.id)} onKeyDown={(e) => mover(e, i)}>
          {o.icono}
          {o.texto}
        </button>
      ))}
    </div>
  )
}

/* ======================= DatePicker ======================= */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (s: string) => s.split('-').reverse().join('/')

/** Selector de fecha: campo con calendario. Flechas mueven el día, Intro elige, Esc cierra y devuelve el foco */
export function DatePicker({ label, value, onChange, ayuda, abiertoInicial }: { label: string; value: string; onChange: (v: string) => void; ayuda?: string; abiertoInicial?: boolean }) {
  const id = useId()
  return (
    <div>
      <span id={id} className="field-label">
        {label}
      </span>
      <Popover
        etiqueta={`Calendario: ${label}`}
        abiertoInicial={abiertoInicial}
        boton={({ abierto, alternar }) => (
          <button type="button" data-popover-trigger aria-labelledby={id} aria-haspopup="dialog" aria-expanded={abierto} onClick={alternar} className="input flex min-w-48 items-center justify-between gap-3 text-left">
            <span className="tnum">{fmt(value)}</span>
            <CalendarBlank size={18} className="text-ink-3" aria-hidden />
          </button>
        )}
      >
        {(cerrar) => <Calendario value={value} onElegir={(v) => (onChange(v), cerrar())} />}
      </Popover>
      {ayuda && <p className="field-help">{ayuda}</p>}
    </div>
  )
}
function Calendario({ value, onElegir }: { value: string; onElegir: (v: string) => void }) {
  const base = new Date(value + 'T12:00:00')
  const [mes, setMes] = useState(new Date(base.getFullYear(), base.getMonth(), 1))
  const [foco, setFoco] = useState(value)
  const rejilla = useRef<HTMLDivElement>(null)
  const primero = (mes.getDay() + 6) % 7
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const celdas: (string | null)[] = [...Array(primero).fill(null), ...Array.from({ length: dias }, (_, i) => iso(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))]
  useEffect(() => {
    rejilla.current?.querySelector<HTMLElement>(`[data-d="${foco}"]`)?.focus()
  }, [foco, mes])
  const mover = (e: React.KeyboardEvent, d: string) => {
    const f = new Date(d + 'T12:00:00')
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0
    if (!delta) return
    e.preventDefault()
    f.setDate(f.getDate() + delta)
    setMes(new Date(f.getFullYear(), f.getMonth(), 1))
    setFoco(iso(f))
  }
  return (
    <div className="w-72">
      <div className="mb-3 flex items-center justify-between">
        <IconButton variant="ghost" size="sm" etiqueta="Mes anterior" icono={<CaretLeft size={16} />} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} />
        <div className="t-card-title capitalize" aria-live="polite">
          {MESES[mes.getMonth()]} {mes.getFullYear()}
        </div>
        <IconButton variant="ghost" size="sm" etiqueta="Mes siguiente" icono={<CaretRight size={16} />} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} />
      </div>
      <div ref={rejilla} role="grid" aria-label="Días del mes" className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => (
          <div key={d} role="columnheader" className="t-meta grid h-8 place-items-center">
            {d}
          </div>
        ))}
        {celdas.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              role="gridcell"
              data-d={d}
              aria-selected={d === value}
              tabIndex={d === foco ? 0 : -1}
              onClick={() => onElegir(d)}
              onKeyDown={(e) => mover(e, d)}
              className={cx('tnum grid h-10 place-items-center r-control t-body', d === value ? 'bg-primary text-on-primary font-semibold' : 'text-ink hover:bg-interactive')}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`v${i}`} />
          )
        )}
      </div>
    </div>
  )
}
