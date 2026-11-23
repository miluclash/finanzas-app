import { CaretRight, MagnifyingGlass, Sparkle } from '@phosphor-icons/react'
import { IconButton } from '../ui'

/** Barra superior: migas discretas (no compiten con el título de la página), búsqueda y asistente */
export function Topbar({ migas, onBuscar, ia, onIa }: { migas: string[]; onBuscar: () => void; ia: boolean; onIa: () => void }) {
  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-line px-6" style={{ height: 'var(--topbar-h)' }}>
      <nav aria-label="Migas de pan" className="min-w-0 flex-1">
        <ol className="t-meta flex items-center gap-1">
          {migas.map((m, i) => (
            <li key={m} className="flex items-center gap-1">
              {i > 0 && <CaretRight size={12} aria-hidden />}
              <span aria-current={i === migas.length - 1 ? 'page' : undefined}>{m}</span>
            </li>
          ))}
        </ol>
      </nav>
      <button type="button" onClick={onBuscar} aria-label="Buscar o ir a… (Ctrl K)" className="input flex w-72 max-w-full items-center gap-2 text-left text-ink-3 hover:bg-interactive">
        <MagnifyingGlass size={16} aria-hidden />
        <span className="flex-1 truncate">Buscar o ir a…</span>
        <span className="flex items-center gap-1">
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span>
        </span>
      </button>
      <IconButton variant={ia ? 'secondary' : 'ghost'} aria-pressed={ia} etiqueta={ia ? 'Cerrar el asistente' : 'Abrir el asistente'} onClick={onIa} icono={<Sparkle size={20} weight={ia ? 'fill' : 'regular'} />} />
    </header>
  )
}
