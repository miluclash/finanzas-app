import { ChatsCircle, PencilSimpleLine, Sparkle, X } from '@phosphor-icons/react'
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { PanelAsistente, type Vista } from '../asistente/PanelAsistente'
import { IconButton, useFocusScope } from '../ui'
export const AI_MIN = 320
export const AI_MAX = 560

/** La conversación abierta se recuerda al cerrar y abrir el panel (mientras la app sigue abierta). */
let hiloRecordado: string | null = null

/** AssistantPanel: marco del asistente. Redimensionable (mín. y máx.), por encima del contenido en ventanas estrechas.
 *  El contenido (estado, conversaciones, chat, propuestas y sugerencias) vive en `core/asistente/`. */
export function AssistantPanel({ ancho, onAncho, onCerrar, superpuesto }: { ancho: number; onAncho: (n: number) => void; onCerrar: () => void; superpuesto: boolean }) {
  const arrastrando = useRef(false)
  const cerrar = useRef<HTMLButtonElement>(null)
  const [vista, setVista] = useState<Vista>('chat')
  const [hilo, setHilo] = useState<string | null>(hiloRecordado)
  const elegirHilo = (id: string | null) => {
    hiloRecordado = id
    setHilo(id)
  }
  const limitar = (n: number) => Math.min(AI_MAX, Math.max(AI_MIN, n))
  const panel = (
    <aside
      aria-label="Asistente"
      onClick={(e) => superpuesto && (e.target as HTMLElement).closest('a[href]') && onCerrar()}
      className="slide-in relative flex h-full shrink-0 flex-col border-l border-line bg-sidebar"
      style={{ width: Math.min(ancho, superpuesto ? window.innerWidth - 64 : ancho) }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Cambiar el ancho del asistente"
        aria-valuemin={AI_MIN}
        aria-valuemax={AI_MAX}
        aria-valuenow={ancho}
        tabIndex={0}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none hover:bg-line-strong focus-visible:bg-focus"
        onPointerDown={(e) => {
          arrastrando.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => arrastrando.current && onAncho(limitar(window.innerWidth - e.clientX))}
        onPointerUp={() => (arrastrando.current = false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') (e.preventDefault(), onAncho(limitar(ancho + 16)))
          if (e.key === 'ArrowRight') (e.preventDefault(), onAncho(limitar(ancho - 16)))
        }}
      />
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-6 pr-3">
        <h2 className="t-card-title flex items-center gap-2">
          <Sparkle size={20} weight="duotone" className="text-accent-text" aria-hidden />
          Asistente
        </h2>
        <div className="flex items-center gap-1">
          <IconButton
            variant={vista === 'lista' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={vista === 'lista'}
            etiqueta={vista === 'lista' ? 'Volver a la conversación' : 'Ver las conversaciones'}
            onClick={() => setVista(vista === 'lista' ? 'chat' : 'lista')}
            icono={<ChatsCircle size={16} />}
          />
          <IconButton variant="ghost" size="sm" etiqueta="Nueva conversación" onClick={() => (elegirHilo(null), setVista('chat'))} icono={<PencilSimpleLine size={16} />} />
          <IconButton ref={cerrar} variant="ghost" size="sm" etiqueta="Cerrar el asistente" onClick={onCerrar} icono={<X size={16} />} />
        </div>
      </div>
      <PanelAsistente vista={vista} setVista={setVista} threadId={hilo} setThreadId={elegirHilo} />
    </aside>
  )
  if (!superpuesto) return panel
  return (
    <CapaSuperpuesta onCerrar={onCerrar} inicial={cerrar}>
      {panel}
    </CapaSuperpuesta>
  )
}

/** Asistente por encima del contenido: es un diálogo modal (Esc lo cierra, el foco queda dentro y vuelve al botón que lo abrió) */
function CapaSuperpuesta({ onCerrar, inicial, children }: { onCerrar: () => void; inicial: RefObject<HTMLElement | null>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusScope(ref, inicial)
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Asistente"
      className="fixed inset-0 z-40 flex justify-end"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCerrar()
        }
      }}
    >
      <div className="fade-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onCerrar} aria-hidden />
      <div className="relative z-10 flex h-full">{children}</div>
    </div>
  )
}
