import { CalendarCheck, MagnifyingGlass, Plus, UploadSimple } from '@phosphor-icons/react'
import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formatDate } from '@shared/dates'
import { WORKOUT_KINDS, type WorkoutFilter, type WorkoutKind } from '@shared/modules/entreno/types'
import { Button, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Select, TextField, type Pastilla } from '../../core/ui'
import { useApi } from '../../lib/api'
import { fechaDe, formatDuracion, horaDe, KIND_LABEL } from './format'
import { useImportarHevy } from './ImportarHevy'
import { KindTag, OrigenTag, useRetraso } from './Piezas'

const PAGINA = 100
const esTipo = (v: string | null): v is WorkoutKind => !!v && (WORKOUT_KINDS as readonly string[]).includes(v)
const esFecha = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Entreno · Sesiones: lista con filtro por tipo, fechas y texto. */
export function SesionesPage() {
  const navigate = useNavigate()
  const importar = useImportarHevy()
  const [params, setParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '')
  const [avanzados, setAvanzados] = useState(!!(params.get('desde') || params.get('hasta')))
  const [paginas, setPaginas] = useState(1)
  const q = useRetraso(busqueda.trim())

  const tipo = params.get('tipo')
  const desde = params.get('desde')
  const hasta = params.get('hasta')
  const filtro: WorkoutFilter = {
    kind: esTipo(tipo) ? tipo : null,
    from: esFecha(desde) ? desde : null,
    to: esFecha(hasta) ? hasta : null,
    search: q || null,
    limit: PAGINA * paginas
  }
  const sesiones = useApi('entreno:workouts.list', [filtro], { placeholderData: keepPreviousData })

  const poner = (clave: string, valor: string | null) => {
    setPaginas(1)
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (valor) n.set(clave, valor)
        else n.delete(clave)
        return n
      },
      { replace: true }
    )
  }
  const pastillas: Pastilla[] = []
  if (esTipo(tipo)) pastillas.push({ id: 'tipo', texto: KIND_LABEL[tipo] })
  if (esFecha(desde)) pastillas.push({ id: 'desde', texto: `Desde ${formatDate(desde)}` })
  if (esFecha(hasta)) pastillas.push({ id: 'hasta', texto: `Hasta ${formatDate(hasta)}` })
  if (q) pastillas.push({ id: 'q', texto: `«${q}»` })
  const quitar = (id: string) => {
    if (id === 'q') setBusqueda('')
    else poner(id, null)
  }
  const limpiar = () => {
    setBusqueda('')
    setPaginas(1)
    setParams({}, { replace: true })
  }

  const acciones = (
    <>
      <Button icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => navigate('/entreno/sesiones/nueva')}>
        Nueva sesión
      </Button>
      <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
        Importar de Hevy
      </Button>
    </>
  )

  const lista = sesiones.data
  const hayMas = !!lista && lista.length === PAGINA * paginas

  return (
    <div>
      <PageHeader titulo="Sesiones" texto="Todo lo que has entrenado, de Hevy o apuntado a mano." acciones={acciones} />
      <FilterBar
        principal={
          <>
            <TextField
              className="min-w-64 max-w-md flex-1"
              label="Buscar"
              ocultarEtiqueta
              placeholder="Buscar por título, ejercicio o nota"
              icono={<MagnifyingGlass size={16} />}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPaginas(1)
              }}
            />
            <Select className="w-44" label="Tipo" ocultarEtiqueta value={esTipo(tipo) ? tipo : ''} onChange={(e) => poner('tipo', e.target.value || null)}>
              <option value="">Todos los tipos</option>
              {WORKOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </>
        }
        contador={pastillas.filter((p) => p.id !== 'q' && p.id !== 'tipo').length}
        abierto={avanzados}
        onAlternar={() => setAvanzados((v) => !v)}
        avanzados={
          <div className="flex flex-wrap items-end gap-4">
            <TextField className="w-48" label="Desde" type="date" value={esFecha(desde) ? desde : ''} max={esFecha(hasta) ? hasta : undefined} onChange={(e) => poner('desde', e.target.value || null)} />
            <TextField className="w-48" label="Hasta" type="date" value={esFecha(hasta) ? hasta : ''} min={esFecha(desde) ? desde : undefined} onChange={(e) => poner('hasta', e.target.value || null)} />
          </div>
        }
        pastillas={pastillas}
        onQuitar={quitar}
        onLimpiar={limpiar}
      />

      {sesiones.isLoading && <LoadingState filas={5} etiqueta="Cargando las sesiones" />}
      {sesiones.error && (
        <ErrorState
          titulo="No se han podido cargar las sesiones"
          texto={sesiones.error.message}
          accion={
            <Button size="sm" onClick={() => sesiones.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {lista && lista.length === 0 && pastillas.length === 0 && (
        <div className="card">
          <EmptyState
            icono={<CalendarCheck size={24} weight="duotone" aria-hidden />}
            titulo="Aún no hay sesiones"
            texto="Importa tu historial de Hevy o apunta una sesión a mano."
            accion={
              <Button variant="primary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={importar.abrir}>
                Importar de Hevy
              </Button>
            }
          />
        </div>
      )}
      {lista && lista.length === 0 && pastillas.length > 0 && (
        <div className="card">
          <EmptyState
            icono={<MagnifyingGlass size={24} weight="duotone" aria-hidden />}
            titulo="Ninguna sesión coincide"
            texto="Prueba con otras palabras o quita algún filtro."
            accion={
              <Button size="sm" onClick={limpiar}>
                Limpiar filtros
              </Button>
            }
          />
        </div>
      )}
      {lista && lista.length > 0 && (
        <>
          <div className="card card-flush overflow-x-auto">
            <table className="table" data-density="compact" aria-label="Sesiones">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Sesión</th>
                  <th scope="col">Tipo</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Duración
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Ejercicios
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Series
                  </th>
                  <th scope="col">Origen</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((w) => (
                  <tr key={w.id} className="row cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest('a, button') && navigate(`/entreno/sesiones/${w.id}`)}>
                    <td className="tnum whitespace-nowrap text-ink-2">
                      {fechaDe(w.startTime)} <span className="t-meta">{horaDe(w.startTime)}</span>
                    </td>
                    <td className="max-w-80">
                      <Link to={`/entreno/sesiones/${w.id}`} className="block truncate font-semibold hover:underline" title={w.title}>
                        {w.title}
                      </Link>
                    </td>
                    <td>
                      <KindTag kind={w.kind} />
                    </td>
                    <td className="tnum text-right text-ink-2">{formatDuracion(w.durationSeconds)}</td>
                    <td className="tnum text-right text-ink-2">{w.exerciseCount}</td>
                    <td className="tnum text-right text-ink-2">{w.setCount}</td>
                    <td>
                      <OrigenTag source={w.source} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="t-meta" aria-live="polite">
              {lista.length} {lista.length === 1 ? 'sesión' : 'sesiones'}
              {hayMas ? ' mostradas' : ''}
            </p>
            {hayMas && (
              <Button size="sm" onClick={() => setPaginas((p) => p + 1)} cargando={sesiones.isFetching}>
                Mostrar más
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
