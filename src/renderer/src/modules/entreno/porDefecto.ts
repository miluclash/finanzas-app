// Diseño por defecto del Resumen de Entreno (lo que se veía antes de los paneles editables).
// Solo referencia ids de las tarjetas registradas en `tarjetas.tsx`.
import type { DashboardDefault } from '@shared/core/metrics-types'

export const PANEL_ENTRENO_POR_DEFECTO: DashboardDefault = {
  dashboardId: 'entreno',
  cards: [
    { ref: 'entreno.semana', size: 'l' },
    { ref: 'entreno.proxima', size: 's' },
    { ref: 'entreno.volumen', size: 'm' },
    { ref: 'entreno.series', size: 'm' },
    { ref: 'entreno.hyrox', size: 'm' },
    { ref: 'entreno.objetivos', size: 'm' },
    { ref: 'entreno.records', size: 's' },
    { ref: 'entreno.ultimas', size: 's' },
    { ref: 'entreno.constancia', size: 's' }
  ]
}
