import { Hammer } from '@phosphor-icons/react'
import { EmptyState, PageHeader } from '../ui/basics'
import type { Ruta } from '../shell/nav'

/** Secciones que no forman parte de las maquetas de F2: se reestilizan después, sin cambiar qué muestran */
export function Pendiente({ ruta }: { ruta: Ruta }) {
  return (
    <div data-module={ruta.modulo === 'entreno' ? 'entreno' : 'finanzas'}>
      <PageHeader titulo={ruta.titulo} />
      <div className="card">
        <EmptyState icono={<Hammer size={22} weight="duotone" />} titulo="Esta pantalla no está en las maquetas" texto="Se adaptará al sistema de diseño después de aprobar estas, sin cambiar qué muestra." accion={<a className="btn btn-secondary" href={ruta.modulo === 'entreno' ? '#/entreno' : '#/finanzas'}>Volver al panel</a>} />
      </div>
    </div>
  )
}
