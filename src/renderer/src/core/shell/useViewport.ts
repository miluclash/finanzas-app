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

/** Lee y guarda un valor sencillo en localStorage sin romperse si no hay almacenamiento */
export function leerLocal(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}
export function guardarLocal(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
