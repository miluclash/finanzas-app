// Diseño por defecto del Panel de Finanzas (lo que se veía antes de los paneles editables).
// Solo referencia ids de las tarjetas registradas en `tarjetas.tsx`.
import type { DashboardDefault } from '@shared/core/metrics-types'

export const PANEL_FINANZAS_POR_DEFECTO: DashboardDefault = {
  dashboardId: 'finanzas',
  cards: [
    { ref: 'finanzas.disponible', size: 'l' },
    { ref: 'finanzas.patrimonio', size: 's' },
    { ref: 'finanzas.mes', size: 'l' },
    { ref: 'finanzas.avisos', size: 's' },
    { ref: 'finanzas.detalle', size: 'full' }
  ]
}
