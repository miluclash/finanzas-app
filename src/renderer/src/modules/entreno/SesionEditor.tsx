import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  SET_TYPES,
  WORKOUT_KINDS,
  type Exercise,
  type ManualExerciseInput,
  type ManualWorkoutInput,
  type MeasureType,
  type SetType,
  type WorkoutDetail,
  type WorkoutKind
} from '@shared/modules/entreno/types'
import { Aviso, Button, ErrorState, IconButton, LoadingState, PageHeader, Select, Tag, TextArea, TextField, Tooltip } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { ElegirEjercicio } from './ElegirEjercicio'
import { KIND_LABEL, leerDistanciaKm, leerEntero, leerNumero, leerTiempo, SET_TYPE_LABEL, textoDistancia, textoNumero, textoTiempo } from './format'

/* ======================= Modelo del formulario (todo en texto, como se escribe) ======================= */
type Campo = 'peso' | 'reps' | 'dist' | 'tiempo' | 'rpe'
const CAMPOS: Campo[] = ['peso', 'reps', 'dist', 'tiempo', 'rpe']
const CAMPO_LABEL: Record<Campo, string> = { peso: 'Peso', reps: 'Reps', dist: 'Distancia', tiempo: 'Tiempo', rpe: 'RPE' }
/** Qué campos salen por defecto según lo que mide el ejercicio. «Más campos» enseña todos. */
const CAMPOS_MEDIDA: Record<MeasureType, Campo[]> = {
  WEIGHT_REPS: ['peso', 'reps', 'rpe'],
  REPS: ['reps'],
  DURATION: ['tiempo'],
  WEIGHT_DURATION: ['peso', 'tiempo'],
  DISTANCE_DURATION: ['dist', 'tiempo'],
  WEIGHT_DISTANCE: ['peso', 'dist']
}

type SerieForm = { key: number; setType: SetType } & Record<Campo, string>
type EjercicioForm = { key: number; exerciseId: number; titulo: string; measure: MeasureType; supersetId: string | null; notas: string; mas: boolean; series: SerieForm[] }
type Form = { titulo: string; inicio: string; fin: string; tipo: '' | WorkoutKind; descripcion: string; esfuerzo: string; notas: string; ejercicios: EjercicioForm[] }

let contador = 1
const nuevaClave = () => contador++
const serieVacia = (): SerieForm => ({ key: nuevaClave(), setType: 'normal', peso: '', reps: '', dist: '', tiempo: '', rpe: '' })

/** `YYYY-MM-DDTHH:mm` de ahora, redondeado al minuto. */
function ahoraLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function formDesde(w: WorkoutDetail, catalogo: Exercise[]): Form {
  return {
    titulo: w.title,
    inicio: w.startTime,
    fin: w.endTime ?? '',
    tipo: w.kindManual ? w.kind : '',
    descripcion: w.description ?? '',
    esfuerzo: w.perceivedEffort === null ? '' : String(w.perceivedEffort),
    notas: w.notes ?? '',
    ejercicios: w.exercises.map((e) => ({
      key: nuevaClave(),
      exerciseId: e.exerciseId,
      titulo: e.catalogTitle,
      measure: catalogo.find((c) => c.id === e.exerciseId)?.measure ?? 'WEIGHT_REPS',
      supersetId: e.supersetId,
      notas: e.exerciseNotes ?? '',
      mas: false,
      series: e.sets.map((s) => ({
        key: nuevaClave(),
        setType: s.setType,
        peso: textoNumero(s.weightKg),
        reps: textoNumero(s.reps),
        dist: textoDistancia(s.distanceKm),
        tiempo: textoTiempo(s.durationSeconds),
        rpe: textoNumero(s.rpe)
      }))
    }))
  }
}

type Problema = { id: string; texto: string }
/** Comprueba el formulario y, si está bien, lo convierte en lo que espera el proceso principal. */
function validar(f: Form, original: WorkoutDetail | null): { problemas: Problema[]; input: ManualWorkoutInput | null } {
  const problemas: Problema[] = []
  const mal = (id: string, texto: string) => problemas.push({ id, texto })
  if (!f.titulo.trim()) mal('titulo', 'Ponle un título a la sesión.')
  if (!f.inicio) mal('inicio', 'Indica cuándo empezó.')
  if (f.fin && f.inicio && f.fin < f.inicio) mal('fin', 'El final tiene que ser posterior al inicio.')
  if (f.ejercicios.length === 0) mal('ejercicios', 'Añade al menos un ejercicio.')
  const ejercicios: ManualExerciseInput[] = f.ejercicios.map((e) => {
    if (e.series.length === 0) mal(`e${e.key}`, `«${e.titulo}» necesita al menos una serie.`)
    const sets = e.series.map((s, i) => {
      const donde = `«${e.titulo}», serie ${i + 1}`
      const peso = leerNumero(s.peso)
      const reps = leerEntero(s.reps)
      const dist = leerDistanciaKm(s.dist)
      const tiempo = leerTiempo(s.tiempo)
      const rpe = leerNumero(s.rpe)
      if (Number.isNaN(peso)) mal(`s${s.key}-peso`, `${donde}: escribe el peso como un número, por ejemplo 82,5.`)
      if (Number.isNaN(reps)) mal(`s${s.key}-reps`, `${donde}: las repeticiones son un número entero, por ejemplo 8.`)
      if (Number.isNaN(dist)) mal(`s${s.key}-dist`, `${donde}: la distancia se escribe como 400, 400 m o 5 km.`)
      if (Number.isNaN(tiempo)) mal(`s${s.key}-tiempo`, `${donde}: el tiempo se escribe como 2:30 o en segundos.`)
      if (Number.isNaN(rpe) || (rpe !== null && (rpe < 1 || rpe > 10))) mal(`s${s.key}-rpe`, `${donde}: el RPE va de 1 a 10.`)
      return { setType: s.setType, weightKg: peso, reps, distanceKm: dist, durationSeconds: tiempo, rpe }
    })
    return { exerciseId: e.exerciseId, supersetId: e.supersetId, exerciseNotes: e.notas.trim() || null, sets }
  })
  if (problemas.length > 0) return { problemas, input: null }
  return {
    problemas,
    input: {
      id: original?.id ?? null,
      title: f.titulo.trim(),
      startTime: f.inicio,
      endTime: f.fin || null,
      description: f.descripcion.trim() || null,
      kind: f.tipo === '' ? null : f.tipo,
      perceivedEffort: f.esfuerzo === '' ? null : Number(f.esfuerzo),
      notes: f.notas.trim() || null,
      blockId: original?.blockId ?? null,
      routineId: original?.routineId ?? null,
      exercises: ejercicios
    }
  }
}

/* ======================= Página ======================= */
/** Entreno · apuntar una sesión a mano o editar una manual. Pensada para natación (repeticiones = largos, distancia opcional) pero vale para cualquier tipo. */
export function SesionEditorPage() {
  const { id } = useParams()
  const editar = id !== undefined
  const wid = Number(id)
  const sesion = useApi('entreno:workouts.get', [wid], { enabled: editar && Number.isInteger(wid), retry: false })
  const catalogo = useApi('entreno:exercises.list', [])

  const atras = (
    <Link to={editar ? `/entreno/sesiones/${id}` : '/entreno/sesiones'} className="t-label mb-4 inline-flex items-center gap-1 font-semibold text-accent-text hover:underline">
      <ArrowLeft size={16} aria-hidden /> {editar ? 'Volver a la sesión' : 'Sesiones'}
    </Link>
  )
  if ((editar && sesion.isLoading) || catalogo.isLoading)
    return (
      <div>
        {atras}
        <LoadingState filas={4} etiqueta="Cargando el formulario" />
      </div>
    )
  const error = (editar && sesion.error) || catalogo.error
  if (error || !catalogo.data || (editar && !sesion.data))
    return (
      <div>
        {atras}
        <ErrorState titulo="No se ha podido abrir el formulario" texto={error?.message ?? 'Inténtalo de nuevo.'} />
      </div>
    )
  if (editar && sesion.data?.source !== 'MANUAL')
    return (
      <div>
        {atras}
        <Aviso tono="info">Las sesiones de Hevy no se editan aquí. Se corrigen en Hevy y se reimportan.</Aviso>
      </div>
    )
  return <Editor key={sesion.data?.updatedAt ?? 'nueva'} original={editar ? (sesion.data ?? null) : null} catalogo={catalogo.data} atras={atras} />
}

function Editor({ original, catalogo, atras }: { original: WorkoutDetail | null; catalogo: Exercise[]; atras: React.ReactNode }) {
  const navigate = useNavigate()
  const [f, setF] = useState<Form>(() => (original ? formDesde(original, catalogo) : { titulo: '', inicio: ahoraLocal(), fin: '', tipo: '', descripcion: '', esfuerzo: '', notas: '', ejercicios: [] }))
  const [intentado, setIntentado] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const resumen = useRef<HTMLDivElement>(null)
  const guardar = useApiMutation('entreno:workouts.saveManual', { success: 'Sesión guardada', onSuccess: (w) => navigate(`/entreno/sesiones/${w.id}`, { replace: true }) })

  const { problemas, input } = validar(f, original)
  const error = (id: string) => (intentado ? problemas.find((p) => p.id === id)?.texto : undefined)
  const invalido = (id: string) => (intentado && problemas.some((p) => p.id === id) ? true : undefined)

  const cambia = (parcial: Partial<Form>) => setF((a) => ({ ...a, ...parcial }))
  const cambiaEj = (key: number, fn: (e: EjercicioForm) => EjercicioForm) => setF((a) => ({ ...a, ejercicios: a.ejercicios.map((e) => (e.key === key ? fn(e) : e)) }))
  const mover = (i: number, d: -1 | 1) =>
    setF((a) => {
      const l = [...a.ejercicios]
      ;[l[i], l[i + d]] = [l[i + d], l[i]]
      return { ...a, ejercicios: l }
    })
  const añadirEjercicio = (e: Exercise) => {
    setEligiendo(false)
    setF((a) => ({ ...a, ejercicios: [...a.ejercicios, { key: nuevaClave(), exerciseId: e.id, titulo: e.title, measure: e.measure, supersetId: null, notas: '', mas: false, series: [serieVacia()] }] }))
  }

  return (
    <>
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault()
        setIntentado(true)
        if (input) guardar.mutate([input])
        else window.setTimeout(() => resumen.current?.focus(), 0)
      }}
    >
      {atras}
      <PageHeader titulo={original ? 'Editar sesión' : 'Nueva sesión'} texto="Apunta lo que has hecho. En natación, las repeticiones son los largos o las series y la distancia es opcional." />

      <div className="flex flex-col gap-6">
        <section aria-label="Datos de la sesión" className="card">
          <div className="grid gap-4 @2xl:grid-cols-6">
            <TextField className="@2xl:col-span-4" label="Título" value={f.titulo} onChange={(e) => cambia({ titulo: e.target.value })} error={error('titulo')} maxLength={200} placeholder="Natación técnica, Torso A…" autoComplete="off" />
            <Select className="@2xl:col-span-2" label="Tipo de sesión" value={f.tipo} onChange={(e) => cambia({ tipo: e.target.value as '' | WorkoutKind })} ayuda={f.tipo === '' ? 'Automático: lo deciden tus reglas.' : undefined}>
              <option value="">Automático</option>
              {WORKOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <TextField className="@2xl:col-span-3" label="Inicio" type="datetime-local" value={f.inicio} onChange={(e) => cambia({ inicio: e.target.value })} error={error('inicio')} />
            <TextField className="@2xl:col-span-3" label="Fin (opcional)" type="datetime-local" value={f.fin} min={f.inicio || undefined} onChange={(e) => cambia({ fin: e.target.value })} error={error('fin')} />
            <TextArea className="@2xl:col-span-6" label="Descripción (opcional)" rows={2} value={f.descripcion} onChange={(e) => cambia({ descripcion: e.target.value })} />
          </div>
        </section>

        <section aria-label="Ejercicios" className="flex flex-col gap-4">
          {f.ejercicios.map((e, i) => (
            <EjercicioCard
              key={e.key}
              e={e}
              primero={i === 0}
              ultimo={i === f.ejercicios.length - 1}
              intentado={intentado}
              problemas={problemas}
              onCambia={(fn) => cambiaEj(e.key, fn)}
              onMover={(d) => mover(i, d)}
              onQuitar={() => setF((a) => ({ ...a, ejercicios: a.ejercicios.filter((x) => x.key !== e.key) }))}
            />
          ))}
          {error('ejercicios') && (
            <p className="field-error">
              {error('ejercicios')}
            </p>
          )}
          <div>
            <Button icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setEligiendo(true)}>
              Añadir ejercicio
            </Button>
          </div>
        </section>

        <section aria-label="Esfuerzo y notas" className="card">
          <div className="grid gap-4 @2xl:grid-cols-6">
            <Select className="@2xl:col-span-2" label="Esfuerzo percibido (opcional)" value={f.esfuerzo} onChange={(e) => cambia({ esfuerzo: e.target.value })} ayuda="De 1 (muy suave) a 10 (máximo).">
              <option value="">Sin valorar</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <TextArea className="@2xl:col-span-4" label="Notas (opcional)" rows={2} value={f.notas} onChange={(e) => cambia({ notas: e.target.value })} />
          </div>
        </section>

        {intentado && problemas.length > 0 && (
          <div ref={resumen} tabIndex={-1} className="outline-none">
            <Aviso tono="error">
              <div className="font-semibold">Revisa esto antes de guardar:</div>
              <ul className="list-disc pl-4">
                {problemas.map((p) => (
                  <li key={p.id}>{p.texto}</li>
                ))}
              </ul>
            </Aviso>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(original ? `/entreno/sesiones/${original.id}` : '/entreno/sesiones')}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" cargando={guardar.isPending}>
            {original ? 'Guardar cambios' : 'Guardar sesión'}
          </Button>
        </div>
      </div>
    </form>
    {/* Fuera del formulario: los eventos de un portal suben por el árbol de React y su «enviar» guardaría la sesión */}
    {eligiendo && <ElegirEjercicio catalogo={catalogo} tipo={f.tipo === '' ? null : f.tipo} onElegir={añadirEjercicio} onCerrar={() => setEligiendo(false)} />}
    </>
  )
}

/* ======================= Un ejercicio con sus series ======================= */
function EjercicioCard({
  e,
  primero,
  ultimo,
  intentado,
  problemas,
  onCambia,
  onMover,
  onQuitar
}: {
  e: EjercicioForm
  primero: boolean
  ultimo: boolean
  intentado: boolean
  problemas: Problema[]
  onCambia: (fn: (e: EjercicioForm) => EjercicioForm) => void
  onMover: (d: -1 | 1) => void
  onQuitar: () => void
}) {
  const visibles = CAMPOS.filter((c) => e.mas || CAMPOS_MEDIDA[e.measure].includes(c) || e.series.some((s) => s[c].trim() !== ''))
  const malo = (id: string) => (intentado && problemas.some((p) => p.id === id) ? true : undefined)
  const plantilla = `auto minmax(0, 1.6fr) repeat(${visibles.length}, minmax(0, 1fr)) auto`
  const cambiaSerie = (key: number, parcial: Partial<SerieForm>) => onCambia((x) => ({ ...x, series: x.series.map((s) => (s.key === key ? { ...s, ...parcial } : s)) }))
  const añadirSerie = () =>
    onCambia((x) => {
      const ultima = x.series[x.series.length - 1]
      // La nueva serie parte de la anterior: lo normal es repetir peso y repeticiones
      return { ...x, series: [...x.series, ultima ? { ...ultima, key: nuevaClave() } : serieVacia()] }
    })
  const faltaSerie = intentado && problemas.find((p) => p.id === `e${e.key}`)
  return (
    <article aria-label={e.titulo} className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="t-body min-w-0 flex-1 truncate font-semibold" title={e.titulo}>
          {e.titulo}
        </h3>
        {e.supersetId && <Tag>Superserie {e.supersetId}</Tag>}
        <Tooltip texto="Subir">
          <IconButton variant="ghost" size="sm" etiqueta={`Subir ${e.titulo}`} icono={<ArrowUp size={16} />} disabled={primero} onClick={() => onMover(-1)} />
        </Tooltip>
        <Tooltip texto="Bajar">
          <IconButton variant="ghost" size="sm" etiqueta={`Bajar ${e.titulo}`} icono={<ArrowDown size={16} />} disabled={ultimo} onClick={() => onMover(1)} />
        </Tooltip>
        <Tooltip texto="Quitar ejercicio">
          <IconButton variant="ghost" size="sm" etiqueta={`Quitar ${e.titulo} de la sesión`} icono={<Trash size={16} />} onClick={onQuitar} />
        </Tooltip>
      </div>

      {e.series.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="t-meta grid items-end gap-3" style={{ gridTemplateColumns: plantilla }} aria-hidden>
            <span className="w-6 text-right">#</span>
            <span>Tipo</span>
            {visibles.map((c) => (
              <span key={c}>{CAMPO_LABEL[c]}</span>
            ))}
            <span className="w-8" />
          </div>
          {e.series.map((s, i) => {
            const nombre = `serie ${i + 1} de ${e.titulo}`
            return (
              <div key={s.key} className="grid items-start gap-3" style={{ gridTemplateColumns: plantilla }}>
                <span className="tnum t-label flex h-10 w-6 items-center justify-end">{i + 1}</span>
                <Select label={`Tipo de ${nombre}`} ocultarEtiqueta value={s.setType} onChange={(ev) => cambiaSerie(s.key, { setType: ev.target.value as SetType })}>
                  {SET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SET_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
                {visibles.map((c) => (
                  <TextField
                    key={c}
                    label={`${CAMPO_LABEL[c]} de ${nombre}`}
                    ocultarEtiqueta
                    inputMode={c === 'dist' || c === 'tiempo' ? 'text' : 'decimal'}
                    autoComplete="off"
                    className="[&_input]:tabular-nums"
                    placeholder={c === 'tiempo' ? 'm:ss' : c === 'dist' ? 'm o km' : ''}
                    unidad={c === 'peso' ? 'kg' : undefined}
                    value={s[c]}
                    aria-invalid={malo(`s${s.key}-${c}`)}
                    onChange={(ev) => cambiaSerie(s.key, { [c]: ev.target.value })}
                  />
                ))}
                <Tooltip texto="Quitar serie">
                  <IconButton variant="ghost" size="sm" className="mt-1" etiqueta={`Quitar ${nombre}`} icono={<Trash size={16} />} disabled={e.series.length === 1} onClick={() => onCambia((x) => ({ ...x, series: x.series.filter((y) => y.key !== s.key) }))} />
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}
      {faltaSerie && <p className="field-error">{faltaSerie.texto}</p>}

      {e.mas && (
        <TextField className="mt-4" label="Notas del ejercicio (opcional)" value={e.notas} onChange={(ev) => onCambia((x) => ({ ...x, notas: ev.target.value }))} autoComplete="off" />
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus size={14} weight="bold" aria-hidden />} onClick={añadirSerie}>
          Añadir serie
        </Button>
        <Button size="sm" variant="ghost" aria-pressed={e.mas} onClick={() => onCambia((x) => ({ ...x, mas: !x.mas }))}>
          {e.mas ? 'Menos campos' : 'Más campos'}
        </Button>
        {!e.mas && <span className="t-meta">Distancia, tiempo, RPE y notas.</span>}
      </div>
    </article>
  )
}
