// Plan › Tipos de entreno: «Fuerza A», «Natación», «Running»… cada uno con su tipo de sesión, alias de Hevy y, si quieres, ejercicios previstos.
import { ArrowDown, ArrowUp, Barbell, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { WORKOUT_KINDS, type Exercise, type Routine, type RoutineItemInput, type WorkoutKind } from '@shared/modules/entreno/types'
import { Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, Modal, Select, Switch, Tag, TextField, Tooltip } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { KIND_LABEL, leerEntero, leerNumero, textoNumero } from './format'
import { ErrorDeServidor } from './PlanPiezas'
import { KindTag } from './Piezas'

export function TiposEntreno() {
  const q = useApi('entreno:routines.list', [])
  const [editando, setEditando] = useState<number | 'nuevo' | null>(null)
  const guardar = useApiMutation('entreno:routines.save', {})
  const ordenar = useApiMutation('entreno:routines.reorder', {})
  const reasignar = useApiMutation('entreno:routines.reapply', { success: (r) => `Asignado a ${r.changed} ${r.changed === 1 ? 'sesión' : 'sesiones'} de ${r.checked}` })
  const lista = q.data

  const mover = (i: number, d: -1 | 1) => {
    const ids = (lista ?? []).map((r) => r.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    ordenar.mutate([ids])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="t-label max-w-3xl">
          Un tipo de entreno es un nombre que usas para planificar («Fuerza A», «Natación», «Running») con su tipo de sesión. Si el título de Hevy coincide con su nombre o con un alias, las sesiones se asignan solas. Los desactivados no se ofrecen al planificar, pero siguen
          viéndose en las semanas pasadas.
        </p>
        <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setEditando('nuevo')}>
          Nuevo tipo de entreno
        </Button>
      </div>
      {lista && lista.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" cargando={reasignar.isPending} onClick={() => reasignar.mutate([])}>
            Asignar a sesiones ya importadas
          </Button>
          <span className="t-meta">Solo se rellenan las sesiones sin tipo de entreno cuyo título coincide con el nombre o con un alias.</span>
        </div>
      )}
      {q.isLoading && <LoadingState filas={4} etiqueta="Cargando los tipos de entreno" />}
      {q.error && (
        <ErrorState
          titulo="No se han podido cargar los tipos de entreno"
          texto={q.error.message}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {lista && lista.length === 0 && (
        <div className="card">
          <EmptyState
            icono={<Barbell size={24} weight="duotone" aria-hidden />}
            titulo="Aún no tienes tipos de entreno"
            texto="Crea los que uses, por ejemplo «Fuerza A», «Fuerza B» o «Natación». Con ellos montas tu semana."
            accion={
              <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setEditando('nuevo')}>
                Crear el primero
              </Button>
            }
          />
        </div>
      )}
      {lista && lista.length > 0 && (
        <ul className="divide-line r-card border border-line bg-card" aria-label="Tipos de entreno">
          {lista.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={`t-body max-w-full truncate text-left font-semibold hover:underline ${r.active ? '' : 'text-ink-3'}`} onClick={() => setEditando(r.id)} title={r.name} aria-label={`Editar ${r.name}`}>
                    {r.name}
                  </button>
                  <KindTag kind={r.kind} />
                  {!r.active && <Tag>Desactivado</Tag>}
                </div>
                <p className="t-meta">
                  {r.workoutCount} {r.workoutCount === 1 ? 'sesión' : 'sesiones'}
                  {r.items.length > 0 && ` · ${r.items.length} ${r.items.length === 1 ? 'ejercicio previsto' : 'ejercicios previstos'}`}
                  {r.aliases.length > 0 && ` · Alias: ${r.aliases.map((a) => a.alias).join(', ')}`}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Switch checked={r.active} label={`${r.name} activo`} onChange={(v) => guardar.mutate([{ id: r.id, name: r.name, kind: r.kind, description: r.description, active: v }])} />
                <span className="t-meta w-20">{r.active ? 'Activo' : 'Desactivado'}</span>
              </span>
              <span className="flex items-center gap-1">
                <IconButton variant="ghost" size="sm" etiqueta={`Subir ${r.name} en la lista`} icono={<ArrowUp size={16} />} disabled={i === 0 || ordenar.isPending} onClick={() => mover(i, -1)} />
                <IconButton variant="ghost" size="sm" etiqueta={`Bajar ${r.name} en la lista`} icono={<ArrowDown size={16} />} disabled={i === lista.length - 1 || ordenar.isPending} onClick={() => mover(i, 1)} />
                <Tooltip texto="Editar">
                  <IconButton variant="ghost" size="sm" etiqueta={`Editar ${r.name}`} icono={<PencilSimple size={16} />} onClick={() => setEditando(r.id)} />
                </Tooltip>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editando !== null && <TipoModal id={editando} lista={lista ?? []} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

/* ======================= Editar o crear ======================= */
type ItemForm = { key: number; exerciseId: number; series: string; repsMin: string; repsMax: string; rpe: string; notes: string | null }
let clave = 1

function TipoModal({ id, lista, onCerrar }: { id: number | 'nuevo'; lista: Routine[]; onCerrar: () => void }) {
  const actual = id === 'nuevo' ? null : (lista.find((r) => r.id === id) ?? null)
  const ejercicios = useApi('entreno:exercises.list', [])
  const [nombre, setNombre] = useState(actual?.name ?? '')
  const [tipo, setTipo] = useState<WorkoutKind>(actual?.kind ?? 'GYM')
  const [descripcion, setDescripcion] = useState(actual?.description ?? '')
  const [activo, setActivo] = useState(actual?.active ?? true)
  const [alias, setAlias] = useState<string[]>(actual?.aliases.map((a) => a.alias) ?? [])
  const [nuevoAlias, setNuevoAlias] = useState('')
  const [items, setItems] = useState<ItemForm[]>(() =>
    (actual?.items ?? []).map((i) => ({ key: clave++, exerciseId: i.exerciseId, series: textoNumero(i.targetSets), repsMin: textoNumero(i.repsMin), repsMax: textoNumero(i.repsMax), rpe: textoNumero(i.targetRpe), notes: i.notes }))
  )
  const [nuevoEjercicio, setNuevoEjercicio] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const inicial = useRef<HTMLInputElement>(null)

  const guardar = useApiMutation('entreno:routines.save', { success: id === 'nuevo' ? 'Tipo de entreno creado' : 'Tipo de entreno guardado', onSuccess: onCerrar })
  const borrar = useApiMutation('entreno:routines.delete', { success: 'Tipo de entreno borrado', silentError: true, onSuccess: onCerrar })

  const catalogo = ejercicios.data ?? []
  const nombreEj = (eid: number) => catalogo.find((e) => e.id === eid)?.title ?? `Ejercicio ${eid}`
  const disponibles = catalogo.filter((e: Exercise) => e.active && !items.some((i) => i.exerciseId === e.id)).sort((a, b) => a.title.localeCompare(b.title, 'es'))

  const errorNombre = intentado && !nombre.trim() ? 'Ponle un nombre al tipo de entreno.' : undefined
  const duplicado = lista.some((r) => r.id !== actual?.id && r.name.trim().toLowerCase() === nombre.trim().toLowerCase())

  const leerItem = (i: ItemForm): RoutineItemInput | string => {
    const targetSets = leerEntero(i.series)
    const repsMin = leerEntero(i.repsMin)
    const repsMax = leerEntero(i.repsMax)
    const targetRpe = leerNumero(i.rpe)
    const malo = [targetSets, repsMin, repsMax, targetRpe].some((n) => n !== null && (Number.isNaN(n) || n <= 0))
    if (malo) return `Revisa los números de «${nombreEj(i.exerciseId)}»: tienen que ser positivos.`
    if (repsMin !== null && repsMax !== null && repsMin > repsMax) return `En «${nombreEj(i.exerciseId)}», las repeticiones mínimas no pueden pasar de las máximas.`
    if (targetRpe !== null && targetRpe > 10) return `En «${nombreEj(i.exerciseId)}», el RPE va de 1 a 10.`
    return { exerciseId: i.exerciseId, targetSets, repsMin, repsMax, targetRpe, notes: i.notes }
  }
  const leidos = items.map(leerItem)
  const errorItems = leidos.find((x): x is string => typeof x === 'string')

  const enviar = (forzarActivo?: boolean) => {
    setIntentado(true)
    if (!nombre.trim() || errorItems) return
    guardar.mutate([
      {
        id: actual?.id ?? null,
        name: nombre.trim(),
        kind: tipo,
        description: descripcion.trim() || null,
        active: forzarActivo ?? activo,
        aliases: alias,
        items: leidos as RoutineItemInput[]
      }
    ])
  }

  const añadirAlias = () => {
    const a = nuevoAlias.trim()
    if (!a) return
    if (!alias.some((x) => x.toLowerCase() === a.toLowerCase())) setAlias([...alias, a])
    setNuevoAlias('')
  }
  const cambiarItem = (key: number, parcial: Partial<ItemForm>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...parcial } : i)))

  if (id !== 'nuevo' && !actual) return null

  return (
    <>
      <Modal
        titulo={actual ? actual.name : 'Nuevo tipo de entreno'}
        descripcion={actual ? `${actual.workoutCount} ${actual.workoutCount === 1 ? 'sesión asignada' : 'sesiones asignadas'}` : 'Lo usarás para montar tu semana.'}
        ancho="lg"
        inicial={inicial}
        onCerrar={onCerrar}
        pie={
          <>
            {actual && (
              <Button variant="danger" className="mr-auto" icon={<Trash size={16} aria-hidden />} onClick={() => (setErrorBorrado(null), setConfirmarBorrar(true))}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => enviar()} cargando={guardar.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {errorBorrado && (
            <ErrorDeServidor texto={errorBorrado}>
              {activo && (
                <div>
                  <Button size="sm" onClick={() => enviar(false)} cargando={guardar.isPending}>
                    Desactivar en su lugar
                  </Button>
                </div>
              )}
            </ErrorDeServidor>
          )}
          <TextField ref={inicial} label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errorNombre} ayuda={duplicado ? 'Ya tienes otro tipo con este nombre.' : undefined} maxLength={100} autoComplete="off" placeholder="Fuerza A, Natación, Running…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Tipo de sesión" value={tipo} onChange={(e) => setTipo(e.target.value as WorkoutKind)} ayuda="Qué clase de sesión es.">
              {WORKOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <div className="pt-6">
              <Checkbox checked={activo} onChange={setActivo} label="Activo" ayuda="Desactivado, no se ofrece al planificar." />
            </div>
          </div>
          <TextField label="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoComplete="off" />

          <section aria-label="Alias" className="border-t border-line pt-6">
            <h3 className="t-card-title mb-1">Alias de Hevy</h3>
            <p className="t-label mb-3">Otros títulos de Hevy que cuentan como este tipo de entreno al importar. El nombre ya cuenta, no hace falta repetirlo.</p>
            {alias.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2" aria-label="Alias actuales">
                {alias.map((a) => (
                  <li key={a}>
                    <Tag className="!pr-1">
                      {a}
                      <IconButton variant="ghost" size="sm" className="!size-6 !min-w-0" etiqueta={`Quitar el alias ${a}`} icono={<X size={12} weight="bold" />} onClick={() => setAlias(alias.filter((x) => x !== a))} />
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <TextField
                className="flex-1"
                label="Nuevo alias"
                tamano="sm"
                value={nuevoAlias}
                onChange={(e) => setNuevoAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.preventDefault(), añadirAlias())
                }}
                autoComplete="off"
                maxLength={200}
              />
              <Button size="sm" disabled={!nuevoAlias.trim()} onClick={añadirAlias}>
                Añadir
              </Button>
            </div>
          </section>

          <section aria-label="Ejercicios previstos" className="border-t border-line pt-6">
            <h3 className="t-card-title mb-1">Ejercicios previstos (opcional)</h3>
            <p className="t-label mb-3">Una guía de lo que sueles hacer. No cambia lo que registras ni el plan de la semana.</p>
            {items.length > 0 && (
              <ul className="mb-3 flex flex-col gap-3">
                {items.map((i) => (
                  <li key={i.key} className="r-control border border-line bg-raised p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="t-body min-w-0 truncate font-semibold" title={nombreEj(i.exerciseId)}>
                        {nombreEj(i.exerciseId)}
                      </span>
                      <IconButton variant="ghost" size="sm" etiqueta={`Quitar ${nombreEj(i.exerciseId)}`} icono={<X size={14} weight="bold" />} onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <TextField label="Series" tamano="sm" inputMode="numeric" value={i.series} onChange={(e) => cambiarItem(i.key, { series: e.target.value })} className="[&_input]:tabular-nums" />
                      <TextField label="Reps mín." tamano="sm" inputMode="numeric" value={i.repsMin} onChange={(e) => cambiarItem(i.key, { repsMin: e.target.value })} className="[&_input]:tabular-nums" />
                      <TextField label="Reps máx." tamano="sm" inputMode="numeric" value={i.repsMax} onChange={(e) => cambiarItem(i.key, { repsMax: e.target.value })} className="[&_input]:tabular-nums" />
                      <TextField label="RPE" tamano="sm" inputMode="decimal" value={i.rpe} onChange={(e) => cambiarItem(i.key, { rpe: e.target.value })} className="[&_input]:tabular-nums" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {errorItems && (
              <p className="field-error mb-3" role="alert">
                {errorItems}
              </p>
            )}
            <div className="flex items-end gap-2">
              <Select className="min-w-64 flex-1" label="Añadir ejercicio" tamano="sm" value={nuevoEjercicio} onChange={(e) => setNuevoEjercicio(e.target.value)}>
                <option value="">Elige un ejercicio…</option>
                {disponibles.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                icon={<Plus size={14} weight="bold" aria-hidden />}
                disabled={!nuevoEjercicio}
                onClick={() => {
                  setItems((l) => [...l, { key: clave++, exerciseId: Number(nuevoEjercicio), series: '', repsMin: '', repsMax: '', rpe: '', notes: null }])
                  setNuevoEjercicio('')
                }}
              >
                Añadir
              </Button>
            </div>
          </section>
        </div>
      </Modal>
      {confirmarBorrar && actual && (
        <ConfirmDialog
          titulo={`¿Borrar «${actual.name}»?`}
          texto={
            actual.workoutCount > 0
              ? `Tiene ${actual.workoutCount} ${actual.workoutCount === 1 ? 'sesión asignada' : 'sesiones asignadas'}, así que probablemente no se podrá borrar. Si solo quieres dejar de usarlo, desactívalo.`
              : 'Se quita de tu lista. Si está en el boceto o en alguna semana, no se podrá borrar y te lo diremos. No se puede deshacer.'
          }
          confirmar="Borrar tipo de entreno"
          onCancelar={() => setConfirmarBorrar(false)}
          onConfirmar={() => {
            setConfirmarBorrar(false)
            borrar.mutate([actual.id], { onError: (e) => setErrorBorrado(e.message) })
          }}
        />
      )}
    </>
  )
}
