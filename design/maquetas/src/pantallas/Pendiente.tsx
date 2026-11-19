import { Hammer } from '@phosphor-icons/react'
import type { Ruta } from '../shell/nav'
import { Button, } from '../ui/controls'
import { EmptyState } from '../ui/feedback'
import { PageHeader } from '../ui/layout'

/** Secciones que no forman parte de las maquetas de F2: se reestilizan después, sin cambiar qué muestran */
export function Pendiente({ ruta }: { ruta: Ruta }) {
  return (
    <div data-module={ruta.modulo === 'entreno' ? 'entreno' : 'finanzas'}>
      <PageHeader titulo={ruta.titulo} />
      <div className="card">
        <EmptyState
          icono={<Hammer size={24} weight="duotone" />}
          titulo="Esta pantalla no está en las maquetas"
          texto="Se adaptará al sistema de diseño después de aprobar estas, sin cambiar qué muestra."
          accion={<Button onClick={() => (location.hash = ruta.modulo === 'entreno' ? '#/entreno' : '#/finanzas')}>Volver al panel</Button>}
        />
      </div>
    </div>
  )
}
