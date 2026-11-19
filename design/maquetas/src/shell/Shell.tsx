import { CaretDown, CaretRight, GearSix, MagnifyingGlass, Plus, Sparkle, SidebarSimple } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../lib'
import { Button } from '../ui/basics'
import { AiPanel } from './AiPanel'
import { CommandPalette } from './CommandPalette'
import { MODULOS, SECCIONES, type Ruta } from './nav'
import { NuevoMovimiento } from './NuevoMovimiento'

const params = new URLSearchParams(location.search)

export function Shell({ ruta, children, onTema }: { ruta: Ruta; children: ReactNode; onTema: () => void }) {
  const [plegada, setPlegada] = useState(params.get('plegada') === '1' || localStorage.getItem('maquetas-plegada') === '1')
  const [ia, setIa] = useState(params.get('ia') === '1')
  const [paleta, setPaleta] = useState(params.get('paleta') === '1')
  const [nuevo, setNuevo] = useState(params.get('nuevo') === '1')
  const [abierto, setAbierto] = useState<Record<string, boolean>>({ finanzas: ruta.modulo === 'finanzas', entreno: ruta.modulo === 'entreno' })

  // Al cambiar de módulo se abre su grupo
  useEffect(() => {
    if (ruta.modulo === 'finanzas' || ruta.modulo === 'entreno') setAbierto((a) => ({ ...a, [ruta.modulo]: true }))
  }, [ruta.modulo])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const escribiendo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setPlegada((v) => !v)
      } else if (!escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && ruta.modulo === 'finanzas') {
        e.preventDefault()
        setNuevo(true)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [ruta.modulo])

  const alternarPlegada = () =>
    setPlegada((v) => {
      localStorage.setItem('maquetas-plegada', v ? '0' : '1')
      return !v
    })
  const modulo = ruta.modulo === 'finanzas' || ruta.modulo === 'entreno' ? ruta.modulo : undefined
  const moduloTexto = modulo ? MODULOS.find((m) => m.id === modulo)!.texto : ruta.modulo === 'ajustes' ? 'Ajustes' : ruta.modulo === 'sistema' ? 'Sistema' : 'Inicio'

  return (
    <div className="flex h-full overflow-hidden bg-bg text-ink">
      <a href="#contenido" className="skip btn btn-primary">
        Saltar al contenido
      </a>
      <Sidebar ruta={ruta} plegada={plegada} abierto={abierto} setAbierto={setAbierto} onPlegar={alternarPlegada} onNuevo={() => setNuevo(true)} />

      <div className="flex min-w-0 flex-1 flex-col bg-bg" data-module={modulo}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-6">
          <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-[length:var(--fs-small)]">
            <span className="text-ink-3">{moduloTexto}</span>
            {modulo && (
              <>
                <CaretRight size={12} className="text-ink-3" aria-hidden />
                <span className="font-[560] text-ink">{ruta.titulo}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaleta(true)}
              className="group flex h-9 w-[300px] items-center gap-2.5 rounded-[var(--radius-sm)] border border-control bg-surface-1 px-3 text-left text-[length:var(--fs-small)] text-ink-3 transition-colors hover:bg-surface-2"
              aria-label="Buscar o ir a… (Ctrl K)"
            >
              <MagnifyingGlass size={16} aria-hidden />
              <span className="flex-1">Buscar o ir a…</span>
              <span className="flex items-center gap-1">
                <span className="kbd">Ctrl</span>
                <span className="kbd">K</span>
              </span>
            </button>
            <Button variant={ia ? 'secondary' : 'ghost'} aria-pressed={ia} aria-label={ia ? 'Cerrar el asistente' : 'Abrir el asistente'} title="Asistente" onClick={() => setIa((v) => !v)} icon={<Sparkle size={18} weight={ia ? 'fill' : 'regular'} />} />
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          <div key={ruta.pantalla + ruta.seccion} className="page-enter mx-auto w-full max-w-[1240px] px-8 pb-12 pt-7">
            {children}
          </div>
        </main>
      </div>

      {ia && <AiPanel onCerrar={() => setIa(false)} />}
      {paleta && <CommandPalette ruta={ruta} onCerrar={() => setPaleta(false)} onTema={onTema} onIa={() => setIa((v) => !v)} onNuevo={() => setNuevo(true)} />}
      {nuevo && <NuevoMovimiento onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function Sidebar({
  ruta,
  plegada,
  abierto,
  setAbierto,
  onPlegar,
  onNuevo
}: {
  ruta: Ruta
  plegada: boolean
  abierto: Record<string, boolean>
  setAbierto: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void
  onPlegar: () => void
  onNuevo: () => void
}) {
  const inicio = MODULOS[0]
  return (
    <aside
      aria-label="Barra lateral"
      className="flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]"
      style={{ width: plegada ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
    >
      <div className={cx('flex h-14 shrink-0 items-center', plegada ? 'justify-center' : 'justify-between pl-5 pr-3')}>
        {!plegada && (
          <div className="min-w-0">
            <div className="text-[17px] font-[650] leading-tight tracking-[-0.02em]">Finanzas</div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onPlegar} aria-label={plegada ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'} title="Plegar (Ctrl B)" icon={<SidebarSimple size={18} />} />
      </div>

      {ruta.modulo === 'finanzas' && (
        <div className={cx('pb-2 pt-1', plegada ? 'px-3' : 'px-3')} data-module="finanzas">
          {plegada ? (
            <Button variant="primary" className="w-full" aria-label="Nuevo movimiento (N)" title="Nuevo movimiento (N)" onClick={onNuevo} icon={<Plus size={18} weight="bold" />} />
          ) : (
            <Button variant="primary" className="w-full justify-between" onClick={onNuevo}>
              <span className="flex items-center gap-2">
                <Plus size={16} weight="bold" aria-hidden /> Nuevo movimiento
              </span>
              <span className="kbd">N</span>
            </Button>
          )}
        </div>
      )}

      <nav aria-label="Secciones" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        <NavItem plegada={plegada} activo={ruta.modulo === 'inicio'} icono={<inicio.icono size={20} weight={ruta.modulo === 'inicio' ? 'fill' : 'regular'} />} texto="Inicio" hash={inicio.hash} />

        {(['finanzas', 'entreno'] as const).map((m) => {
          const def = MODULOS.find((x) => x.id === m)!
          const activoModulo = ruta.modulo === m
          const abiertoGrupo = !plegada && abierto[m]
          return (
            <div key={m} data-module={m} className="mt-1.5">
              {plegada ? (
                <NavItem plegada activo={activoModulo} icono={<def.icono size={20} weight={activoModulo ? 'duotone' : 'regular'} />} texto={def.texto} hash={def.hash} moduloIcon />
              ) : (
                <button
                  type="button"
                  aria-expanded={abiertoGrupo}
                  onClick={() => setAbierto((a) => ({ ...a, [m]: !a[m] }))}
                  className="group flex h-9 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-left text-[length:var(--fs-small)] font-[600] text-ink transition-colors hover:bg-surface-3"
                >
                  <def.icono size={20} weight={activoModulo ? 'duotone' : 'regular'} className={activoModulo ? 'text-accent-text' : 'text-ink-2'} aria-hidden />
                  <span className="flex-1">{def.texto}</span>
                  {abiertoGrupo ? <CaretDown size={13} className="text-ink-3" aria-hidden /> : <CaretRight size={13} className="text-ink-3" aria-hidden />}
                </button>
              )}
              {abiertoGrupo && (
                <ul className="ml-[19px] mt-0.5 flex flex-col gap-px border-l border-line pl-2">
                  {SECCIONES[m].map((s) => {
                    const activo = activoModulo && ruta.seccion === s.id
                    return (
                      <li key={s.id}>
                        <a
                          href={s.hash}
                          aria-current={activo ? 'page' : undefined}
                          className={cx(
                            'flex h-8 items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-[length:var(--fs-small)] transition-colors',
                            activo ? 'bg-surface-3 font-[600] text-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
                          )}
                        >
                          <s.icono size={17} weight={activo ? 'fill' : 'regular'} className={activo ? 'text-accent-text' : ''} aria-hidden />
                          <span className="truncate">{s.texto}</span>
                          {m === 'finanzas' && s.id === 'movimientos' && <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-warn-soft px-1 text-[10.5px] font-[650] text-warn" title="Movimientos por revisar">2</span>}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line px-3 py-3">
        <NavItem plegada={plegada} activo={ruta.modulo === 'ajustes'} icono={<GearSix size={20} weight={ruta.modulo === 'ajustes' ? 'fill' : 'regular'} />} texto="Ajustes" hash="#/ajustes" />
        {!plegada && (
          <div className="flex items-center gap-2 px-2.5 pt-1 text-[length:var(--fs-label)] text-ink-3">
            <span className="size-1.5 rounded-full bg-pos" aria-hidden />
            Versión 0.6 · al día
          </div>
        )}
      </div>
    </aside>
  )
}

function NavItem({ plegada, activo, icono, texto, hash, moduloIcon }: { plegada: boolean; activo: boolean; icono: ReactNode; texto: string; hash: string; moduloIcon?: boolean }) {
  return (
    <a
      href={hash}
      title={plegada ? texto : undefined}
      aria-label={plegada ? texto : undefined}
      aria-current={activo ? 'page' : undefined}
      className={cx(
        'flex h-9 items-center rounded-[var(--radius-sm)] text-[length:var(--fs-small)] transition-colors',
        plegada ? 'justify-center' : 'gap-2.5 px-2.5',
        activo ? 'bg-surface-3 font-[600] text-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
        activo && moduloIcon && 'text-accent-text'
      )}
    >
      <span className={activo ? 'text-ink' : ''} style={activo && !moduloIcon ? undefined : undefined}>
        {icono}
      </span>
      {!plegada && <span>{texto}</span>}
    </a>
  )
}

