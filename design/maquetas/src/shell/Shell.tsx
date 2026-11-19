import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AI_MAX, AI_MIN, AssistantPanel } from './AssistantPanel'
import { CommandPalette } from './CommandPalette'
import { MODULOS, type Ruta } from './nav'
import { NuevoMovimiento } from './NuevoMovimiento'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ANCHO_ESTRECHO, useViewportWidth } from './useViewport'
import { ToastProvider, useToast } from '../ui/feedback'

const params = new URLSearchParams(location.search)

function Demo() {
  const toast = useToast()
  useEffect(() => {
    if (params.get('toast') === '1') toast({ tono: 'success', texto: 'Movimiento guardado' })
  }, [toast])
  return null
}

/** AppShell: barra lateral, topbar, contenido con ancho máximo y reflow real (container queries) y panel del asistente */
export function Shell({ ruta, children, onTema }: { ruta: Ruta; children: ReactNode; onTema: () => void }) {
  const ancho = useViewportWidth()
  const estrecho = ancho < ANCHO_ESTRECHO
  const guardada = localStorage.getItem('maquetas-plegada')
  const [plegadaUsuario, setPlegadaUsuario] = useState<boolean | null>(params.get('plegada') === '1' ? true : params.get('plegada') === '0' ? false : guardada === null ? null : guardada === '1')
  const plegada = plegadaUsuario ?? estrecho
  const [ia, setIa] = useState(params.get('ia') === '1')
  const [anchoIa, setAnchoIa] = useState(Number(localStorage.getItem('maquetas-ia')) || 360)
  const [paleta, setPaleta] = useState(params.get('paleta') === '1')
  const [nuevo, setNuevo] = useState(!!params.get('nuevo'))
  const [abierto, setAbierto] = useState<Record<string, boolean>>({ finanzas: ruta.modulo === 'finanzas', entreno: ruta.modulo === 'entreno' })

  useEffect(() => {
    if (ruta.modulo === 'finanzas' || ruta.modulo === 'entreno') setAbierto((a) => ({ ...a, [ruta.modulo]: true }))
  }, [ruta.modulo])

  const abrirNuevo = useCallback(() => setNuevo(true), [])
  const alternarTema = onTema
  const alternarIa = useCallback(() => setIa((v) => !v), [])
  const cerrarPaleta = useCallback(() => setPaleta(false), [])
  const cerrarNuevo = useCallback(() => setNuevo(false), [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const escribiendo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setPlegadaUsuario(!plegada)
        localStorage.setItem('maquetas-plegada', plegada ? '0' : '1')
      } else if (!escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey && ruta.modulo === 'finanzas' && !document.querySelector('[aria-modal="true"]')) {
        if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 't') {
          e.preventDefault()
          setNuevo(true)
        }
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [ruta.modulo, plegada])

  const modulo = ruta.modulo === 'finanzas' || ruta.modulo === 'entreno' ? ruta.modulo : undefined
  const moduloTexto = modulo ? MODULOS.find((m) => m.id === modulo)!.texto : ruta.modulo === 'ajustes' ? 'Ajustes' : 'Inicio'
  const migas = modulo ? [moduloTexto, ruta.titulo] : [moduloTexto]
  const guardarAncho = (n: number) => (setAnchoIa(n), localStorage.setItem('maquetas-ia', String(n)))
  const superpuesto = estrecho

  return (
    <ToastProvider>
      <div className="flex h-full overflow-hidden bg-canvas text-ink">
        <a href="#contenido" className="skip btn btn-primary">
          Saltar al contenido
        </a>
        <Sidebar
          ruta={ruta}
          plegada={plegada}
          abierto={abierto}
          setAbierto={setAbierto}
          onPlegar={() => {
            setPlegadaUsuario(!plegada)
            localStorage.setItem('maquetas-plegada', plegada ? '0' : '1')
          }}
          onNuevo={abrirNuevo}
        />
        <div className="flex min-w-0 flex-1 flex-col bg-canvas" data-module={modulo}>
          <Topbar migas={migas} onBuscar={() => setPaleta(true)} ia={ia} onIa={alternarIa} />
          <main id="contenido" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <div key={ruta.pantalla + ruta.seccion} className="page-enter mx-auto w-full px-8 pb-12 pt-8" style={{ maxWidth: 'var(--content-max)' }}>
              <div className="@container w-full">{children}</div>
            </div>
          </main>
        </div>
        {ia && <AssistantPanel ancho={Math.min(AI_MAX, Math.max(AI_MIN, anchoIa))} onAncho={guardarAncho} onCerrar={() => setIa(false)} superpuesto={superpuesto} />}
        {paleta && <CommandPalette ruta={ruta} onCerrar={cerrarPaleta} onTema={alternarTema} onIa={alternarIa} onNuevo={abrirNuevo} />}
        {nuevo && <NuevoMovimiento onCerrar={cerrarNuevo} demo={params.get('nuevo') && params.get('nuevo') !== '1' ? params.get('nuevo')! : undefined} />}
        <Demo />
      </div>
    </ToastProvider>
  )
}
