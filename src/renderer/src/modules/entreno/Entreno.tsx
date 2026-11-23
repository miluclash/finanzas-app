import { Barbell, CalendarCheck, ChartBar, Medal, PencilSimpleLine, Plus, Target, UploadSimple } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../../core/ui'
import { useApi } from '../../lib/api'
import { fechaLocal } from './format'
import { useImportarHevy } from './ImportarHevy'
import { FilaSesion } from './Piezas'

/** Lo que traerá cada bloque cuando lleguen las métricas (fase 4). Solo describe: no hay datos inventados. */
const PROXIMAMENTE: { icono: ReactNode; titulo: string; texto: string }[] = [
  { icono: <CalendarCheck size={20} weight="duotone" aria-hidden />, titulo: 'Semana', texto: 'Cumplimiento y próxima sesión.' },
  { icono: <ChartBar size={20} weight="duotone" aria-hidden />, titulo: 'Volumen', texto: 'Tendencia semanal de tu entrenamiento.' },
  { icono: <Medal size={20} weight="duotone" aria-hidden />, titulo: 'Récords', texto: 'Tus mejores marcas por ejercicio.' },
  { icono: <Target size={20} weight="duotone" aria-hidden />, titulo: 'Objetivos', texto: 'Progreso hacia lo que te has marcado.' }
]

function Proximamente() {
  return (
    <>
      {PROXIMAMENTE.map((p) => (
        <div key={p.titulo} className="col-span-12 @2xl:col-span-6 @4xl:col-span-3">
          <Card titulo={p.titulo} icono={<span className="text-accent-text">{p.icono}</span>} className="h-full">
            <p className="t-label">{p.texto}</p>
            <p className="t-meta mt-3">Próximamente</p>
          </Card>
        </div>
      ))}
    </>
  )
}

/** Entreno · Resumen. Las sesiones llegan con la importación de Hevy o apuntadas a mano; las métricas, en la fase 4. */
export function EntrenoPage() {
  const navigate = useNavigate()
  const importar = useImportarHevy()
  const sesiones = useApi('entreno:workouts.list', [{ limit: 8 }])
  const importaciones = useApi('entreno:imports.list', [])

  if (sesiones.isLoading)
    return (
      <div>
        <PageHeader titulo="Entreno" />
        <LoadingState filas={4} etiqueta="Cargando tus sesiones" />
      </div>
    )
  if (sesiones.error || !sesiones.data)
    return (
      <div>
        <PageHeader titulo="Entreno" />
        <ErrorState
          titulo="No se han podido cargar tus sesiones"
          texto={sesiones.error?.message ?? 'Inténtalo de nuevo.'}
          accion={
            <Button size="sm" onClick={() => sesiones.refetch()}>
              Reintentar
            </Button>
          }
        />
      </div>
    )

  const lista = sesiones.data
  const ultima = importaciones.data?.[0]

  if (lista.length === 0)
    return (
      <div>
        <PageHeader titulo="Entreno" texto="Tus sesiones, volumen y récords, en un solo sitio." />
        <div className="page-grid">
          <Card className="col-span-12" etiqueta="Entreno sin datos">
            <EmptyState
              icono={<Barbell size={24} weight="duotone" aria-hidden />}
              titulo="Importa tus entrenos de Hevy"
              texto="Exporta tu historial desde Hevy y súbelo aquí. Verás una vista previa antes de guardar nada."
              accion={
                <div className="flex flex-col items-center gap-3">
                  <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
                    Importar de Hevy
                  </Button>
                  <Button variant="ghost" size="sm" icon={<PencilSimpleLine size={16} aria-hidden />} onClick={() => navigate('/entreno/sesiones/nueva')}>
                    Apuntar una sesión a mano
                  </Button>
                </div>
              }
            />
          </Card>
          <Proximamente />
        </div>
      </div>
    )

  return (
    <div>
      <PageHeader
        titulo="Entreno"
        texto="Tus sesiones, volumen y récords, en un solo sitio."
        acciones={
          <>
            <Button icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => navigate('/entreno/sesiones/nueva')}>
              Nueva sesión
            </Button>
            <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
              Importar de Hevy
            </Button>
          </>
        }
      />
      <div className="page-grid">
        <div className="col-span-12 @4xl:col-span-8">
          <Card
            titulo="Últimas sesiones"
            className="h-full"
            accion={
              <Link to="/entreno/sesiones" className="t-label font-semibold text-accent-text hover:underline">
                Ver todas
              </Link>
            }
          >
            <ul className="-mx-3 flex flex-col" aria-label="Últimas sesiones">
              {lista.map((w) => (
                <FilaSesion key={w.id} w={w} />
              ))}
            </ul>
          </Card>
        </div>
        <div className="col-span-12 @4xl:col-span-4">
          <Card titulo="Importar" className="h-full">
            <p className="t-label">Exporta tu historial desde Hevy y súbelo cuando quieras: lo que ya tienes no se duplica.</p>
            {ultima && (
              <p className="t-meta mt-3">
                Última importación: {fechaLocal(ultima.importedAt)}. {ultima.workoutsNew} nuevas, {ultima.workoutsChanged} cambiadas.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" icon={<UploadSimple size={16} aria-hidden />} onClick={importar.abrir}>
                Importar de Hevy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/entreno/sesiones/nueva')}>
                Apuntar una a mano
              </Button>
            </div>
          </Card>
        </div>
        <Proximamente />
      </div>
    </div>
  )
}
