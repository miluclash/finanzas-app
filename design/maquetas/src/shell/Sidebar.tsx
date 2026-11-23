import { CaretDown, CaretRight, GearSix, Plus, SidebarSimple } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cx } from '../lib'
import { Button, IconButton } from '../ui/controls'
import { Tooltip } from '../ui/feedback'
import { MODULOS, SECCIONES, type Ruta } from './nav'

const forzado = new URLSearchParams(location.search).get('tooltip')

function Item({ plegada, activo, icono, texto, hash, id, sub, extra }: { plegada: boolean; activo: boolean; icono: ReactNode; texto: string; hash: string; id: string; sub?: boolean; extra?: ReactNode }) {
  const enlace = (
    <a href={hash} aria-current={activo ? 'page' : undefined} aria-label={plegada ? texto : undefined} className={cx('nav-item', sub && 'nav-item-sub')}>
      {icono}
      {!plegada && <span className="truncate">{texto}</span>}
      {!plegada && extra}
    </a>
  )
  return plegada ? (
    <Tooltip texto={texto} lado="right" abierto={forzado === id ? true : undefined}>
      {enlace}
    </Tooltip>
  ) : (
    enlace
  )
}

/** Sidebar expandida o plegada. Plegada: tooltip en cada icono y acceso a Nuevo movimiento, Inicio, Finanzas, Entreno y Ajustes. Activo: fondo + indicador */
export function Sidebar({ ruta, plegada, abierto, setAbierto, onPlegar, onNuevo }: { ruta: Ruta; plegada: boolean; abierto: Record<string, boolean>; setAbierto: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void; onPlegar: () => void; onNuevo: () => void }) {
  const inicio = MODULOS[0]
  return (
    <aside aria-label="Barra lateral" className={cx('flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]', plegada && 'nav-collapsed')} style={{ width: plegada ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}>
      <div className={cx('flex shrink-0 items-center', plegada ? 'flex-col gap-2 py-3' : 'h-14 justify-between pl-6 pr-3')}>
        {!plegada && <div className="t-section">Finanzas</div>}
        <Tooltip texto={plegada ? 'Desplegar barra (Ctrl B)' : 'Plegar barra (Ctrl B)'} lado={plegada ? 'right' : 'bottom'}>
          <IconButton variant="ghost" size="sm" etiqueta={plegada ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'} onClick={onPlegar} icono={<SidebarSimple size={20} />} />
        </Tooltip>
      </div>

      {ruta.modulo === 'finanzas' && (
        <div className="px-3 pb-3 pt-1">
          {plegada ? (
            <Tooltip texto="Nuevo movimiento (N)" lado="right" abierto={forzado === 'nuevo' ? true : undefined}>
              <IconButton variant="primary" className="w-full" etiqueta="Nuevo movimiento (N)" onClick={onNuevo} icono={<Plus size={20} weight="bold" />} />
            </Tooltip>
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
        <Item id="inicio" plegada={plegada} activo={ruta.modulo === 'inicio'} icono={<inicio.icono size={20} weight={ruta.modulo === 'inicio' ? 'fill' : 'regular'} aria-hidden />} texto="Inicio" hash={inicio.hash} />
        {(['finanzas', 'entreno'] as const).map((m) => {
          const def = MODULOS.find((x) => x.id === m)!
          const activoModulo = ruta.modulo === m
          const abiertoGrupo = !plegada && abierto[m]
          const icono = <def.icono size={20} weight={activoModulo ? 'fill' : 'regular'} aria-hidden />
          return (
            <div key={m} data-module={m} className="mt-2">
              {plegada ? (
                <Item id={m} plegada activo={activoModulo} icono={icono} texto={def.texto} hash={def.hash} />
              ) : (
                <button type="button" aria-expanded={abiertoGrupo} onClick={() => setAbierto((a) => ({ ...a, [m]: !a[m] }))} className="nav-item w-full text-left font-semibold !text-ink">
                  {icono}
                  <span className="flex-1">{def.texto}</span>
                  {abiertoGrupo ? <CaretDown size={14} className="text-ink-3" aria-hidden /> : <CaretRight size={14} className="text-ink-3" aria-hidden />}
                </button>
              )}
              {abiertoGrupo && (
                <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-line pl-2">
                  {SECCIONES[m].map((s) => {
                    const activo = activoModulo && ruta.seccion === s.id
                    return (
                      <li key={s.id}>
                        <Item id={`${m}-${s.id}`} sub plegada={false} activo={activo} icono={<s.icono size={18} weight={activo ? 'fill' : 'regular'} className={activo ? 'text-accent-text' : undefined} aria-hidden />} texto={s.texto} hash={s.hash} extra={m === 'finanzas' && s.id === 'movimientos' ? <span className="count count-warning ml-auto tnum" aria-label="2 movimientos por revisar">2</span> : undefined} />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-line px-3 py-3">
        <Item id="ajustes" plegada={plegada} activo={ruta.modulo === 'ajustes'} icono={<GearSix size={20} weight={ruta.modulo === 'ajustes' ? 'fill' : 'regular'} aria-hidden />} texto="Ajustes" hash="#/ajustes" />
        <p className={cx('t-meta tnum', plegada ? 'text-center' : 'px-3')} title={`Versión ${__APP_VERSION__}`}>
          {plegada ? `v${__APP_VERSION__}` : `Versión ${__APP_VERSION__}`}
        </p>
      </div>
    </aside>
  )
}
