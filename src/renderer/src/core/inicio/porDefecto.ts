// Diseño por defecto del Inicio: lo de hoy arriba, un resumen de cada módulo y lo complementario al final.
// Solo referencia ids de tarjetas registradas por los módulos; el núcleo no importa nada de ellos.
import type { DashboardDefault } from '@shared/core/metrics-types'

export const INICIO_POR_DEFECTO: DashboardDefault = {
  dashboardId: 'inicio',
  cards: [
    { ref: 'finanzas.disponible', size: 's' },
    { ref: 'finanzas.por-revisar', size: 's' },
    { ref: 'entreno.proxima', size: 's' },
    { ref: 'finanzas.resumen', size: 'm' },
    { ref: 'entreno.resumen', size: 'm' },
    { ref: 'finanzas.tendencia', size: 'm' },
    { ref: 'entreno.records-recientes', size: 'm' }
  ]
}
