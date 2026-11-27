// Tarjeta fija «Sugerencias» para los paneles editables. Es del núcleo (no de un módulo): `App.tsx` la junta con
// las de los módulos. En el panel de un módulo enseña solo las suyas; en Inicio, todas.
import { Lightbulb } from '@phosphor-icons/react'
import { useLocation } from 'react-router-dom'
import { Card } from '../ui'
import type { FixedCardDef, FixedCardProps } from '../graficos'
import { leerRuta, moduloDe } from '../shell/nav'
import { pedirComentario, useAiStatus, useAiSuggestions } from './aiApi'
import { ListaSugerencias, motivoSinAsistente } from './Sugerencias'

function SugerenciasCard({ size, editando }: FixedCardProps) {
  const { pathname } = useLocation()
  const modulo = moduloDe(leerRuta(pathname))
  const q = useAiSuggestions()
  const estado = useAiStatus()
  const datos = q.data && (modulo === 'finanzas' || modulo === 'entreno' ? q.data.filter((s) => s.module === modulo) : q.data)
  // En tamaño pequeño caben pocas: el resto, en el panel del asistente
  const max = size === 's' ? 2 : size === 'm' ? 3 : 5
  const visibles = datos?.slice(0, max)
  const resto = (datos?.length ?? 0) - (visibles?.length ?? 0)
  return (
    <Card titulo="Sugerencias" icono={<Lightbulb size={20} weight="duotone" aria-hidden />} className="h-full">
      <div inert={editando || undefined}>
        <ListaSugerencias
          compacta
          datos={visibles}
          cargando={q.isLoading}
          error={q.error}
          onReintentar={() => q.refetch()}
          onComentar={(s) => pedirComentario([s.id])}
          motivo={motivoSinAsistente(estado.data, estado.error)}
        />
        {resto > 0 && <p className="t-meta mt-3">Y {resto === 1 ? '1 más' : `${resto} más`} en el panel del asistente.</p>}
      </div>
    </Card>
  )
}

export const tarjetasAsistente: FixedCardDef[] = [
  { id: 'core.sugerencias', module: 'core', title: 'Sugerencias', sizes: ['s', 'm', 'l', 'full'], defaultSize: 'm', panels: ['inicio', 'finanzas', 'entreno'], Component: SugerenciasCard }
]
