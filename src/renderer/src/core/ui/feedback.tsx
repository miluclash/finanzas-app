import { CheckCircle, Info, Warning, WarningCircle, X, type Icon } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'
import { dismiss, subscribe, type ToastItem } from '../../lib/toast'
import { Button } from './controls'

/* ======================= Foco: atrapar y devolver ======================= */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Atrapa el foco dentro del contenedor mientras está montado y lo devuelve a quien lo abrió al cerrar */
export function useFocusScope(ref: React.RefObject<HTMLElement | null>, inicial?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const abridor = document.activeElement as HTMLElement | null
    const el = ref.current
    const lista = () => (el ? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)] : [])
    const t = window.setTimeout(() => (inicial?.current ?? lista()[0] ?? el)?.focus(), 0)
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const f = lista()
      if (!f.length) return
      const primero = f[0]
      const ultimo = f[f.length - 1]
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', fn)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', fn)
      if (abridor && document.contains(abridor)) abridor.focus()
    }
  }, [ref, inicial])
}

/* ======================= Estados y etiquetas ======================= */
export type Tono = 'success' | 'warning' | 'error' | 'info' | 'neutral'
const ICONO_ESTADO: Record<Exclude<Tono, 'neutral'>, Icon> = { success: CheckCircle, warning: Warning, error: WarningCircle, info: Info }

/** StatusBadge: el estado siempre lleva icono y texto; el color nunca va solo */
export function StatusBadge({ tono, children, className }: { tono: Tono; children: ReactNode; className?: string }) {
  const I = tono === 'neutral' ? Info : ICONO_ESTADO[tono]
  return (
    <span className={cx('status', `status-${tono}`, className)}>
      <I size={16} weight="fill" aria-hidden className="shrink-0" />
      <span>{children}</span>
    </span>
  )
}

const AVISO_FONDO: Record<Exclude<Tono, 'neutral'>, string> = { success: 'bg-success-soft', warning: 'bg-warning-soft', error: 'bg-error-soft', info: 'bg-info-soft' }
const AVISO_ICONO: Record<Exclude<Tono, 'neutral'>, string> = { success: 'text-success', warning: 'text-warning', error: 'text-error', info: 'text-info' }
/** Aviso: bloque con icono y varias líneas de texto (listas de advertencias, notas largas). El estado va con icono y texto, no solo con color */
export function Aviso({ tono, children, className }: { tono: Exclude<Tono, 'neutral'>; children: ReactNode; className?: string }) {
  const I = ICONO_ESTADO[tono]
  return (
    <div role={tono === 'error' ? 'alert' : undefined} className={cx('t-label flex items-start gap-3 r-control px-4 py-3 text-ink', AVISO_FONDO[tono], className)}>
      <I size={20} weight="fill" aria-hidden className={cx('mt-px shrink-0', AVISO_ICONO[tono])} />
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  )
}

/** Tag: un único estilo de etiqueta (recurrente, reembolso, pendiente, posible duplicado…) */
export function Tag({ children, icono, tono, className, title }: { children: ReactNode; icono?: ReactNode; tono?: 'warning' | 'info' | 'accent'; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('tag', tono && `tag-${tono}`, className)}>
      {icono}
      {children}
    </span>
  )
}
export function Count({ children, tono, label }: { children: ReactNode; tono?: 'warning'; label?: string }) {
  return (
    <span className={cx('count tnum', tono && `count-${tono}`)} aria-label={label}>
      {children}
    </span>
  )
}

/* ======================= Estados de pantalla ======================= */
export function EmptyState({ icono, titulo, texto, accion, compacto, horizontal }: { icono: ReactNode; titulo: string; texto: string; accion?: ReactNode; compacto?: boolean; horizontal?: boolean }) {
  const marca = <div className="grid size-12 shrink-0 place-items-center r-full border border-line-strong bg-raised text-accent-text">{icono}</div>
  // Horizontal: icono a la izquierda y texto a la derecha, para tarjetas que no deben crecer
  if (horizontal)
    return (
      <div className="flex items-start gap-4">
        {marca}
        <div className="min-w-0">
          <div className="t-card-title t-plain">{titulo}</div>
          <p className="t-label mt-1 max-w-md">{texto}</p>
          {accion && <div className="mt-3">{accion}</div>}
        </div>
      </div>
    )
  return (
    <div className={cx('flex flex-col items-center text-center', compacto ? 'gap-2 py-6' : 'gap-3 py-10')}>
      {marca}
      <div className="t-card-title t-plain">{titulo}</div>
      <p className="t-label max-w-xs">{texto}</p>
      {accion}
    </div>
  )
}
/** LoadingState: esqueleto con la forma de lo que va a llegar; avisa con role=status */
export function LoadingState({ filas = 3, etiqueta = 'Cargando datos' }: { filas?: number; etiqueta?: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={etiqueta} aria-busy="true">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton h-10 w-48" />
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  )
}
export function ErrorState({ titulo, texto, accion }: { titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 r-card border border-error bg-error-soft p-4">
      <WarningCircle size={24} weight="fill" className="mt-1 shrink-0 text-error" aria-hidden />
      <div className="min-w-0">
        <div className="t-card-title t-plain">{titulo}</div>
        <p className="t-label mt-1">{texto}</p>
        {accion && <div className="mt-3">{accion}</div>}
      </div>
    </div>
  )
}

/* ======================= Tooltip ======================= */
/** Tooltip accesible: aparece con ratón y con foco, se cierra con Esc y describe al elemento con aria-describedby.
 *  Va en posición fija para que ningún contenedor con scroll lo recorte (por ejemplo, la barra lateral plegada). */
export function Tooltip({ texto, children, lado = 'top', abierto }: { texto: string; children: ReactElement; lado?: 'top' | 'right' | 'bottom'; abierto?: boolean }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const mostrar = abierto ?? visible
  useLayoutEffect(() => {
    if (!mostrar || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const hueco = 8
    setPos(lado === 'right' ? { left: r.right + hueco, top: r.top + r.height / 2 } : lado === 'bottom' ? { left: r.left + r.width / 2, top: r.bottom + hueco } : { left: r.left + r.width / 2, top: r.top - hueco })
  }, [mostrar, lado, texto])
  const transform = lado === 'right' ? 'translateY(-50%)' : lado === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)'
  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(e) => e.key === 'Escape' && setVisible(false)}
    >
      <span className="contents" aria-describedby={mostrar ? id : undefined}>
        {children}
      </span>
      {mostrar &&
        pos &&
        createPortal(
          <span role="tooltip" id={id} className="tooltip fade-in" style={{ position: 'fixed', left: pos.left, top: pos.top, transform }}>
            {texto}
          </span>,
          document.body
        )}
    </span>
  )
}

/* ======================= Popover ======================= */
/** Popover: panel anclado a un botón. Esc cierra, el clic fuera cierra y el foco vuelve al botón */
export function Popover({ etiqueta, boton, children, alinear = 'left', abiertoInicial }: { etiqueta: string; boton: (p: { abierto: boolean; alternar: () => void; id: string }) => ReactNode; children: (cerrar: () => void) => ReactNode; alinear?: 'left' | 'right'; abiertoInicial?: boolean }) {
  const [abierto, setAbierto] = useState(!!abiertoInicial)
  const raiz = useRef<HTMLDivElement>(null)
  const id = useId()
  const cerrar = useCallback(() => {
    setAbierto(false)
    raiz.current?.querySelector<HTMLElement>('[data-popover-trigger]')?.focus()
  }, [])
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])
  return (
    <div ref={raiz} className="relative inline-block" onKeyDown={(e) => abierto && e.key === 'Escape' && (e.stopPropagation(), cerrar())}>
      <span data-popover-trigger-wrap className="contents">
        {boton({ abierto, alternar: () => setAbierto((v) => !v), id })}
      </span>
      {abierto && (
        <div id={id} role="dialog" aria-label={etiqueta} className={cx('elevated pop-in absolute top-full z-30 mt-2 r-card p-4', alinear === 'right' ? 'right-0' : 'left-0')}>
          {children(cerrar)}
        </div>
      )}
    </div>
  )
}

/* ======================= Modal ======================= */
/** Modal: se pinta en el <body> (un contenedor con `contain` o con scroll descolocaría un `fixed`) y conserva el módulo
 *  (data-module) del lugar donde se abre, para que mantenga sus colores de identidad. */
export function Modal(props: ModalProps) {
  const ancla = useRef<HTMLSpanElement>(null)
  const [modulo, setModulo] = useState<string | null | undefined>(undefined)
  useLayoutEffect(() => setModulo(ancla.current?.closest('[data-module]')?.getAttribute('data-module') ?? null), [])
  return (
    <>
      <span ref={ancla} hidden />
      {modulo !== undefined && createPortal(<div data-module={modulo ?? undefined} className="contents"><ModalCuerpo {...props} /></div>, document.body)}
    </>
  )
}
type ModalProps = { titulo: string; descripcion?: string; onCerrar: () => void; children?: ReactNode; pie?: ReactNode; ancho?: 'sm' | 'md' | 'lg' | 'xl'; inicial?: React.RefObject<HTMLElement | null> }
function ModalCuerpo({ titulo, descripcion, onCerrar, children, pie, ancho = 'md', inicial }: { titulo: string; descripcion?: string; onCerrar: () => void; children?: ReactNode; pie?: ReactNode; ancho?: 'sm' | 'md' | 'lg' | 'xl'; inicial?: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const tid = useId()
  const did = useId()
  useFocusScope(ref, inicial)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="fade-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onCerrar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tid}
        aria-describedby={descripcion ? did : undefined}
        className={cx('elevated pop-in r-modal relative flex max-h-full w-full flex-col overflow-y-auto p-6', ancho === 'sm' ? 'max-w-md' : ancho === 'xl' ? 'max-w-4xl' : ancho === 'lg' ? 'max-w-xl' : 'max-w-lg')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCerrar()
          }
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={tid} className="t-section">
              {titulo}
            </h2>
            {descripcion && (
              <p id={did} className="t-label mt-1">
                {descripcion}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" aria-label="Cerrar" onClick={onCerrar} icon={<X size={16} />} />
        </div>
        <div>{children}</div>
        {pie && <div className="mt-6 flex items-center justify-end gap-2">{pie}</div>}
      </div>
    </div>
  )
}

/** Confirmación de una acción delicada: el botón destructivo no recibe el foco inicial */
export function ConfirmDialog({ titulo, texto, confirmar, onConfirmar, onCancelar, peligro = true }: { titulo: string; texto: string; confirmar: string; onConfirmar: () => void; onCancelar: () => void; peligro?: boolean }) {
  const cancelar = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      titulo={titulo}
      descripcion={texto}
      ancho="sm"
      inicial={cancelar}
      onCerrar={onCancelar}
      pie={
        <>
          <Button ref={cancelar} variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variant={peligro ? 'danger-solid' : 'primary'} onClick={onConfirmar}>
            {confirmar}
          </Button>
        </>
      }
    />
  )
}

/* ======================= Toast ======================= */
export function Toast({ tono, children, onCerrar }: { tono: Tono; children: ReactNode; onCerrar?: () => void }) {
  return (
    <div className="toast">
      <StatusBadge tono={tono}>{children}</StatusBadge>
      {onCerrar && <Button variant="ghost" size="sm" aria-label="Cerrar aviso" onClick={onCerrar} icon={<X size={14} />} />}
    </div>
  )
}

/** Avisos breves (éxito, error, información). Se alimenta de lib/toast: `toast.success('…')`. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribe(setItems), [])
  return (
    <div className="fixed bottom-6 right-6 flex max-w-sm flex-col gap-2" style={{ zIndex: 'var(--z-toast)' }} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="slide-in">
          <Toast tono={t.kind === 'error' ? 'error' : t.kind === 'success' ? 'success' : 'info'} onCerrar={() => dismiss(t.id)}>
            {t.text}
          </Toast>
        </div>
      ))}
    </div>
  )
}
