// Tema de la interfaz: data-theme="dark|light" en <html>. La preferencia (Oscuro / Claro / Sistema)
// se guarda en los ajustes de Finanzas (`settings.theme`); aquí solo se aplica.
import { useEffect } from 'react'
import { useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'

export type PrefTema = 'system' | 'light' | 'dark'

/** Copia de la preferencia solo para pintar bien el primer fotograma (la verdad está en los ajustes). */
const CLAVE_CACHE = 'finanzas-tema'

function leerCache(): PrefTema {
  try {
    const v = localStorage.getItem(CLAVE_CACHE)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

export function esOscuro(pref: PrefTema): boolean {
  return pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

/** Pone el tema en <html> y avisa al proceso principal (barra de título, diálogos nativos). */
export function aplicarPreferencia(pref: PrefTema, avisarSistema = true): void {
  document.documentElement.setAttribute('data-theme', esOscuro(pref) ? 'dark' : 'light')
  try {
    localStorage.setItem(CLAVE_CACHE, pref)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
  if (avisarSistema) void window.finanzas?.setTheme(pref)
}

/** Antes de pintar: oscuro por defecto, o lo último que se guardó. */
export function aplicarTemaInicial(): void {
  document.documentElement.setAttribute('data-theme', esOscuro(leerCache()) ? 'dark' : 'light')
}

/** Mantiene el tema en sintonía con `settings.theme` y, en «Sistema», con el del equipo. */
export function useThemeSync(): PrefTema {
  const { cat } = useCatalog()
  const pref: PrefTema = cat?.settings.theme ?? leerCache()
  useEffect(() => {
    aplicarPreferencia(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => aplicarPreferencia('system', false)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [pref])
  return pref
}

/** Alterna entre oscuro y claro (Ctrl K › «Cambiar tema»). Se guarda en los ajustes como siempre. */
export function useCambiarTema(): () => void {
  const { cat } = useCatalog()
  const save = useApiMutation('finanzas:settings.update')
  const guardado = cat?.settings.theme ?? 'dark'
  return () => {
    const siguiente: PrefTema = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    aplicarPreferencia(siguiente)
    save.mutate([{ theme: siguiente }], { onError: () => aplicarPreferencia(guardado) })
  }
}
