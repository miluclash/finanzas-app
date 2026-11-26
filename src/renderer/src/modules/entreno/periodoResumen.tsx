// Periodo (semana, mes o bloque) del Resumen de Entreno. El selector vive en la cabecera del panel y las
// tarjetas lo leen de aquí; fuera del Resumen (por ejemplo, en el Inicio) se enseña la semana.
import { keepPreviousData } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { SummaryPeriod } from '@shared/modules/entreno/metrics/views'
import { useApi } from '../../lib/api'

export const PeriodoResumenCtx = createContext<SummaryPeriod | null>(null)

export function usePeriodoResumen(): SummaryPeriod {
  return useContext(PeriodoResumenCtx) ?? 'week'
}

/** ¿Está la tarjeta en el Resumen de Entreno? (el Resumen publica su periodo; en el Inicio no hay) */
export function useEnResumen(): boolean {
  return useContext(PeriodoResumenCtx) !== null
}

/** `entreno:metrics.summary` del periodo elegido. Todas las tarjetas comparten la misma consulta. */
export function useResumenEntreno() {
  const periodo = usePeriodoResumen()
  return useApi('entreno:metrics.summary', [{ period: periodo }], { placeholderData: keepPreviousData })
}
