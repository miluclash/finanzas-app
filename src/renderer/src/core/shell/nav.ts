// Mapa de navegación de la app: módulos, secciones y rutas. Una sola fuente para la barra lateral,
// las migas y el buscador de comandos.
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Bank,
  Barbell,
  CalendarBlank,
  CalendarCheck,
  ChartLineUp,
  Gauge,
  House,
  PersonSimpleRun,
  Scales,
  SquaresFour,
  Target,
  TrendUp,
  Wallet,
  type Icon
} from '@phosphor-icons/react'

export type Modulo = 'inicio' | 'finanzas' | 'entreno'
export type ModuloRuta = Modulo | 'ajustes'

export type Seccion = {
  id: string
  texto: string
  icono: Icon
  /** Ruta del hash router */
  ruta: string
  /** Aún sin pantalla: se ve en la barra, pero no se puede abrir */
  proximamente?: boolean
}

export const SECCIONES: Record<'finanzas' | 'entreno', Seccion[]> = {
  finanzas: [
    { id: 'panel', texto: 'Panel', icono: SquaresFour, ruta: '/finanzas' },
    { id: 'movimientos', texto: 'Movimientos', icono: ArrowsLeftRight, ruta: '/finanzas/movimientos' },
    { id: 'cuentas', texto: 'Cuentas', icono: Bank, ruta: '/finanzas/cuentas' },
    { id: 'presupuestos', texto: 'Presupuestos y meses', icono: Gauge, ruta: '/finanzas/presupuestos' },
    { id: 'recurrentes', texto: 'Recurrentes', icono: ArrowsClockwise, ruta: '/finanzas/recurrentes' },
    { id: 'objetivos', texto: 'Objetivos y huchas', icono: Target, ruta: '/finanzas/objetivos' },
    { id: 'patrimonio', texto: 'Patrimonio', icono: Scales, ruta: '/finanzas/patrimonio' },
    { id: 'prevision', texto: 'Previsión', icono: TrendUp, ruta: '/finanzas/prevision' },
    { id: 'inversiones', texto: 'Inversiones', icono: ChartLineUp, ruta: '/finanzas/inversiones' }
  ],
  entreno: [
    { id: 'resumen', texto: 'Resumen', icono: SquaresFour, ruta: '/entreno' },
    { id: 'sesiones', texto: 'Sesiones', icono: CalendarCheck, ruta: '/entreno', proximamente: true },
    { id: 'ejercicios', texto: 'Ejercicios', icono: PersonSimpleRun, ruta: '/entreno', proximamente: true },
    { id: 'objetivos', texto: 'Objetivos', icono: Target, ruta: '/entreno', proximamente: true },
    { id: 'plan', texto: 'Plan', icono: CalendarBlank, ruta: '/entreno', proximamente: true }
  ]
}

export const MODULOS: { id: Modulo; texto: string; icono: Icon; ruta: string }[] = [
  { id: 'inicio', texto: 'Inicio', icono: House, ruta: '/' },
  { id: 'finanzas', texto: 'Finanzas', icono: Wallet, ruta: '/finanzas' },
  { id: 'entreno', texto: 'Entreno', icono: Barbell, ruta: '/entreno' }
]

export type Ruta = {
  modulo: ModuloRuta
  seccion: string
  titulo: string
}

/** Qué pantalla es, a partir de la ruta (sin el `#`). */
export function leerRuta(pathname: string): Ruta {
  const [, a, b] = pathname.split('/')
  if (a === 'finanzas') {
    const s = SECCIONES.finanzas.find((x) => x.id === b) ?? SECCIONES.finanzas[0]
    return { modulo: 'finanzas', seccion: s.id, titulo: s.texto }
  }
  if (a === 'entreno') return { modulo: 'entreno', seccion: 'resumen', titulo: 'Resumen' }
  if (a === 'ajustes') return { modulo: 'ajustes', seccion: 'ajustes', titulo: 'Ajustes' }
  return { modulo: 'inicio', seccion: 'inicio', titulo: 'Inicio' }
}

/** Identidad visual de la ruta: Inicio y Ajustes son neutros */
export const moduloDe = (r: Ruta): 'finanzas' | 'entreno' | undefined => (r.modulo === 'finanzas' || r.modulo === 'entreno' ? r.modulo : undefined)

/**
 * Rutas de la versión anterior (sin /finanzas) → ruta nueva. También traduce los enlaces que
 * devuelve el proceso principal (por ejemplo, los avisos del panel: `/movimientos?vista=revision`).
 */
const ANTIGUAS = ['movimientos', 'cuentas', 'presupuestos', 'recurrentes', 'objetivos', 'patrimonio', 'prevision', 'inversiones']
export function rutaFinanzas(destino: string): string {
  if (destino === '/') return '/finanzas'
  const m = /^\/([a-z]+)(.*)$/.exec(destino)
  if (m && ANTIGUAS.includes(m[1])) return `/finanzas/${m[1]}${m[2]}`
  return destino
}
export const RUTAS_ANTIGUAS = ANTIGUAS
