import { Moon, Sun } from '@phosphor-icons/react'
import { cx } from '../lib'
import { SegmentedControl } from '../ui/controls'
import { Componentes } from '../sistema/Componentes'
import { Estructura } from '../sistema/Estructura'
import { useTemaAttr } from '../sistema/ficha'
import { Fundamentos } from '../sistema/Fundamentos'
import { GraficosSistema } from '../sistema/GraficosSistema'

const PAGINAS = [
  ['fundamentos', 'Fundamentos', '#/sistema'],
  ['componentes', 'Componentes', '#/sistema/componentes'],
  ['estructura', 'Estructura', '#/sistema/estructura'],
  ['graficos', 'Gráficos', '#/sistema/graficos']
] as const

/** Hoja del sistema de diseño en cuatro páginas. Va sin el shell para verla entera */
export function Sistema({ seccion }: { seccion: string }) {
  const tema = useTemaAttr()
  const cambiar = (t: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('maquetas-tema', t)
  }
  const actual = PAGINAS.find(([id]) => id === seccion)?.[0] ?? 'fundamentos'
  return (
    <div>
      <header className="sticky top-0 border-b border-line bg-canvas px-8 py-4" style={{ zIndex: 'var(--z-sticky)' }}>
        <div className="mx-auto flex flex-wrap items-center gap-x-6 gap-y-3" style={{ maxWidth: 'var(--content-max)' }}>
          <div>
            <h1 className="t-page whitespace-nowrap">Sistema de diseño</h1>
            <p className="t-meta whitespace-nowrap">Finanzas · tokens.css</p>
          </div>
          <nav aria-label="Páginas de la hoja" className="flex flex-wrap gap-1">
            {PAGINAS.map(([id, t, h]) => (
              <a key={id} href={h} aria-current={actual === id ? 'page' : undefined} className={cx('nav-item nav-item-sub nav-item-tab')}>
                {t}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl label="Tema" value={(tema as 'dark' | 'light') ?? 'dark'} onChange={cambiar} opciones={[{ id: 'dark', texto: 'Oscuro', icono: <Moon size={16} aria-hidden /> }, { id: 'light', texto: 'Claro', icono: <Sun size={16} aria-hidden /> }]} />
            <a className="btn btn-secondary" href="#/inicio">
              Ir a Inicio
            </a>
          </div>
        </div>
      </header>
      <div className="mx-auto px-8 pb-24 pt-10" style={{ maxWidth: 'var(--content-max)' }}>
        <div className="@container">
          {actual === 'fundamentos' && <Fundamentos />}
          {actual === 'componentes' && <Componentes />}
          {actual === 'estructura' && <Estructura />}
          {actual === 'graficos' && <GraficosSistema />}
        </div>
      </div>
    </div>
  )
}
