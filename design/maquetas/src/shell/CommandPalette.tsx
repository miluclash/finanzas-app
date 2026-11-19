import { ArrowRight, ArrowsLeftRight, GearSix, House, MagnifyingGlass, Moon, Palette, Plus, Sparkle, type Icon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../lib'
import { MODULOS, SECCIONES, type Ruta } from './nav'

type Item = { id: string; grupo: 'Ir a' | 'Acciones'; texto: string; detalle?: string; icono: Icon; atajo?: string; accion: () => void }

/** Buscador de comandos (Ctrl+K): navegación y acciones. Teclado completo: flechas, Intro y Esc. */
export function CommandPalette({ ruta, onCerrar, onTema, onIa, onNuevo }: { ruta: Ruta; onCerrar: () => void; onTema: () => void; onIa: () => void; onNuevo: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = useMemo<Item[]>(() => {
    const ir = (hash: string) => () => {
      location.hash = hash
    }
    const nav: Item[] = [
      { id: 'inicio', grupo: 'Ir a', texto: 'Inicio', detalle: 'Panel de vida', icono: House, accion: ir('#/inicio') },
      ...(['finanzas', 'entreno'] as const).flatMap((m) =>
        SECCIONES[m].map((s) => ({ id: `${m}-${s.id}`, grupo: 'Ir a' as const, texto: s.texto, detalle: MODULOS.find((x) => x.id === m)!.texto, icono: s.icono, accion: ir(s.hash) }))
      ),
      { id: 'ajustes', grupo: 'Ir a', texto: 'Ajustes', detalle: 'Tema, datos y copias', icono: GearSix, accion: ir('#/ajustes') },
      { id: 'sistema', grupo: 'Ir a', texto: 'Sistema de diseño', detalle: 'Hoja de referencia', icono: Palette, accion: ir('#/sistema') }
    ]
    const acciones: Item[] = [
      ...(ruta.modulo === 'finanzas'
        ? [
            { id: 'nuevo', grupo: 'Acciones' as const, texto: 'Nuevo movimiento', icono: Plus, atajo: 'N', accion: onNuevo },
            { id: 'transf', grupo: 'Acciones' as const, texto: 'Nueva transferencia', icono: ArrowsLeftRight, atajo: 'T', accion: onNuevo }
          ]
        : []),
      { id: 'tema', grupo: 'Acciones', texto: 'Cambiar de tema oscuro a claro', icono: Moon, accion: onTema },
      { id: 'ia', grupo: 'Acciones', texto: 'Abrir o cerrar el asistente', icono: Sparkle, accion: onIa }
    ]
    return [...acciones, ...nav]
  }, [ruta.modulo, onNuevo, onTema, onIa])
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const filtrados = useMemo(() => items.filter((i) => norm(`${i.texto} ${i.detalle ?? ''}`).includes(norm(q.trim()))), [items, q])

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setSel(0), [q])

  const ejecutar = (i?: Item) => {
    if (!i) return
    onCerrar()
    i.accion()
  }
  const grupos = (['Acciones', 'Ir a'] as const).map((g) => ({ g, lista: filtrados.filter((i) => i.grupo === g) })).filter((x) => x.lista.length)

  const ordenados = grupos.flatMap((x) => x.lista)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" role="presentation">
      <div className="fade-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onCerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscador de comandos"
        className="pop-in material relative w-[600px] max-w-[92vw] overflow-hidden rounded-[var(--radius-xl)] border border-line-strong shadow-[var(--shadow-3)]"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCerrar()
          else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((s) => Math.min(s + 1, filtrados.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((s) => Math.max(s - 1, 0))
          } else if (e.key === 'Enter') ejecutar(ordenados[sel])
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <MagnifyingGlass size={20} className="text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Escribe para buscar una pantalla o una acción"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            role="combobox"
            aria-expanded
            aria-controls="paleta-lista"
            aria-activedescendant={ordenados[sel] ? `p-${ordenados[sel].id}` : undefined}
            aria-label="Buscar"
          />
          <span className="kbd">Esc</span>
        </div>
        <div id="paleta-lista" role="listbox" aria-label="Resultados" className="max-h-[400px] overflow-y-auto p-2">
          {grupos.length === 0 && <p className="px-4 py-10 text-center text-[length:var(--fs-small)] text-ink-3">Nada coincide con «{q}».</p>}
          {grupos.map(({ g, lista }) => (
            <div key={g} role="group" aria-label={g} className="mb-1">
              <div className="t-label px-3 pb-1 pt-2">{g}</div>
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
                    className={cx('flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 text-[length:var(--fs-body)]', activo ? 'bg-surface-3 text-ink' : 'text-ink-2')}
                  >
                    <i.icono size={18} weight={activo ? 'fill' : 'regular'} className={activo ? 'text-accent-text' : ''} aria-hidden />
                    <span className="font-[520]">{i.texto}</span>
                    {i.detalle && <span className="text-[length:var(--fs-small)] text-ink-3">{i.detalle}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {i.atajo && <span className="kbd">{i.atajo}</span>}
                      {activo && <ArrowRight size={14} className="text-ink-3" aria-hidden />}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[length:var(--fs-label)] text-ink-3">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> moverse</span>
          <span className="flex items-center gap-1.5"><span className="kbd">Intro</span> abrir</span>
          <span className="ml-auto">Ctrl K para abrir o cerrar</span>
        </div>
      </div>
    </div>
  )
}
