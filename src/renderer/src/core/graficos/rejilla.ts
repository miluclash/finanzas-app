// Cuadrícula de los paneles: 12 columnas (`page-grid`) y cuatro tamaños de tarjeta que se
// reorganizan según el ancho del contenido (consultas de contenedor, no de ventana):
//
// | Tamaño   | < 36rem | 36–56rem | ≥ 56rem |
// |----------|---------|----------|---------|
// | s        | 12      | 12       | 4  (un tercio)    |
// | m        | 12      | 6        | 6  (la mitad)     |
// | l        | 12      | 12       | 8  (dos tercios)  |
// | full     | 12      | 12       | 12                |
//
// A 1440×900 el contenido pasa de 56rem: tres pequeñas o dos medianas por fila, o una ancha con una
// pequeña. A 1024×768 queda entre 36 y 56rem: las pequeñas y las anchas ocupan todo el ancho (como
// las pantallas de antes de los paneles, sin huecos de media fila) y las medianas van de dos en dos.
import type { CardSize } from '@shared/core/metrics-types'

export const CLASE_TAMANO: Record<CardSize, string> = {
  s: 'col-span-12 @4xl:col-span-4',
  m: 'col-span-12 @xl:col-span-6',
  l: 'col-span-12 @4xl:col-span-8',
  full: 'col-span-12'
}

export const NOMBRE_TAMANO: Record<CardSize, string> = { s: 'Pequeña', m: 'Mediana', l: 'Ancha', full: 'Completa' }

/** Tamaños de las tarjetas de gráfico (todas se pueden poner en cualquiera). */
export const TAMANOS_GRAFICO: readonly CardSize[] = ['s', 'm', 'l', 'full']
