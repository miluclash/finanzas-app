import { ArrowRight, ArrowsLeftRight, Barbell, GearSix, House, MagnifyingGlass, Moon, Plus, Sparkle, UploadSimple, type Icon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cx, useFocusScope } from '../ui'
import { MODULOS, SECCIONES } from './nav'

type Item = { id: string; grupo: 'Acciones' | 'Pantallas'; texto: string; detalle?: string; icono: Icon; atajo?: string; accion: () => void }
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

export type AccionesShell = {
  nuevoMovimiento: () => void
  transferencia: () => void
  cambiarTema: () => void
  importarHevy: () => void
  alternarAsistente: () => void
}

/** Buscador de comandos (Ctrl K): resultados agrupados en Acciones y Pantallas, elemento activo muy visible y atajos visibles */
export function CommandPalette({ onCerrar, acciones }: { onCerrar: () => void; acciones: AccionesShell }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useFocusScope(caja, inputRef)
  const items = useMemo<Item[]>(() => {
    const ir = (ruta: string) => () => navigate(ruta)
    const lista: Item[] = [
      { id: 'nuevo', grupo: 'Acciones', texto: 'Nuevo movimiento', icono: Plus, atajo: 'N', accion: acciones.nuevoMovimiento },
      { id: 'transf', grupo: 'Acciones', texto: 'Nueva transferencia', icono: ArrowsLeftRight, atajo: 'T', accion: acciones.transferencia },
      { id: 'importar-hevy', grupo: 'Acciones', texto: 'Importar de Hevy', detalle: 'Entreno', icono: UploadSimple, accion: acciones.importarHevy },
      { id: 'nueva-sesion', grupo: 'Acciones', texto: 'Nueva sesión', detalle: 'Entreno', icono: Barbell, accion: ir('/entreno/sesiones/nueva') },
      { id: 'tema', grupo: 'Acciones', texto: 'Cambiar entre tema oscuro y claro', icono: Moon, accion: acciones.cambiarTema },
      { id: 'ia', grupo: 'Acciones', texto: 'Abrir o cerrar el asistente', icono: Sparkle, accion: acciones.alternarAsistente },
      { id: 'inicio', grupo: 'Pantallas', texto: 'Inicio', detalle: 'Hoy', icono: House, accion: ir('/') },
      ...SECCIONES.finanzas.map((s) => ({ id: `finanzas-${s.id}`, grupo: 'Pantallas' as const, texto: s.texto, detalle: 'Finanzas', icono: s.icono, accion: ir(s.ruta) })),
      { id: 'entreno', grupo: 'Pantallas', texto: 'Entreno', detalle: 'Resumen', icono: MODULOS[2].icono, accion: ir('/entreno') },
      ...SECCIONES.entreno.filter((s) => s.id !== 'resumen' && !s.proximamente).map((s) => ({ id: `entreno-${s.id}`, grupo: 'Pantallas' as const, texto: s.texto, detalle: 'Entreno', icono: s.icono, accion: ir(s.ruta) })),
      { id: 'ajustes', grupo: 'Pantallas', texto: 'Ajustes', detalle: 'Tema, datos y copias', icono: GearSix, accion: ir('/ajustes') }
    ]
    return lista
  }, [acciones, navigate])
  const filtrados = useMemo(() => items.filter((i) => norm(`${i.texto} ${i.detalle ?? ''}`).includes(norm(q.trim()))), [items, q])
  const grupos = (['Acciones', 'Pantallas'] as const).map((g) => ({ g, lista: filtrados.filter((i) => i.grupo === g) })).filter((x) => x.lista.length)
  const ordenados = grupos.flatMap((x) => x.lista)
  useEffect(() => setSel(0), [q])
  const ejecutar = (i?: Item) => {
    if (!i) return
    onCerrar()
    i.accion()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24" role="presentation">
      <div className="fade-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onCerrar} aria-hidden />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label="Buscador de comandos"
        className="elevated pop-in r-modal relative w-full max-w-xl overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCerrar()
          else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, ordenados.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)))
          else if (e.key === 'Enter') (e.preventDefault(), ejecutar(ordenados[sel]))
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-6">
          <MagnifyingGlass size={20} className="text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Escribe una pantalla o una acción"
            className="h-14 flex-1 bg-transparent shadow-none outline-none placeholder:text-ink-3"
            role="combobox"
            aria-expanded
            aria-controls="paleta-lista"
            aria-activedescendant={ordenados[sel] ? `p-${ordenados[sel].id}` : undefined}
            aria-label="Buscar"
          />
          <span className="kbd">Esc</span>
        </div>
        <div id="paleta-lista" role="listbox" aria-label="Resultados" className="max-h-96 overflow-y-auto p-2">
          {grupos.length === 0 && <p className="t-label px-4 py-10 text-center">Nada coincide con «{q}».</p>}
          {grupos.map(({ g, lista }) => (
            <div key={g} role="group" aria-label={g} className="mb-2">
              <div className="t-meta px-3 pb-1 pt-2 font-semibold">{g}</div>
              {lista.map((i) => {
                const idx = ordenados.indexOf(i)
                const activo = idx === sel
                return (
                  <div
                    key={i.id}
                    id={`p-${i.id}`}
                    role="option"
                    aria-selected={activo}
                    onMouseMove={() => setSel(idx)}
                    onClick={() => ejecutar(i)}
                    className={cx('relative flex h-10 cursor-pointer items-center gap-3 r-control px-3', activo ? 'bg-interactive text-ink' : 'text-ink-2')}
                  >
                    {activo && <span className="absolute inset-y-2 left-0 rounded-full bg-accent-mark" style={{ width: 'var(--mark-bar)' }} aria-hidden />}
                    <i.icono size={20} weight={activo ? 'fill' : 'regular'} aria-hidden />
                    <span className={activo ? 'font-semibold' : 'font-medium'}>{i.texto}</span>
                    {i.detalle && <span className="t-meta">{i.detalle}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {i.atajo && <span className="kbd">{i.atajo}</span>}
                      {activo && <ArrowRight size={16} className="text-ink-3" aria-hidden />}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="t-meta flex items-center gap-4 border-t border-line px-6 py-3">
          <span className="flex items-center gap-2">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> moverse
          </span>
          <span className="flex items-center gap-2">
            <span className="kbd">Intro</span> abrir
          </span>
          <span className="ml-auto">Ctrl K abre y cierra</span>
        </div>
      </div>
    </div>
  )
}
