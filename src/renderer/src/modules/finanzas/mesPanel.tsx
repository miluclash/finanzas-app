// Mes que enseñan las tarjetas de Finanzas. El Panel lo elige con su selector de mes (cabecera);
// fuera del Panel (por ejemplo, en el Inicio) las tarjetas usan el mes en curso.
import { createContext, useContext } from 'react'
import { monthOf, todayISO } from '@shared/dates'

export const MesPanelCtx = createContext<string | null>(null)

/** Mes (`YYYY-MM`) de las tarjetas: el del selector del Panel o, si no hay, el actual. */
export function useMesPanel(): string {
  return useContext(MesPanelCtx) ?? monthOf(todayISO())
}
