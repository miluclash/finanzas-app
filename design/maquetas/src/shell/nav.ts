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

export type Seccion = { id: string; texto: string; icono: Icon; hash: string; maqueta: boolean }

export const SECCIONES: Record<'finanzas' | 'entreno', Seccion[]> = {
  finanzas: [
    { id: 'panel', texto: 'Panel', icono: SquaresFour, hash: '#/finanzas', maqueta: true },
    { id: 'movimientos', texto: 'Movimientos', icono: ArrowsLeftRight, hash: '#/movimientos', maqueta: true },
    { id: 'cuentas', texto: 'Cuentas', icono: Bank, hash: '#/finanzas/cuentas', maqueta: false },
    { id: 'presupuestos', texto: 'Presupuestos y meses', icono: Gauge, hash: '#/finanzas/presupuestos', maqueta: false },
    { id: 'recurrentes', texto: 'Recurrentes', icono: ArrowsClockwise, hash: '#/finanzas/recurrentes', maqueta: false },
    { id: 'objetivos', texto: 'Objetivos y huchas', icono: Target, hash: '#/finanzas/objetivos', maqueta: false },
    { id: 'patrimonio', texto: 'Patrimonio', icono: Scales, hash: '#/finanzas/patrimonio', maqueta: false },
    { id: 'prevision', texto: 'Previsión', icono: TrendUp, hash: '#/finanzas/prevision', maqueta: false },
    { id: 'inversiones', texto: 'Inversiones', icono: ChartLineUp, hash: '#/finanzas/inversiones', maqueta: false }
  ],
  entreno: [
    { id: 'resumen', texto: 'Resumen', icono: SquaresFour, hash: '#/entreno', maqueta: true },
    { id: 'sesiones', texto: 'Sesiones', icono: CalendarCheck, hash: '#/entreno/sesiones', maqueta: false },
    { id: 'ejercicios', texto: 'Ejercicios', icono: PersonSimpleRun, hash: '#/entreno/ejercicios', maqueta: false },
    { id: 'objetivos', texto: 'Objetivos', icono: Target, hash: '#/entreno/objetivos', maqueta: false },
    { id: 'plan', texto: 'Plan', icono: CalendarBlank, hash: '#/entreno/plan', maqueta: false }
  ]
}

export const MODULOS: { id: Modulo; texto: string; icono: Icon; hash: string }[] = [
  { id: 'inicio', texto: 'Inicio', icono: House, hash: '#/inicio' },
  { id: 'finanzas', texto: 'Finanzas', icono: Wallet, hash: '#/finanzas' },
  { id: 'entreno', texto: 'Entreno', icono: Barbell, hash: '#/entreno' }
]

export type Ruta = {
  pantalla: 'inicio' | 'finanzas' | 'movimientos' | 'entreno' | 'ajustes' | 'sistema' | 'pendiente'
  modulo: Modulo | 'ajustes' | 'sistema'
  seccion: string
  titulo: string
}

export function leerRuta(hash: string): Ruta {
  const h = hash.replace(/^#/, '') || '/inicio'
  const [, a, b] = h.split('/')
  switch (a) {
    case 'finanzas':
      return b ? { pantalla: 'pendiente', modulo: 'finanzas', seccion: b, titulo: SECCIONES.finanzas.find((s) => s.id === b)?.texto ?? b } : { pantalla: 'finanzas', modulo: 'finanzas', seccion: 'panel', titulo: 'Panel' }
    case 'movimientos':
      return { pantalla: 'movimientos', modulo: 'finanzas', seccion: 'movimientos', titulo: 'Movimientos' }
    case 'entreno':
      return b ? { pantalla: 'pendiente', modulo: 'entreno', seccion: b, titulo: SECCIONES.entreno.find((s) => s.id === b)?.texto ?? b } : { pantalla: 'entreno', modulo: 'entreno', seccion: 'resumen', titulo: 'Resumen' }
    case 'ajustes':
      return { pantalla: 'ajustes', modulo: 'ajustes', seccion: 'ajustes', titulo: 'Ajustes' }
    case 'sistema':
      return { pantalla: 'sistema', modulo: 'sistema', seccion: 'sistema', titulo: 'Sistema de diseño' }
    default:
      return { pantalla: 'inicio', modulo: 'inicio', seccion: 'inicio', titulo: 'Inicio' }
  }
}
