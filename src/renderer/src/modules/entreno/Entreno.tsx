import { Barbell, CalendarCheck, ChartBar, Medal, Target, UploadSimple } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Button, Card, EmptyState, PageHeader, Tag } from '../../core/ui'

/** Lo que traerá cada bloque cuando haya entrenos. Solo describe: no hay datos inventados. */
const PROXIMAMENTE: { icono: ReactNode; titulo: string; texto: string }[] = [
  { icono: <CalendarCheck size={20} weight="duotone" aria-hidden />, titulo: 'Semana', texto: 'Cumplimiento y próxima sesión.' },
  { icono: <ChartBar size={20} weight="duotone" aria-hidden />, titulo: 'Volumen', texto: 'Tendencia semanal de tu entrenamiento.' },
  { icono: <Medal size={20} weight="duotone" aria-hidden />, titulo: 'Récords', texto: 'Tus mejores marcas por ejercicio.' },
  { icono: <Target size={20} weight="duotone" aria-hidden />, titulo: 'Objetivos', texto: 'Progreso hacia lo que te has marcado.' }
]

/** Entreno · Resumen. Hasta que lleguen los datos (fase 3) es un estado vacío diseñado, con la identidad del módulo. */
export function EntrenoPage() {
  return (
    <div>
      <PageHeader titulo="Entreno" texto="Tus sesiones, volumen y récords, en un solo sitio." />
      <div className="page-grid">
        <Card className="col-span-12" etiqueta="Entreno sin datos">
          <EmptyState
            icono={<Barbell size={24} weight="duotone" aria-hidden />}
            titulo="Importa tus entrenos de Hevy"
            texto="Aquí verás tu semana, tu volumen y tus récords. La importación llega en la próxima fase."
            accion={
              <div className="flex flex-col items-center gap-2">
                <Button variant="primary" disabled icon={<UploadSimple size={16} weight="bold" aria-hidden />}>
                  Importar de Hevy
                </Button>
                <Tag>Próxima fase</Tag>
              </div>
            }
          />
        </Card>
        {PROXIMAMENTE.map((p) => (
          <div key={p.titulo} className="col-span-12 @2xl:col-span-6 @4xl:col-span-3">
            <Card titulo={p.titulo} icono={<span className="text-accent-text">{p.icono}</span>} className="h-full">
              <p className="t-label">{p.texto}</p>
              <p className="t-meta mt-3">Sin datos todavía</p>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
