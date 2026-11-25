import { ArrowLeft, Info, PencilSimple, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { WORKOUT_KINDS, type WorkoutDetail, type WorkoutExercise, type WorkoutExtrasInput, type WorkoutKind } from '@shared/modules/entreno/types'
import { Button, ConfirmDialog, ErrorState, LoadingState, PageHeader, Select, Tag, TextArea } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { fechaDe, formatDistancia, formatDuracion, formatKg, formatNum, formatTiempo, horaDe, KIND_LABEL, SET_TYPE_LABEL } from './format'
import { KindTag, OrigenTag, resumenContenido } from './Piezas'

/** Entreno · detalle de una sesión: ejercicios con sus series y los campos propios (tipo, esfuerzo, notas). */
export function SesionDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const wid = Number(id)
  const q = useApi('entreno:workouts.get', [wid], { enabled: Number.isInteger(wid) && wid > 0, retry: false })
  const [confirmar, setConfirmar] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const borrar = useApiMutation('entreno:workouts.delete', { success: 'Sesión borrada' })

  const atras = (
    <Link to="/entreno/sesiones" className="t-label mb-4 inline-flex items-center gap-1 font-semibold text-accent-text hover:underline">
      <ArrowLeft size={16} aria-hidden /> Sesiones
    </Link>
  )
  if (q.isLoading || borrando)
    return (
      <div>
        {atras}
        <LoadingState filas={4} etiqueta={borrando ? 'Borrando la sesión' : 'Cargando la sesión'} />
      </div>
    )
  if (q.error || !q.data)
    return (
      <div>
        {atras}
        <ErrorState titulo="No se ha podido abrir la sesión" texto={q.error?.message ?? 'Puede que ya no exista.'} />
      </div>
    )
  const w = q.data
  const hevy = w.source === 'HEVY'
  const horario = `${fechaDe(w.startTime)} · ${horaDe(w.startTime)}${w.endTime ? `–${horaDe(w.endTime)}` : ''}`

  return (
    <div>
      {atras}
      <PageHeader
        titulo={w.title}
        texto={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tnum">{horario}</span>
            {w.durationSeconds !== null && <span className="tnum">{formatDuracion(w.durationSeconds)}</span>}
            <span>{resumenContenido(w)}</span>
            <KindTag kind={w.kind} />
            <OrigenTag source={w.source} />
          </span>
        }
        acciones={
          <>
            {!hevy && (
              <Button icon={<PencilSimple size={16} aria-hidden />} onClick={() => navigate(`/entreno/sesiones/${w.id}/editar`)}>
                Editar
              </Button>
            )}
            <Button variant="danger" icon={<Trash size={16} aria-hidden />} onClick={() => setConfirmar(true)}>
              Borrar
            </Button>
          </>
        }
      />
      <div className="page-grid">
        <div className="col-span-12 flex flex-col gap-4 @4xl:col-span-8">
          {w.description && (
            <section aria-label="Descripción" className="card">
              <p className="t-body whitespace-pre-line">{w.description}</p>
            </section>
          )}
          {hevy && (
            <p className="t-meta flex items-center gap-2">
              <Info size={16} aria-hidden className="shrink-0" />
              Series de Hevy, solo lectura. Se corrigen en Hevy y se reimportan.
            </p>
          )}
          {w.exercises.length === 0 && <p className="t-label">Esta sesión no tiene ejercicios.</p>}
          {w.exercises.map((e) => (
            <EjercicioSesion key={e.exerciseOrder} e={e} />
          ))}
        </div>
        <div className="col-span-12 @4xl:col-span-4">
          <ValoracionCard key={w.updatedAt} w={w} />
        </div>
      </div>
      {confirmar && (
        <ConfirmDialog
          titulo="¿Borrar esta sesión?"
          texto={
            hevy
              ? `Se borra «${w.title}» con sus ejercicios y series, y también lo que hayas anotado. Si vuelves a importar un archivo de Hevy que la incluya, aparecerá otra vez. No se puede deshacer.`
              : `Se borra «${w.title}» con sus ejercicios y series. No se puede deshacer.`
          }
          confirmar="Borrar sesión"
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => {
            setConfirmar(false)
            setBorrando(true)
            borrar.mutate([w.id], { onSuccess: () => navigate('/entreno/sesiones', { replace: true }), onError: () => setBorrando(false) })
          }}
        />
      )}
    </div>
  )
}

/** Un ejercicio de la sesión con sus series. Solo salen las columnas que tienen algún dato. */
function EjercicioSesion({ e }: { e: WorkoutExercise }) {
  const hay = (f: (s: WorkoutExercise['sets'][number]) => unknown) => e.sets.some((s) => f(s) !== null)
  const cols = {
    peso: hay((s) => s.weightKg),
    reps: hay((s) => s.reps),
    dist: hay((s) => s.distanceKm),
    tiempo: hay((s) => s.durationSeconds),
    rpe: hay((s) => s.rpe),
    notas: hay((s) => s.notes)
  }
  const importadoComo = e.exerciseTitle !== e.catalogTitle
  return (
    <section aria-label={e.catalogTitle} className="card">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="t-body font-semibold">{e.catalogTitle}</h3>
        {e.supersetId && <Tag>Superserie {e.supersetId}</Tag>}
        {importadoComo && <span className="t-meta">Importado como «{e.exerciseTitle}»</span>}
        <span className="t-meta ml-auto">
          {e.sets.length} {e.sets.length === 1 ? 'serie' : 'series'}
        </span>
      </div>
      {e.exerciseNotes && <p className="t-label mb-3 whitespace-pre-line">{e.exerciseNotes}</p>}
      <div className="-mx-4 -mb-4 overflow-x-auto">
        <table className="table" data-density="compact" aria-label={`Series de ${e.catalogTitle}`}>
          <thead>
            <tr>
              <th scope="col">Serie</th>
              <th scope="col">Tipo</th>
              {cols.peso && <th scope="col" style={{ textAlign: 'right' }}>Peso</th>}
              {cols.reps && <th scope="col" style={{ textAlign: 'right' }}>Reps</th>}
              {cols.dist && <th scope="col" style={{ textAlign: 'right' }}>Distancia</th>}
              {cols.tiempo && <th scope="col" style={{ textAlign: 'right' }}>Tiempo</th>}
              {cols.rpe && <th scope="col" style={{ textAlign: 'right' }}>RPE</th>}
              {cols.notas && <th scope="col">Nota</th>}
            </tr>
          </thead>
          <tbody>
            {e.sets.map((s, i) => (
              <tr key={s.id}>
                <td className="tnum text-ink-2">{i + 1}</td>
                <td className={s.setType === 'normal' ? 'text-ink-3' : 'font-semibold'}>{SET_TYPE_LABEL[s.setType]}</td>
                {cols.peso && <td className="tnum text-right">{formatKg(s.weightKg)}</td>}
                {cols.reps && <td className="tnum text-right">{formatNum(s.reps)}</td>}
                {cols.dist && <td className="tnum text-right">{formatDistancia(s.distanceKm)}</td>}
                {cols.tiempo && <td className="tnum text-right">{formatTiempo(s.durationSeconds)}</td>}
                {cols.rpe && <td className="tnum text-right">{formatNum(s.rpe)}</td>}
                {cols.notas && <td className="t-label">{s.notes ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const ESFUERZOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Lo que es tuyo en cualquier sesión (también las de Hevy): tipo, esfuerzo percibido y notas. */
function ValoracionCard({ w }: { w: WorkoutDetail }) {
  const [tipo, setTipo] = useState<'' | WorkoutKind>(w.kindManual ? w.kind : '')
  const [esfuerzo, setEsfuerzo] = useState(w.perceivedEffort === null ? '' : String(w.perceivedEffort))
  const [notas, setNotas] = useState(w.notes ?? '')
  const rutinaInicial = w.routineId === null ? '' : String(w.routineId)
  const [rutina, setRutina] = useState(rutinaInicial)
  const rutinas = useApi('entreno:routines.list', [])
  const guardar = useApiMutation('entreno:workouts.updateExtras', { success: 'Cambios guardados' })
  // Los activos y, si ya lo tiene asignado, ese aunque esté desactivado
  const opcionesRutina = (rutinas.data ?? []).filter((r) => r.active || String(r.id) === rutinaInicial)

  const tipoInicial = w.kindManual ? w.kind : ''
  const esfuerzoInicial = w.perceivedEffort === null ? '' : String(w.perceivedEffort)
  const notasIniciales = w.notes ?? ''
  const cambios: Omit<WorkoutExtrasInput, 'id'> = {}
  if (tipo !== tipoInicial) cambios.kind = tipo === '' ? null : tipo
  if (rutina !== rutinaInicial) cambios.routineId = rutina === '' ? null : Number(rutina)
  if (esfuerzo !== esfuerzoInicial) cambios.perceivedEffort = esfuerzo === '' ? null : Number(esfuerzo)
  if (notas !== notasIniciales) cambios.notes = notas.trim() === '' ? null : notas.trim()
  const sucio = Object.keys(cambios).length > 0

  return (
    <form
      className="card flex flex-col gap-4"
      aria-label="Tu valoración de la sesión"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (sucio) guardar.mutate([{ id: w.id, ...cambios }])
      }}
    >
      <h2 className="t-card-title">Tu valoración</h2>
      <Select
        label="Tipo de sesión"
        value={tipo}
        onChange={(ev) => setTipo(ev.target.value as '' | WorkoutKind)}
        ayuda={tipo === '' ? `Automático: ahora es «${KIND_LABEL[w.kind]}» según tus reglas.` : 'Lo has fijado tú: las reglas ya no lo cambian.'}
      >
        <option value="">Automático</option>
        {WORKOUT_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </Select>
      <Select
        label="Tipo de entreno"
        value={rutina}
        onChange={(ev) => setRutina(ev.target.value)}
        ayuda={rutina === '' ? 'Sin tipo de entreno, cuenta el tipo de sesión del mismo día.' : 'Así cuenta como hecha esta sesión en el plan de su semana.'}
      >
        <option value="">Ninguno</option>
        {opcionesRutina.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} · {KIND_LABEL[r.kind]}
            {r.active ? '' : ' (desactivado)'}
          </option>
        ))}
      </Select>
      <Select label="Esfuerzo percibido" value={esfuerzo} onChange={(ev) => setEsfuerzo(ev.target.value)} ayuda="De 1 (muy suave) a 10 (máximo).">
        <option value="">Sin valorar</option>
        {ESFUERZOS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      <TextArea label="Notas" value={notas} onChange={(ev) => setNotas(ev.target.value)} rows={4} placeholder="Cómo te has sentido, qué cambiarías…" />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={!sucio} cargando={guardar.isPending}>
          Guardar cambios
        </Button>
        {!sucio && <span className="t-meta">Sin cambios</span>}
      </div>
    </form>
  )
}
