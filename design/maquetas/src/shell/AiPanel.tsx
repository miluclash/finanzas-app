import { PaperPlaneRight, ShieldCheck, Sparkle, X } from '@phosphor-icons/react'
import { Button } from '../ui/basics'

/** Solo el hueco: en F2 no hay funcionalidad. El estado vacío explica qué llegará y cuándo. */
export function AiPanel({ onCerrar }: { onCerrar: () => void }) {
  return (
    <aside aria-label="Asistente" className="slide-in flex shrink-0 flex-col border-l border-line bg-sidebar" style={{ width: 'var(--ai-w)' }}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-5 pr-3">
        <h2 className="t-heading flex items-center gap-2">
          <Sparkle size={18} weight="duotone" className="text-accent-text" aria-hidden />
          Asistente
        </h2>
        <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar el asistente" icon={<X size={16} />} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="relative grid size-16 place-items-center rounded-[20px] border border-line-strong bg-surface-2">
          <Sparkle size={30} weight="duotone" className="text-accent-text" aria-hidden />
          <span className="absolute -right-1.5 -top-1.5 rounded-full border border-line-strong bg-surface-1 px-2 py-0.5 text-[10.5px] font-[600] text-ink-2">Pronto</span>
        </div>
        <div>
          <h3 className="t-heading">Asistente local</h3>
          <p className="t-small mt-1.5 text-ink-2">Llegará en la fase de IA local.</p>
        </div>
        <p className="t-small max-w-[26ch] text-ink-3">Responderá sobre tus cifras con un modelo que corre en tu equipo. Nada sale a internet.</p>
        <span className="chip">
          <ShieldCheck size={14} weight="fill" aria-hidden />
          Solo en tu equipo
        </span>
      </div>

      <div className="border-t border-line p-4">
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-1 py-1.5 pl-3 pr-1.5 opacity-70">
          <input className="min-w-0 flex-1 bg-transparent text-[length:var(--fs-small)] outline-none placeholder:text-ink-3" placeholder="Pregunta algo (próximamente)" disabled aria-label="Pregunta al asistente (aún no disponible)" />
          <Button size="sm" variant="secondary" disabled aria-label="Enviar" icon={<PaperPlaneRight size={15} weight="fill" />} />
        </div>
      </div>
    </aside>
  )
}
