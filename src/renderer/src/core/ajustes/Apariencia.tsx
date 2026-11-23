import { Check, Monitor, Moon, Sun } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import { cx } from '../ui'
import { aplicarPreferencia, type PrefTema } from '../shell/theme'

/** Miniatura de la app en un tema concreto: el atributo data-theme anidado cambia todos los tokens */
function Mini({ tema }: { tema: 'dark' | 'light' }) {
  return (
    <div data-theme={tema} className="absolute inset-0 flex bg-canvas" aria-hidden>
      <div className="flex w-1/4 flex-col gap-1 border-r border-line bg-sidebar p-2">
        <span className="h-1 w-3/4 r-full bg-ink" />
        <span className="h-1 w-full r-full bg-interactive" />
        <span className="h-1 w-2/3 r-full bg-accent-mark" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <span className="h-1 w-1/3 r-full bg-ink-3" />
        <div className="flex flex-1 gap-1">
          <span className="flex-1 r-tag border border-line bg-card" />
          <span className="flex-1 r-tag border border-line bg-card" />
        </div>
      </div>
    </div>
  )
}

const OPCIONES: { id: PrefTema; texto: string; icono: (relleno: boolean) => ReactNode }[] = [
  { id: 'dark', texto: 'Oscuro', icono: (r) => <Moon size={20} weight={r ? 'fill' : 'regular'} aria-hidden /> },
  { id: 'light', texto: 'Claro', icono: (r) => <Sun size={20} weight={r ? 'fill' : 'regular'} aria-hidden /> },
  { id: 'system', texto: 'Sistema', icono: (r) => <Monitor size={20} weight={r ? 'fill' : 'regular'} aria-hidden /> }
]

/** Apariencia: Oscuro / Claro / Sistema en tarjetas compactas con vista previa. Radiogroup con flechas.
 *  Se guarda en `settings.theme` con el mismo handler de siempre y se aplica al instante. */
export function Apariencia() {
  const { cat } = useCatalog()
  const guardado = cat?.settings.theme
  const [elegido, setElegido] = useState<PrefTema | null>(null)
  const actual: PrefTema = elegido ?? guardado ?? 'dark'
  const save = useApiMutation('finanzas:settings.update', { success: 'Tema guardado' })
  const grupo = useRef<HTMLDivElement>(null)

  // Cuando los ajustes ya reflejan la elección, la elección local sobra
  useEffect(() => {
    if (elegido && guardado === elegido) setElegido(null)
  }, [guardado, elegido])

  const elegir = (v: PrefTema, enfocar?: number) => {
    if (v === actual) return
    setElegido(v)
    aplicarPreferencia(v)
    save.mutate([{ theme: v }], {
      onError: () => {
        setElegido(null)
        aplicarPreferencia(guardado ?? 'dark')
      }
    })
    if (enfocar !== undefined) grupo.current?.querySelectorAll<HTMLElement>('[role=radio]')[enfocar]?.focus()
  }
  const mover = (e: React.KeyboardEvent, i: number) => {
    const n = OPCIONES.length
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + n - 1) % n : -1
    if (j < 0) return
    e.preventDefault()
    elegir(OPCIONES[j].id, j)
  }

  return (
    <section aria-labelledby="apariencia-t" className="card">
      <h2 id="apariencia-t" className="t-section">
        Apariencia
      </h2>
      <p className="t-label mt-1">Elige cómo quieres ver la app. Se recuerda entre sesiones.</p>
      <div ref={grupo} role="radiogroup" aria-label="Tema" className="mt-6 grid grid-cols-3 gap-3">
        {OPCIONES.map((o, i) => {
          const activo = actual === o.id
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={activo}
              tabIndex={activo ? 0 : -1}
              onClick={() => elegir(o.id)}
              onKeyDown={(e) => mover(e, i)}
              className={cx('r-card border p-2 text-left transition-colors', activo ? 'border-ink bg-raised' : 'border-line-strong bg-card hover:bg-raised')}
              style={activo ? { boxShadow: 'inset 0 0 0 1px var(--ink)' } : undefined}
            >
              <span className="relative block h-16 overflow-hidden r-control border border-line">
                {o.id === 'system' ? (
                  <>
                    <Mini tema="dark" />
                    <span className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
                      <Mini tema="light" />
                    </span>
                  </>
                ) : (
                  <Mini tema={o.id} />
                )}
              </span>
              <span className="mt-2 flex items-center gap-2 px-1">
                <span className="text-ink-2">{o.icono(activo)}</span>
                <span className="t-body flex-1 font-semibold">{o.texto}</span>
                <span className={cx('grid size-6 place-items-center r-full border', activo ? 'border-transparent bg-primary text-on-primary' : 'border-control')}>{activo && <Check size={14} weight="bold" aria-hidden />}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
