import { useEffect, useState } from 'react'

/** Ancho lógico de la ventana: con el escalado de Windows al 125 o 150 % baja en proporción */
export function useViewportWidth() {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return w
}
/** Por debajo de este ancho la barra lateral se pliega y el asistente se abre por encima del contenido */
export const ANCHO_ESTRECHO = 1100
