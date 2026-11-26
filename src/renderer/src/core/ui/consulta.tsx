// Tarjeta que depende de una consulta al proceso principal: muestra su propio estado de carga o de error
// (dentro de la tarjeta, con su título) y, cuando hay datos, pinta su contenido.
import type { ReactNode } from 'react'
import { Button } from './controls'
import { ErrorState, LoadingState } from './feedback'
import { Card } from './layout'

export interface ConsultaLike<T> {
  data?: T
  isLoading: boolean
  error: Error | null
  refetch: () => unknown
}

export function TarjetaConsulta<T>({
  q,
  titulo,
  icono,
  carga,
  error,
  filas = 3,
  className = 'h-full',
  children
}: {
  q: ConsultaLike<T>
  titulo: string
  icono?: ReactNode
  /** Texto accesible mientras carga («Cargando el patrimonio») */
  carga: string
  /** Título del error («No se ha podido cargar el patrimonio») */
  error: string
  filas?: number
  className?: string
  children: (datos: T) => ReactNode
}) {
  if (q.isLoading)
    return (
      <Card titulo={titulo} icono={icono} className={className}>
        <LoadingState filas={filas} etiqueta={carga} />
      </Card>
    )
  if (q.error || q.data === undefined)
    return (
      <Card titulo={titulo} icono={icono} className={className}>
        <ErrorState
          titulo={error}
          texto={q.error?.message ?? 'Inténtalo de nuevo.'}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      </Card>
    )
  return <>{children(q.data)}</>
}
