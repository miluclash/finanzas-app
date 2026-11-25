import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '../../core/ui'
import { useApi } from '../../lib/api'
import { BloquesPlan } from './Bloques'
import { PlanBoceto } from './PlanBoceto'
import { PlanSemana } from './PlanSemana'
import { TiposEntreno } from './TiposEntreno'

const VISTAS = ['semana', 'boceto', 'tipos', 'bloques'] as const
type Vista = (typeof VISTAS)[number]
const esVista = (v: string | null): v is Vista => !!v && (VISTAS as readonly string[]).includes(v)

/** Entreno · Plan: la semana concreta, el boceto (semana base), los tipos de entreno y los bloques. */
export function PlanPage() {
  const [params, setParams] = useSearchParams()
  const v = params.get('vista')
  const vista: Vista = esVista(v) ? v : 'semana'
  const irA = (x: Vista) => setParams(x === 'semana' ? {} : { vista: x }, { replace: true })
  const rutinas = useApi('entreno:routines.list', [])
  const lista = rutinas.data ?? []

  return (
    <div>
      <PageHeader titulo="Plan" texto="Qué te toca cada semana. Parte de tu semana base y la puedes ajustar sobre la marcha." />
      <Tabs
        label="Secciones del plan"
        value={vista}
        onChange={irA}
        pestanas={[
          { id: 'semana', texto: 'Esta semana' },
          { id: 'boceto', texto: 'Semana base' },
          { id: 'tipos', texto: 'Tipos de entreno' },
          { id: 'bloques', texto: 'Bloques' }
        ]}
      />
      <div role="tabpanel" aria-label={{ semana: 'Esta semana', boceto: 'Semana base', tipos: 'Tipos de entreno', bloques: 'Bloques' }[vista]} className="mt-6">
        {vista === 'semana' && <PlanSemana rutinas={lista} onCrearTipos={() => irA('tipos')} />}
        {vista === 'boceto' && <PlanBoceto rutinas={lista} onCrearTipos={() => irA('tipos')} />}
        {vista === 'tipos' && <TiposEntreno />}
        {vista === 'bloques' && <BloquesPlan />}
      </div>
    </div>
  )
}
