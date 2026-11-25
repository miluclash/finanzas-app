import { Barbell, PencilSimpleLine, Plus, UploadSimple } from '@phosphor-icons/react'
import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SummaryPeriod } from '@shared/modules/entreno/metrics/views'
import { weekLabelNumber } from '@shared/modules/entreno/metrics/weeks'
import { Aviso, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SegmentedControl } from '../../core/ui'
import { useApi } from '../../lib/api'
import { mesLargo, rangoLargo } from './format'
import { useImportarHevy } from './ImportarHevy'
import { ConstanciaCard, HyroxCard, ObjetivosCard, ProximaCard, RecordsCard, SemanaCard, SeriesCard, UltimasCard, VolumenCard } from './ResumenTarjetas'

const PERIODOS: { id: SummaryPeriod; texto: string }[] = [
  { id: 'week', texto: 'Semana' },
  { id: 'month', texto: 'Mes' },
  { id: 'block', texto: 'Bloque' }
]

/** Entreno · Resumen: la semana, el volumen, HYROX y objetivos, y lo reciente. Todo viene calculado de `entreno:metrics.summary`. */
export function EntrenoPage() {
  const navigate = useNavigate()
  const importar = useImportarHevy()
  const [periodo, setPeriodo] = useState<SummaryPeriod>('week')
  const resumen = useApi('entreno:metrics.summary', [{ period: periodo }], { placeholderData: keepPreviousData })
  const hay = useApi('entreno:workouts.list', [{ limit: 1 }])

  const cabecera = (texto?: string) => (
    <PageHeader
      titulo="Resumen"
      texto={texto}
      acciones={
        <>
          <SegmentedControl label="Periodo" value={periodo} onChange={setPeriodo} opciones={PERIODOS} />
          <Button icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => navigate('/entreno/sesiones/nueva')}>
            Nueva sesión
          </Button>
          <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
            Importar de Hevy
          </Button>
        </>
      }
    />
  )

  if (resumen.isLoading)
    return (
      <div>
        {cabecera()}
        <LoadingState filas={4} etiqueta="Calculando tu resumen" />
      </div>
    )
  if (resumen.error || !resumen.data)
    return (
      <div>
        {cabecera()}
        <ErrorState
          titulo="No se ha podido calcular el resumen"
          texto={resumen.error?.message ?? 'Inténtalo de nuevo.'}
          accion={
            <Button size="sm" onClick={() => resumen.refetch()}>
              Reintentar
            </Button>
          }
        />
      </div>
    )

  const s = resumen.data
  const r = s.range
  const rango = rangoLargo(r.from, r.to)
  const texto = r.period === 'week' ? `Semana ${weekLabelNumber(r.from)} · ${rango}` : r.period === 'month' ? `${mesLargo(r.from).replace(/^./, (c) => c.toUpperCase())} · ${rango}` : `Bloque «${r.blockName}» · ${rango}`
  const sinSesiones = hay.data?.length === 0

  return (
    <div>
      {cabecera(texto)}
      {r.requested === 'block' && r.period === 'week' && (
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
      <div className="page-grid">
        <SemanaCard s={s} />
        <ProximaCard s={s} />
        <VolumenCard s={s} />
        <SeriesCard s={s} />
        <HyroxCard s={s} />
        <ObjetivosCard s={s} />
        <RecordsCard s={s} />
        <UltimasCard s={s} />
        <ConstanciaCard s={s} />
      </div>
    </div>
  )
}
