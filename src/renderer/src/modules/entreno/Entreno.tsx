import { Barbell, PencilSimpleLine, Plus, UploadSimple } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SummaryPeriod } from '@shared/modules/entreno/metrics/views'
import { weekLabelNumber } from '@shared/modules/entreno/metrics/weeks'
import { PanelEditable } from '../../core/graficos'
import { Aviso, Button, Card, EmptyState, SegmentedControl } from '../../core/ui'
import { useApi } from '../../lib/api'
import { mesLargo, rangoLargo } from './format'
import { useImportarHevy } from './ImportarHevy'
import { PeriodoResumenCtx, useResumenEntreno } from './periodoResumen'
import { PANEL_ENTRENO_POR_DEFECTO } from './porDefecto'

const PERIODOS: { id: SummaryPeriod; texto: string }[] = [
  { id: 'week', texto: 'Semana' },
  { id: 'month', texto: 'Mes' },
  { id: 'block', texto: 'Bloque' }
]

/** Entreno · Resumen: un panel editable. Las tarjetas (`tarjetas.tsx`) leen de `entreno:metrics.summary` el periodo que se elige en la cabecera. */
export function EntrenoPage() {
  const [periodo, setPeriodo] = useState<SummaryPeriod>('week')
  return (
    <PeriodoResumenCtx.Provider value={periodo}>
      <ResumenPanel periodo={periodo} onPeriodo={setPeriodo} />
    </PeriodoResumenCtx.Provider>
  )
}

function ResumenPanel({ periodo, onPeriodo }: { periodo: SummaryPeriod; onPeriodo: (p: SummaryPeriod) => void }) {
  const navigate = useNavigate()
  const importar = useImportarHevy()
  const resumen = useResumenEntreno()
  const hay = useApi('entreno:workouts.list', [{ limit: 1 }])

  const r = resumen.data?.range
  const rango = r ? rangoLargo(r.from, r.to) : ''
  const texto = !r ? undefined : r.period === 'week' ? `Semana ${weekLabelNumber(r.from)} · ${rango}` : r.period === 'month' ? `${mesLargo(r.from).replace(/^./, (c) => c.toUpperCase())} · ${rango}` : `Bloque «${r.blockName}» · ${rango}`
  const sinSesiones = hay.data?.length === 0

  return (
    <PanelEditable
      dashboardId="entreno"
      porDefecto={PANEL_ENTRENO_POR_DEFECTO}
      titulo="Resumen"
      texto={texto}
      acciones={
        <>
          <SegmentedControl label="Periodo" value={periodo} onChange={onPeriodo} opciones={PERIODOS} />
          <Button icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => navigate('/entreno/sesiones/nueva')}>
            Nueva sesión
          </Button>
          <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
            Importar de Hevy
          </Button>
        </>
      }
    >
      {r && r.requested === 'block' && r.period === 'week' && (
        <Aviso tono="info" className="mb-4">
          <div>Ningún bloque cubre esta fecha, así que se enseña la semana. Crea uno en Plan › Bloques.</div>
        </Aviso>
      )}
      {sinSesiones && (
        <Card className="mb-4" etiqueta="Entreno sin sesiones">
          <EmptyState
            horizontal
            icono={<Barbell size={24} weight="duotone" aria-hidden />}
            titulo="Importa tus entrenos de Hevy"
            texto="Exporta tu historial desde Hevy y súbelo aquí. Verás una vista previa antes de guardar nada. Mientras tanto, puedes montar tu plan y tus objetivos."
            accion={
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
                  Importar de Hevy
                </Button>
                <Button variant="ghost" icon={<PencilSimpleLine size={16} aria-hidden />} onClick={() => navigate('/entreno/sesiones/nueva')}>
                  Apuntar una sesión a mano
                </Button>
              </div>
            }
          />
        </Card>
      )}
    </PanelEditable>
  )
}
