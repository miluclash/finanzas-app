import { ShieldCheck, Sparkle, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import { IconButton, Tag } from '../ui'
export const AI_MIN = 320
export const AI_MAX = 560

/** AssistantPanel: solo el hueco. Redimensionable (mín. y máx.), por encima del contenido en ventanas estrechas.
 *  Estado vacío «Próximamente», sin respuestas simuladas. */
export function AssistantPanel({ ancho, onAncho, onCerrar, superpuesto }: { ancho: number; onAncho: (n: number) => void; onCerrar: () => void; superpuesto: boolean }) {
  const arrastrando = useRef(false)
  const limitar = (n: number) => Math.min(AI_MAX, Math.max(AI_MIN, n))
  const panel = (
    <aside aria-label="Asistente" className="slide-in relative flex h-full shrink-0 flex-col border-l border-line bg-sidebar" style={{ width: Math.min(ancho, superpuesto ? window.innerWidth - 64 : ancho) }}>
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
        <IconButton variant="ghost" size="sm" etiqueta="Cerrar el asistente" onClick={onCerrar} icono={<X size={16} />} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="grid size-16 place-items-center r-card border border-line-strong bg-raised">
          <Sparkle size={32} weight="duotone" className="text-accent-text" aria-hidden />
        </div>
        <div>
          <h3 className="t-section">Próximamente</h3>
          <p className="t-label mt-2">El asistente local llegará en la fase de IA local. Funcionará con un modelo en tu equipo, sin enviar nada a internet.</p>
        </div>
        <Tag icono={<ShieldCheck size={14} weight="fill" aria-hidden />}>Solo en tu equipo</Tag>
      </div>
      <div className="border-t border-line p-4">
        <label htmlFor="ia-entrada" className="sr-only">
          Pregunta al asistente (aún no disponible)
        </label>
        <input id="ia-entrada" className="input" disabled placeholder="Aún no disponible" />
      </div>
    </aside>
  )
  if (!superpuesto) return panel
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onCerrar} aria-hidden />
      <div className="relative z-10 flex h-full">{panel}</div>
    </div>
  )
}
