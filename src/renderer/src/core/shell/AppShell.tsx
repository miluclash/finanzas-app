import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AI_MAX, AI_MIN, AssistantPanel } from './AssistantPanel'
import { CommandPalette, type AccionesShell } from './CommandPalette'
import { moduloDe, MODULOS, type Ruta } from './nav'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { hayDialogoModal } from '../ui'
import { ANCHO_ESTRECHO, guardarLocal, leerLocal, useViewportWidth } from './useViewport'

const CLAVE_PLEGADA = 'finanzas-barra-plegada'
const CLAVE_ASISTENTE = 'finanzas-asistente-ancho'

/** AppShell: barra lateral, barra superior, contenido con ancho máximo y reflow real (container queries) y panel del asistente.
 *  No conoce los datos: quien lo monta le pasa lo que muestra y lo que hacen las acciones. */
export function AppShell({
  ruta,
  children,
  porRevisar,
  acciones,
  pie
}: {
  ruta: Ruta
  children: ReactNode
  porRevisar: number
  acciones: Pick<AccionesShell, 'nuevoMovimiento' | 'transferencia' | 'cambiarTema'>
  pie: (plegada: boolean) => ReactNode
}) {
  const ancho = useViewportWidth()
  const estrecho = ancho < ANCHO_ESTRECHO
  const guardada = leerLocal(CLAVE_PLEGADA)
  // null = sin elección del usuario: se pliega sola en ventanas estrechas
  const [plegadaUsuario, setPlegadaUsuario] = useState<boolean | null>(guardada === null ? null : guardada === '1')
  const plegada = plegadaUsuario ?? estrecho
  const [ia, setIa] = useState(false)
  const [anchoIa, setAnchoIa] = useState(Number(leerLocal(CLAVE_ASISTENTE)) || 360)
  const [paleta, setPaleta] = useState(false)
  const [abierto, setAbierto] = useState<Record<string, boolean>>({ finanzas: ruta.modulo === 'finanzas', entreno: ruta.modulo === 'entreno' })

  // Al entrar en un módulo, su grupo se despliega
  useEffect(() => {
    const m = moduloDe(ruta)
    if (m) setAbierto((a) => ({ ...a, [m]: true }))
  }, [ruta])

  const alternarPlegada = useCallback(() => {
    setPlegadaUsuario(!plegada)
    guardarLocal(CLAVE_PLEGADA, plegada ? '0' : '1')
  }, [plegada])
  const alternarIa = useCallback(() => setIa((v) => !v), [])
  const cerrarPaleta = useCallback(() => setPaleta(false), [])
  const guardarAncho = useCallback((n: number) => {
    setAnchoIa(n)
    guardarLocal(CLAVE_ASISTENTE, String(n))
  }, [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      // Un diálogo modal abierto queda por encima de todo: no se abre nada detrás (salvo cerrar el propio buscador con Ctrl+K)
      const esK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (hayDialogoModal() && !(esK && paleta)) return
      if (esK) {
        e.preventDefault()
        setPaleta((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        alternarPlegada()
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [alternarPlegada, paleta])

  const accionesPaleta = useMemo<AccionesShell>(() => ({ ...acciones, alternarAsistente: alternarIa }), [acciones, alternarIa])

  const modulo = moduloDe(ruta)
  const nombreModulo = modulo ? MODULOS.find((m) => m.id === modulo)!.texto : ruta.modulo === 'ajustes' ? 'Ajustes' : 'Inicio'
  const migas = modulo ? [nombreModulo, ruta.titulo] : [nombreModulo]

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-ink">
      <a href="#contenido" onClick={(e) => (e.preventDefault(), document.getElementById('contenido')?.focus())} className="skip btn btn-primary">
        Saltar al contenido
      </a>
      <Sidebar ruta={ruta} plegada={plegada} abierto={abierto} setAbierto={setAbierto} onPlegar={alternarPlegada} onNuevo={acciones.nuevoMovimiento} porRevisar={porRevisar} pie={pie} />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas" data-module={modulo}>
        <Topbar migas={migas} onBuscar={() => setPaleta(true)} ia={ia} onIa={alternarIa} />
        <main id="contenido" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          <div key={ruta.modulo + ruta.seccion} className="page-enter mx-auto w-full px-8 pb-12 pt-8" style={{ maxWidth: 'var(--content-max)' }}>
            <div className="@container w-full">{children}</div>
          </div>
        </main>
      </div>
      {ia && <AssistantPanel ancho={Math.min(AI_MAX, Math.max(AI_MIN, anchoIa))} onAncho={guardarAncho} onCerrar={() => setIa(false)} superpuesto={estrecho} />}
      {paleta && <CommandPalette onCerrar={cerrarPaleta} acciones={accionesPaleta} />}
    </div>
  )
}
