import { ArrowsMerge, MagnifyingGlass, PersonSimpleRun, Plus, Warning, X } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HYROX_STATION_KEYS } from '@shared/modules/entreno/hyrox'
import { EXERCISE_CATEGORIES, MEASURE_TYPES, type Exercise, type ExerciseCategory, type HyroxStation, type MeasureType, type MuscleGroup } from '@shared/modules/entreno/types'
import { Aviso, Button, Checkbox, ConfirmDialog, ErrorState, IconButton, LoadingState, Modal, PageHeader, Select, Tag, TextArea, TextField } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { CATEGORY_LABEL, fechaDe, HYROX_STATION_LABEL, MEASURE_LABEL, normalizar, SIN_CLASIFICAR } from './format'
import { useRetraso } from './Piezas'

type FiltroCat = '' | 'sin-clasificar' | 'sin-grupo' | ExerciseCategory
const esFiltro = (v: string | null): v is FiltroCat => v === '' || v === 'sin-clasificar' || v === 'sin-grupo' || (EXERCISE_CATEGORIES as readonly string[]).includes(v ?? '')

/** Entreno · catálogo de ejercicios: búsqueda, filtros y edición (categoría, medida, grupos musculares, alias y unir). */
export function EjerciciosPage() {
  const [params] = useSearchParams()
  const ejercicios = useApi('entreno:exercises.list', [])
  const grupos = useApi('entreno:muscleGroups.list', [])
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '')
  const [categoria, setCategoria] = useState<FiltroCat>(esFiltro(params.get('cat')) ? (params.get('cat') as FiltroCat) : '')
  const [inactivos, setInactivos] = useState(false)
  const [editando, setEditando] = useState<number | 'nuevo' | null>(null)
  const q = normalizar(useRetraso(busqueda).trim())

  const lista = ejercicios.data
  const nombreGrupo = useMemo(() => new Map((grupos.data ?? []).map((g) => [g.id, g.name])), [grupos.data])
  const sinClasificar = lista?.filter((e) => e.active && e.category === null).length ?? 0
  const sinGrupo = lista?.filter((e) => e.active && e.primaryGroupId === null).length ?? 0

  const visibles = useMemo(() => {
    if (!lista) return []
    return lista
      .filter((e) => (inactivos || e.active) && (categoria === '' || (categoria === 'sin-clasificar' ? e.category === null : categoria === 'sin-grupo' ? e.primaryGroupId === null : e.category === categoria)))
      .filter((e) => !q || normalizar(e.title).includes(q) || e.aliases.some((a) => normalizar(a.alias).includes(q)))
      .sort((a, b) => Number(b.category === null) - Number(a.category === null) || a.title.localeCompare(b.title, 'es'))
  }, [lista, categoria, inactivos, q])

  return (
    <div>
      <PageHeader
        titulo="Ejercicios"
        texto="Tu catálogo. Los ejercicios nuevos de Hevy llegan sin clasificar: complétalos para que las métricas sepan qué músculos trabajas."
        acciones={
          <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setEditando('nuevo')}>
            Nuevo ejercicio
          </Button>
        }
      />
      {ejercicios.isLoading && <LoadingState filas={5} etiqueta="Cargando los ejercicios" />}
      {ejercicios.error && (
        <ErrorState
          titulo="No se han podido cargar los ejercicios"
          texto={ejercicios.error.message}
          accion={
            <Button size="sm" onClick={() => ejercicios.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {lista && lista.length === 0 && (
        <div className="card">
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="grid size-12 place-items-center r-full border border-line-strong bg-raised text-accent-text">
              <PersonSimpleRun size={24} weight="duotone" aria-hidden />
            </div>
            <div className="t-card-title t-plain">Aún no hay ejercicios</div>
            <p className="t-label max-w-xs">Se crean solos al importar de Hevy, o puedes añadir uno a mano.</p>
          </div>
        </div>
      )}
      {lista && lista.length > 0 && (
        <>
          {(sinClasificar > 0 || sinGrupo > 0) && (
            <Aviso tono="info" className="mb-4">
              <div>
                {sinClasificar > 0 && (
                  <span>
                    {sinClasificar} {sinClasificar === 1 ? 'ejercicio sin clasificar' : 'ejercicios sin clasificar'}
                  </span>
                )}
                {sinClasificar > 0 && sinGrupo > 0 && ' y '}
                {sinGrupo > 0 && (
                  <span>
                    {sinGrupo} sin grupo muscular
                  </span>
                )}
                . Ábrelos y ponles categoría y músculos.
              </div>
              <div className="flex flex-wrap gap-2">
                {sinClasificar > 0 && (
                  <Button size="sm" onClick={() => setCategoria('sin-clasificar')}>
                    Ver los sin clasificar
                  </Button>
                )}
                {sinGrupo > 0 && (
                  <Button size="sm" onClick={() => setCategoria('sin-grupo')}>
                    Ver los sin grupo muscular
                  </Button>
                )}
              </div>
            </Aviso>
          )}
          <div role="search" aria-label="Filtros de ejercicios" className="mb-4 flex flex-wrap items-end gap-4">
            <TextField className="min-w-64 max-w-md flex-1" label="Buscar" ocultarEtiqueta icono={<MagnifyingGlass size={16} />} placeholder="Buscar por nombre o alias" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <Select className="w-56" label="Categoría" ocultarEtiqueta value={categoria} onChange={(e) => setCategoria(e.target.value as FiltroCat)}>
              <option value="">Todas las categorías</option>
              <option value="sin-clasificar">{SIN_CLASIFICAR}</option>
              <option value="sin-grupo">Sin grupo muscular</option>
              {EXERCISE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
            <div className="pb-2">
              <Checkbox checked={inactivos} onChange={setInactivos} label="Mostrar desactivados" />
            </div>
          </div>
          {visibles.length === 0 ? (
            <div className="card t-label py-10 text-center">Ningún ejercicio coincide con esos filtros.</div>
          ) : (
            <div className="card card-flush overflow-x-auto">
              <table className="table" data-density="compact" aria-label="Ejercicios">
                <thead>
                  <tr>
                    <th scope="col">Ejercicio</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Grupo principal</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Series
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Última vez
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e) => (
                    <tr key={e.id} className="row cursor-pointer" onClick={(ev) => !(ev.target as HTMLElement).closest('button') && setEditando(e.id)}>
                      <td className="max-w-80">
                        <button type="button" onClick={() => setEditando(e.id)} className="flex max-w-full items-center gap-2 text-left font-semibold hover:underline" aria-label={`Editar ${e.title}`}>
                          <span className="truncate" title={e.title}>
                            {e.title}
                          </span>
                          {!e.active && <Tag>Desactivado</Tag>}
                          {e.hyroxStation && (
                            <Tag tono="accent" title={`Estación de HYROX: ${HYROX_STATION_LABEL[e.hyroxStation]}`}>
                              {e.hyroxStation}
                            </Tag>
                          )}
                        </button>
                      </td>
                      <td>{e.category ? <span className="text-ink-2">{CATEGORY_LABEL[e.category]}</span> : <Tag tono="warning" icono={<Warning size={14} weight="fill" aria-hidden />}>{SIN_CLASIFICAR}</Tag>}</td>
                      <td>{e.primaryGroupId !== null ? <span className="text-ink-2">{nombreGrupo.get(e.primaryGroupId) ?? '—'}</span> : <span className="t-meta">Sin grupo</span>}</td>
                      <td className="tnum text-right text-ink-2">{e.setCount}</td>
                      <td className="tnum text-right text-ink-2">{e.lastUsed ? fechaDe(e.lastUsed) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="t-meta mt-4" aria-live="polite">
            {visibles.length} de {lista.length} ejercicios
          </p>
        </>
      )}
      {editando !== null && <EjercicioModal id={editando} ejercicios={lista ?? []} grupos={grupos.data ?? []} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

/* ======================= Editar o crear un ejercicio ======================= */
function EjercicioModal({ id, ejercicios, grupos, onCerrar }: { id: number | 'nuevo'; ejercicios: Exercise[]; grupos: MuscleGroup[]; onCerrar: () => void }) {
  const actual = id === 'nuevo' ? null : (ejercicios.find((e) => e.id === id) ?? null)
  const [titulo, setTitulo] = useState(actual?.title ?? '')
  const [categoria, setCategoria] = useState<ExerciseCategory | ''>(actual?.category ?? '')
  const [medida, setMedida] = useState<MeasureType>(actual?.measure ?? 'WEIGHT_REPS')
  const [corporal, setCorporal] = useState(actual?.isBodyweight ?? false)
  const [activo, setActivo] = useState(actual?.active ?? true)
  const [principal, setPrincipal] = useState<number | ''>(actual?.primaryGroupId ?? '')
  const [secundarios, setSecundarios] = useState<number[]>(actual?.secondaryGroupIds ?? [])
  const [notas, setNotas] = useState(actual?.notes ?? '')
  const [estacion, setEstacion] = useState<HyroxStation | ''>(actual?.hyroxStation ?? '')
  const [alias, setAlias] = useState('')
  const [unirCon, setUnirCon] = useState('')
  const [confirmarUnir, setConfirmarUnir] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const nombre = useRef<HTMLInputElement>(null)

  const guardar = useApiMutation('entreno:exercises.save', { success: id === 'nuevo' ? 'Ejercicio creado' : 'Ejercicio guardado', onSuccess: onCerrar })
  const añadirAlias = useApiMutation('entreno:exercises.addAlias', { onSuccess: () => setAlias('') })
  const quitarAlias = useApiMutation('entreno:exercises.removeAlias', {})
  const unir = useApiMutation('entreno:exercises.merge', { success: (e) => `Unidos: ahora todo está en «${e.title}»`, onSuccess: onCerrar })

  const grupoVisible = (g: MuscleGroup) => g.active || g.id === principal || secundarios.includes(g.id)
  const otros = ejercicios.filter((e) => e.id !== actual?.id).sort((a, b) => a.title.localeCompare(b.title, 'es'))
  const destino = otros.find((e) => String(e.id) === unirCon)
  const errorTitulo = intentado && !titulo.trim() ? 'Ponle un nombre al ejercicio.' : undefined

  const enviar = () => {
    setIntentado(true)
    if (!titulo.trim()) return
    guardar.mutate([
      {
        id: actual?.id ?? null,
        title: titulo.trim(),
        category: categoria || null,
        measure: medida,
        isBodyweight: corporal,
        active: activo,
        notes: notas.trim() || null,
        primaryGroupId: principal === '' ? null : principal,
        secondaryGroupIds: secundarios.filter((g) => g !== principal),
        // Al crear, null deja que se proponga por el nombre; al editar, null la quita.
        hyroxStation: estacion === '' ? null : estacion
      }
    ])
  }

  if (id !== 'nuevo' && !actual) return null

  return (
    <>
      <Modal
        titulo={actual ? actual.title : 'Nuevo ejercicio'}
        descripcion={actual ? `${actual.setCount} ${actual.setCount === 1 ? 'serie' : 'series'} registradas${actual.lastUsed ? ` · última vez el ${fechaDe(actual.lastUsed)}` : ''}` : 'Se añade a tu catálogo.'}
        ancho="lg"
        inicial={nombre}
        onCerrar={onCerrar}
        pie={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={enviar} cargando={guardar.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <TextField ref={nombre} label="Nombre" value={titulo} onChange={(e) => setTitulo(e.target.value)} error={errorTitulo} maxLength={200} autoComplete="off" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as ExerciseCategory | '')}>
              <option value="">{SIN_CLASIFICAR}</option>
              {EXERCISE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
            <Select label="Qué se mide" value={medida} onChange={(e) => setMedida(e.target.value as MeasureType)}>
              {MEASURE_TYPES.map((m) => (
                <option key={m} value={m}>
                  {MEASURE_LABEL[m]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Checkbox checked={corporal} onChange={setCorporal} label="Con peso corporal" ayuda="Dominadas, fondos, flexiones…" />
            <Checkbox checked={activo} onChange={setActivo} label="Activo" ayuda="Desactivado, no sale al apuntar sesiones." />
          </div>

          <fieldset className="flex flex-col gap-4">
            <legend className="t-card-title mb-2">Músculos</legend>
            <Select
              label="Grupo principal"
              value={principal}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value)
                setPrincipal(v)
                setSecundarios((s) => s.filter((x) => x !== v))
              }}
            >
              <option value="">Sin grupo</option>
              {grupos.filter(grupoVisible).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <div>
              <div className="field-label">Grupos secundarios</div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {grupos
                  .filter((g) => grupoVisible(g) && g.id !== principal)
                  .map((g) => (
                    <Checkbox key={g.id} checked={secundarios.includes(g.id)} onChange={(v) => setSecundarios((s) => (v ? [...s, g.id] : s.filter((x) => x !== g.id)))} label={g.name} />
                  ))}
                {grupos.length === 0 && <p className="t-meta">No hay grupos musculares. Créalos en Ajustes › Entreno.</p>}
              </div>
            </div>
          </fieldset>

          <Select
            label="Estación de HYROX"
            value={estacion}
            onChange={(e) => setEstacion(e.target.value as HyroxStation | '')}
            ayuda={actual ? 'Así el Resumen de HYROX sabe qué estación es. Déjala en «Ninguna» si no lo es.' : 'Si la dejas en «Ninguna», se propone sola según el nombre.'}
          >
            <option value="">Ninguna</option>
            {HYROX_STATION_KEYS.map((k) => (
              <option key={k} value={k}>
                {k} · {HYROX_STATION_LABEL[k]}
              </option>
            ))}
          </Select>

          <TextArea label="Notas (opcional)" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />

          {actual && (
            <>
              <section aria-label="Alias" className="border-t border-line pt-6">
                <h3 className="t-card-title mb-1">Otros nombres (alias)</h3>
                <p className="t-label mb-3">Si Hevy cambia el nombre del ejercicio, se reconoce por cualquiera de estos.</p>
                {actual.aliases.length > 0 && (
                  <ul className="mb-3 flex flex-wrap gap-2" aria-label="Alias actuales">
                    {actual.aliases.map((a) => (
                      <li key={a.id}>
                        <Tag className="!pr-1">
                          {a.alias}
                          <IconButton variant="ghost" size="sm" className="!size-6 !min-w-0" etiqueta={`Quitar el alias ${a.alias}`} icono={<X size={12} weight="bold" />} onClick={() => quitarAlias.mutate([a.id])} />
                        </Tag>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (alias.trim()) añadirAlias.mutate([actual.id, alias.trim()])
                  }}
                >
                  <TextField className="flex-1" label="Nuevo alias" tamano="sm" value={alias} onChange={(e) => setAlias(e.target.value)} autoComplete="off" maxLength={200} />
                  <Button size="sm" type="submit" disabled={!alias.trim()} cargando={añadirAlias.isPending}>
                    Añadir
                  </Button>
                </form>
              </section>

              <section aria-label="Unir con otro ejercicio" className="border-t border-line pt-6">
                <h3 className="t-card-title mb-1">Unir con otro ejercicio</h3>
                <p className="t-label mb-3">Para cuando son el mismo ejercicio con dos nombres. Las series pasan al otro.</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Select className="min-w-64 flex-1" label="Unir con" tamano="sm" value={unirCon} onChange={(e) => setUnirCon(e.target.value)}>
                    <option value="">Elige un ejercicio…</option>
                    {otros.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="danger" icon={<ArrowsMerge size={14} aria-hidden />} disabled={!destino} onClick={() => setConfirmarUnir(true)}>
                    Unir…
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </Modal>
      {confirmarUnir && actual && destino && (
        <ConfirmDialog
          titulo={`¿Unir «${actual.title}» con «${destino.title}»?`}
          texto={`Las ${actual.setCount} series de «${actual.title}» pasan a «${destino.title}» y su nombre queda como alias. «${actual.title}» desaparece del catálogo. No se puede deshacer.`}
          confirmar="Unir ejercicios"
          onCancelar={() => setConfirmarUnir(false)}
          onConfirmar={() => {
            setConfirmarUnir(false)
            unir.mutate([actual.id, destino.id])
          }}
        />
      )}
    </>
  )
}
