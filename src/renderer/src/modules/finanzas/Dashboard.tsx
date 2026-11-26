import { useState } from 'react'
import { formatMonth, monthOf, todayISO } from '@shared/dates'
import { PanelEditable } from '../../core/graficos'
import { MonthPicker } from './components/MonthPicker'
import { MesPanelCtx } from './mesPanel'
import { PANEL_FINANZAS_POR_DEFECTO } from './porDefecto'

/** Panel de Finanzas: un panel editable cuyas tarjetas (`tarjetas.tsx`) leen el mes que se elige en la cabecera. */
export function DashboardPage() {
  const current = monthOf(todayISO())
  const [month, setMonth] = useState(current)
  return (
    <div data-module="finanzas">
      <MesPanelCtx.Provider value={month}>
        <PanelEditable
          dashboardId="finanzas"
          porDefecto={PANEL_FINANZAS_POR_DEFECTO}
          titulo="Panel"
          texto={month === current ? 'Situación de hoy y del mes en curso.' : `Mes de ${formatMonth(month, true)}. Patrimonio y disponible siempre son de hoy.`}
          acciones={<MonthPicker month={month} onChange={setMonth} max={current} />}
        />
      </MesPanelCtx.Provider>
    </div>
  )
}
