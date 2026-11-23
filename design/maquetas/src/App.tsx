import { useCallback, useEffect, useState } from 'react'
import { leerRuta } from './shell/nav'
import { Shell } from './shell/Shell'
import { Ajustes } from './pantallas/Ajustes'
import { Entreno } from './pantallas/Entreno'
import { Finanzas } from './pantallas/Finanzas'
import { Inicio } from './pantallas/Inicio'
import { Movimientos } from './pantallas/Movimientos'
import { Pendiente } from './pantallas/Pendiente'
import { ToastProvider } from './ui/feedback'
import { Sistema } from './pantallas/Sistema'
import { aplicarTema, leerTema, type PrefTema } from './tema'

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const fn = () => setH(location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return h
}

export function App() {
  const ruta = leerRuta(useHash())
  const [pref, setPref] = useState<PrefTema>(leerTema)

  // Aplica y recuerda el tema; en "Sistema" sigue al del equipo
  useEffect(() => {
    aplicarTema(pref)
    if (pref !== 'sistema') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const fn = () => aplicarTema('sistema')
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [pref])

  const alternar = useCallback(() => setPref((p) => (document.documentElement.dataset.theme === 'dark' || p === 'dark' ? 'light' : 'dark')), [])

  const pantalla = {
    inicio: <Inicio />,
    finanzas: <Finanzas />,
    movimientos: <Movimientos />,
    entreno: <Entreno />,
    ajustes: <Ajustes pref={pref} onPref={setPref} />,
    sistema: <Sistema seccion={ruta.seccion} />,
    pendiente: <Pendiente ruta={ruta} />
  }[ruta.pantalla]

  // La hoja del sistema se ve sin el shell
  if (ruta.pantalla === 'sistema')
    return (
      <ToastProvider>
        <div className="h-full overflow-y-auto bg-canvas text-ink" id="contenido">
          {pantalla}
        </div>
      </ToastProvider>
    )
  return (
    <Shell ruta={ruta} onTema={alternar}>
      {pantalla}
    </Shell>
  )
}
