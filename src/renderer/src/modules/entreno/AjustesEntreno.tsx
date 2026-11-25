// Ajustes › Entreno: grupos musculares, métricas, reglas de tipo de sesión, historial de importaciones y datos (exportar y restaurar).
import { ArrowDown, ArrowUp, DownloadSimple, FileArrowUp, Plus, Trash } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { E1RM_FORMULAS, KIND_RULE_FIELDS, SET_TYPES, WORKOUT_KINDS, type E1rmFormula, type EntrenoSettings, type KindRule, type KindRuleField, type MuscleGroup, type SetType, type WorkoutKind } from '@shared/modules/entreno/types'
import { Aviso, Button, Checkbox, ConfirmDialog, ErrorState, IconButton, LoadingState, Select, StatusBadge, Switch, TextField, Tooltip } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { fechaHoraLocal, KIND_LABEL, leerEntero, leerNumero, SET_TYPE_LABEL } from './format'

const CAMPO_LABEL: Record<KindRuleField, string> = { title: 'Título de la sesión', exercise: 'Algún ejercicio' }
/** En la fila de una regla, más corto para que quepa en una línea */
const CAMPO_CORTO: Record<KindRuleField, string> = { title: 'Título', exercise: 'Ejercicio' }

function Sub({ titulo, texto, children }: { titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="border-t border-line pt-6 first:border-0 first:pt-0">
      <h3 className="t-card-title mb-1">{titulo}</h3>
      {texto && <p className="t-label mb-4 max-w-3xl">{texto}</p>}
      {children}
    </section>
  )
}

export function AjustesEntreno() {
  return (
    <div className="flex flex-col gap-8">
      <GruposMusculares />
      <Metricas />
      <ReglasDeTipo />
      <Importaciones />
      <DatosDeEntreno />
    </div>
  )
}

/* ======================= Grupos musculares ======================= */
function GruposMusculares() {
  const q = useApi('entreno:muscleGroups.list', [])
  const [nuevo, setNuevo] = useState('')
  const [borrar, setBorrar] = useState<MuscleGroup | null>(null)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const guardar = useApiMutation('entreno:muscleGroups.save', {})
  const añadir = useApiMutation('entreno:muscleGroups.save', { success: 'Grupo añadido', onSuccess: () => setNuevo('') })
  const eliminar = useApiMutation('entreno:muscleGroups.delete', { success: 'Grupo borrado' })
  const [errorRango, setErrorRango] = useState<string | null>(null)

  /** Cambia el mínimo o el máximo de series por semana. Si no es válido, vuelve al valor anterior y lo explica. */
  const cambiarRango = (g: MuscleGroup, campo: 'weeklySetsMin' | 'weeklySetsMax', el: HTMLInputElement) => {
    const v = leerEntero(el.value)
    const nuevo = { weeklySetsMin: g.weeklySetsMin, weeklySetsMax: g.weeklySetsMax, [campo]: v }
    if (v === null || Number.isNaN(v) || v > 200) {
      el.value = String(g[campo])
      setErrorRango(`${g.name}: las series por semana son un número entero de 0 a 200.`)
    } else if (nuevo.weeklySetsMin > nuevo.weeklySetsMax) {
      el.value = String(g[campo])
      setErrorRango(`${g.name}: el mínimo de series no puede ser mayor que el máximo.`)
    } else if (v !== g[campo]) {
      setErrorRango(null)
      guardar.mutate([{ id: g.id, name: g.name, active: g.active, weeklySetsMin: nuevo.weeklySetsMin, weeklySetsMax: nuevo.weeklySetsMax }])
    } else setErrorRango(null)
  }
  return (
    <Sub titulo="Grupos musculares" texto="Los músculos que usas para clasificar ejercicios. Puedes renombrarlos, desactivarlos o crear los tuyos. El rango de series por semana es el que quieres alcanzar en cada uno (por defecto, de 10 a 20 series efectivas).">
      {q.isLoading && <LoadingState filas={3} etiqueta="Cargando los grupos musculares" />}
      {q.error && <ErrorState titulo="No se han podido cargar los grupos" texto={q.error.message} />}
      {q.data && (
        <>
          <ul className="divide-line r-card border border-line" aria-label="Grupos musculares">
            {q.data.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <TextField
                  className="min-w-48 flex-1"
                  label={`Nombre del grupo ${g.name}`}
                  ocultarEtiqueta
                  tamano="sm"
                  defaultValue={g.name}
                  maxLength={100}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (!v) e.target.value = g.name
                    else if (v !== g.name) guardar.mutate([{ id: g.id, name: v, active: g.active }])
                  }}
                />
                <span className="t-meta w-28 shrink-0">
                  {g.exerciseCount} {g.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
                <span className="flex items-center gap-2" role="group" aria-label={`Series por semana de ${g.name}`}>
                  <span className="t-meta">Series/semana</span>
                  <TextField key={`min-${g.id}-${g.weeklySetsMin}`} className="w-16 [&_input]:text-right [&_input]:tabular-nums" label={`Mínimo de series por semana de ${g.name}`} ocultarEtiqueta tamano="sm" inputMode="numeric" defaultValue={g.weeklySetsMin} onBlur={(e) => cambiarRango(g, 'weeklySetsMin', e.target)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                  <span aria-hidden className="t-meta">
                    –
                  </span>
                  <TextField key={`max-${g.id}-${g.weeklySetsMax}`} label={`Máximo de series por semana de ${g.name}`} ocultarEtiqueta tamano="sm" inputMode="numeric" defaultValue={g.weeklySetsMax} onBlur={(e) => cambiarRango(g, 'weeklySetsMax', e.target)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 [&_input]:text-right [&_input]:tabular-nums" />
                </span>
                <span className="flex items-center gap-2">
                  <Switch checked={g.active} label={`Grupo ${g.name} activo`} onChange={(v) => guardar.mutate([{ id: g.id, name: g.name, active: v }])} />
                  <span className="t-meta w-16">{g.active ? 'Activo' : 'Desactivado'}</span>
                </span>
                <Tooltip texto="Borrar grupo">
                  <IconButton variant="ghost" size="sm" etiqueta={`Borrar el grupo ${g.name}`} icono={<Trash size={16} />} onClick={() => (setErrorBorrado(null), setBorrar(g))} />
                </Tooltip>
              </li>
            ))}
          </ul>
          {errorRango && (
            <Aviso tono="error" className="mt-3">
              {errorRango}
            </Aviso>
          )}
          {errorBorrado && (
            <Aviso tono="error" className="mt-3">
              {errorBorrado}
            </Aviso>
          )}
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (nuevo.trim()) añadir.mutate([{ name: nuevo.trim(), active: true }])
            }}
          >
            <TextField className="w-72" label="Nuevo grupo muscular" tamano="sm" value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={100} autoComplete="off" />
            <Button size="sm" type="submit" icon={<Plus size={14} weight="bold" aria-hidden />} disabled={!nuevo.trim()} cargando={añadir.isPending}>
              Añadir
            </Button>
          </form>
        </>
      )}
      {borrar && (
        <ConfirmDialog
          titulo={`¿Borrar «${borrar.name}»?`}
          texto={borrar.exerciseCount > 0 ? `Lo usan ${borrar.exerciseCount} ejercicios, así que probablemente no se podrá borrar. Si quieres quitarlo de la lista, desactívalo.` : 'Se quita del catálogo. No se puede deshacer.'}
          confirmar="Borrar grupo"
          onCancelar={() => setBorrar(null)}
          onConfirmar={() => {
            const g = borrar
            setBorrar(null)
            eliminar.mutate([g.id], { onError: (e) => setErrorBorrado(e.message) })
          }}
        />
      )}
    </Sub>
  )
}

/* ======================= Métricas ======================= */
const FORMULA_LABEL: Record<E1rmFormula, string> = { EPLEY: 'Epley', BRZYCKI: 'Brzycki' }
const FORMULA_AYUDA: Record<E1rmFormula, string> = {
  EPLEY: 'Epley: peso × (1 + repeticiones ÷ 30). La más extendida.',
  BRZYCKI: 'Brzycki: peso × 36 ÷ (37 − repeticiones). Más prudente con muchas repeticiones.'
}
const AYUDA_SERIE: Record<SetType, string> = {
  normal: 'Las series de trabajo.',
  warmup: 'Normalmente no cuentan: no son series de trabajo.',
  dropset: 'Series con peso reducido a continuación de otra.',
  failure: 'Series llevadas al fallo.'
}

function Metricas() {
  const q = useApi('entreno:settings.get', [])
  return (
    <Sub titulo="Métricas" texto="Cómo se calculan el e1RM (fuerza máxima estimada), el volumen y las tendencias. Si cambias algo, los números se recalculan con tus sesiones de siempre.">
      {q.isLoading && <LoadingState filas={3} etiqueta="Cargando las métricas" />}
      {q.error && (
        <ErrorState
          titulo="No se han podido cargar las métricas"
          texto={q.error.message}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {q.data && <MetricasForm key={JSON.stringify(q.data)} s={q.data} />}
    </Sub>
  )
}

function MetricasForm({ s }: { s: EntrenoSettings }) {
  const [formula, setFormula] = useState<E1rmFormula>(s.e1rmFormula)
  const [minReps, setMinReps] = useState(String(s.e1rmMinReps))
  const [maxReps, setMaxReps] = useState(String(s.e1rmMaxReps))
  const [tipos, setTipos] = useState<SetType[]>(s.countedSetTypes)
  const [factor, setFactor] = useState(String(s.secondaryMuscleFactor).replace('.', ','))
  const [semanas, setSemanas] = useState(String(s.trendWeeks))
  const [guardado, setGuardado] = useState(false)
  const guardar = useApiMutation('entreno:settings.save', { success: 'Métricas guardadas' })

  const nMin = leerEntero(minReps)
  const nMax = leerEntero(maxReps)
  const nFactor = leerNumero(factor)
  const nSemanas = leerEntero(semanas)
  const entero = (n: number | null, min: number, max: number) => n !== null && !Number.isNaN(n) && n >= min && n <= max
  const errores = {
    minReps: entero(nMin, 1, 100) ? undefined : 'Un número entero entre 1 y 100.',
    maxReps: !entero(nMax, 1, 100) ? 'Un número entero entre 1 y 100.' : entero(nMin, 1, 100) && nMin! > nMax! ? 'No puede ser menor que el mínimo.' : undefined,
    factor: nFactor !== null && !Number.isNaN(nFactor) && nFactor >= 0 && nFactor <= 1 ? undefined : 'Un número entre 0 y 1.',
    semanas: entero(nSemanas, 1, 104) ? undefined : 'Un número entero entre 1 y 104.',
    tipos: tipos.length > 0 ? undefined : 'Tiene que contar al menos un tipo de serie.'
  }
  const hayError = Object.values(errores).some(Boolean)

  const patch: Partial<EntrenoSettings> = {}
  if (formula !== s.e1rmFormula) patch.e1rmFormula = formula
  if (nMin !== null && nMin !== s.e1rmMinReps) patch.e1rmMinReps = nMin
  if (nMax !== null && nMax !== s.e1rmMaxReps) patch.e1rmMaxReps = nMax
  const ordenados = SET_TYPES.filter((t) => tipos.includes(t))
  if (ordenados.join() !== [...s.countedSetTypes].sort((a, b) => SET_TYPES.indexOf(a) - SET_TYPES.indexOf(b)).join()) patch.countedSetTypes = ordenados
  if (nFactor !== null && nFactor !== s.secondaryMuscleFactor) patch.secondaryMuscleFactor = nFactor
  if (nSemanas !== null && nSemanas !== s.trendWeeks) patch.trendWeeks = nSemanas
  const sucio = Object.keys(patch).length > 0

  const descartar = () => {
    setFormula(s.e1rmFormula)
    setMinReps(String(s.e1rmMinReps))
    setMaxReps(String(s.e1rmMaxReps))
    setTipos(s.countedSetTypes)
    setFactor(String(s.secondaryMuscleFactor).replace('.', ','))
    setSemanas(String(s.trendWeeks))
    setGuardado(false)
  }
  const cambia = <T,>(set: (v: T) => void) => (v: T) => (set(v), setGuardado(false))

  return (
    <form
      className="flex flex-col gap-6"
      aria-label="Parámetros de métricas"
      onSubmit={(e) => {
        e.preventDefault()
        if (sucio && !hayError) guardar.mutate([patch], { onSuccess: () => setGuardado(true) })
      }}
    >
      <div className="auto-grid-wide">
        <Select label="Fórmula del e1RM" value={formula} onChange={(e) => cambia(setFormula)(e.target.value as E1rmFormula)} ayuda={FORMULA_AYUDA[formula]}>
          {E1RM_FORMULAS.map((f) => (
            <option key={f} value={f}>
              {FORMULA_LABEL[f]}
            </option>
          ))}
        </Select>
        <TextField label="Repeticiones mínimas del e1RM" unidad="reps" inputMode="numeric" value={minReps} onChange={(e) => cambia(setMinReps)(e.target.value)} error={errores.minReps} ayuda="Con menos repeticiones, la serie no cuenta." className="[&_input]:text-right [&_input]:tabular-nums" />
        <TextField label="Repeticiones máximas del e1RM" unidad="reps" inputMode="numeric" value={maxReps} onChange={(e) => cambia(setMaxReps)(e.target.value)} error={errores.maxReps} ayuda="Con más, la estimación pierde precisión." className="[&_input]:text-right [&_input]:tabular-nums" />
        <TextField label="Músculos secundarios" inputMode="decimal" value={factor} onChange={(e) => cambia(setFactor)(e.target.value)} error={errores.factor} ayuda="Cuánto cuenta una serie para ellos: 0,5 es la mitad, 0 no cuenta." className="[&_input]:text-right [&_input]:tabular-nums" />
        <TextField label="Semanas para la tendencia" unidad="semanas" inputMode="numeric" value={semanas} onChange={(e) => cambia(setSemanas)(e.target.value)} error={errores.semanas} ayuda="Últimas semanas con datos que usa la proyección." className="[&_input]:text-right [&_input]:tabular-nums" />
        <TextField label="La semana empieza el" value="Lunes" disabled readOnly ayuda="Fijo: las semanas van siempre de lunes a domingo." />
      </div>

      <fieldset>
        <legend className="field-label">Tipos de serie que cuentan</legend>
        <div className="mt-1 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {SET_TYPES.map((t) => (
            <Checkbox key={t} checked={tipos.includes(t)} onChange={(v) => cambia(setTipos)(v ? [...tipos, t] : tipos.filter((x) => x !== t))} label={SET_TYPE_LABEL[t]} ayuda={AYUDA_SERIE[t]} />
          ))}
        </div>
        {errores.tipos && (
          <p className="field-error mt-2" role="alert">
            {errores.tipos}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Guardado de métricas">
        <Button type="submit" variant="primary" disabled={!sucio || hayError} cargando={guardar.isPending}>
          Guardar métricas
        </Button>
        <Button variant="ghost" disabled={!sucio} onClick={descartar}>
          Descartar
        </Button>
        <div role="status" aria-live="polite">
          {hayError ? <StatusBadge tono="error">Hay campos con errores: corrígelos para guardar</StatusBadge> : sucio ? <StatusBadge tono="warning">Tienes cambios sin guardar</StatusBadge> : guardado ? <StatusBadge tono="success">Cambios guardados</StatusBadge> : <span className="t-meta">Sin cambios</span>}
        </div>
      </div>
    </form>
  )
}

/* ======================= Reglas de tipo de sesión ======================= */
function ReglasDeTipo() {
  const q = useApi('entreno:kindRules.list', [])
  const guardar = useApiMutation('entreno:kindRules.save', {})
  const nueva = useApiMutation('entreno:kindRules.save', { success: 'Regla añadida', onSuccess: () => setTexto('') })
  const ordenar = useApiMutation('entreno:kindRules.reorder', {})
  const eliminar = useApiMutation('entreno:kindRules.delete', { success: 'Regla borrada' })
  const reaplicar = useApiMutation('entreno:kindRules.reapply', {})
  const [resultado, setResultado] = useState<{ checked: number; changed: number } | null>(null)
  const [campo, setCampo] = useState<KindRuleField>('title')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<WorkoutKind>('SWIM')

  const cambiar = (r: KindRule, parcial: Partial<KindRule>) => guardar.mutate([{ ...r, ...parcial }])
  const mover = (i: number, d: -1 | 1) => {
    const ids = (q.data ?? []).map((r) => r.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    ordenar.mutate([ids])
  }
  return (
    <Sub titulo="Reglas de tipo de sesión" texto="Así se decide si una sesión es de gimnasio, natación, HYROX… Se mira la lista de arriba abajo y gana la primera regla activa que coincida. Una sesión con el tipo fijado a mano no cambia.">
      {q.isLoading && <LoadingState filas={3} etiqueta="Cargando las reglas" />}
      {q.error && <ErrorState titulo="No se han podido cargar las reglas" texto={q.error.message} />}
      {q.data && (
        <>
          {q.data.length === 0 && <p className="t-label mb-3">No hay reglas: todas las sesiones salen como «{KIND_LABEL.GYM}».</p>}
          {q.data.length > 0 && (
            <ol className="divide-line r-card border border-line" aria-label="Reglas, de mayor a menor prioridad">
              {q.data.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="tnum t-meta flex h-10 w-6 items-center">{i + 1}</span>
                  <Select className="w-36" label={`Dónde buscar, regla ${i + 1}`} ocultarEtiqueta tamano="sm" value={r.field} onChange={(e) => cambiar(r, { field: e.target.value as KindRuleField })}>
                    {KIND_RULE_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {CAMPO_CORTO[f]}
                      </option>
                    ))}
                  </Select>
                  <TextField
                    className="min-w-40 flex-1"
                    label={`Contiene, regla ${i + 1}`}
                    ocultarEtiqueta
                    tamano="sm"
                    defaultValue={r.contains}
                    maxLength={200}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (!v) e.target.value = r.contains
                      else if (v !== r.contains) cambiar(r, { contains: v })
                    }}
                  />
                  <span className="t-meta flex h-10 items-center">→</span>
                  <Select className="w-36" label={`Tipo, regla ${i + 1}`} ocultarEtiqueta tamano="sm" value={r.kind} onChange={(e) => cambiar(r, { kind: e.target.value as WorkoutKind })}>
                    {WORKOUT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <span className="flex h-10 items-center" title={r.active ? "Activa" : "Apagada"}>
                    <Switch checked={r.active} label={`Regla ${i + 1} activa`} onChange={(v) => cambiar(r, { active: v })} />
                  </span>
                  <span className="flex h-10 items-center gap-1">
                    <IconButton variant="ghost" size="sm" etiqueta={`Subir la regla ${i + 1} (más prioridad)`} icono={<ArrowUp size={16} />} disabled={i === 0 || ordenar.isPending} onClick={() => mover(i, -1)} />
                    <IconButton variant="ghost" size="sm" etiqueta={`Bajar la regla ${i + 1} (menos prioridad)`} icono={<ArrowDown size={16} />} disabled={i === q.data.length - 1 || ordenar.isPending} onClick={() => mover(i, 1)} />
                    <IconButton variant="ghost" size="sm" etiqueta={`Borrar la regla ${i + 1}`} icono={<Trash size={16} />} onClick={() => eliminar.mutate([r.id])} />
                  </span>
                </li>
              ))}
            </ol>
          )}
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            aria-label="Nueva regla"
            onSubmit={(e) => {
              e.preventDefault()
              if (texto.trim()) nueva.mutate([{ field: campo, contains: texto.trim(), kind: tipo, active: true }])
            }}
          >
            <Select className="w-48" label="Dónde buscar" tamano="sm" value={campo} onChange={(e) => setCampo(e.target.value as KindRuleField)}>
              {KIND_RULE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {CAMPO_LABEL[f]}
                </option>
              ))}
            </Select>
            <TextField className="min-w-40 flex-1" label="Contiene" tamano="sm" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="natación, hyrox…" maxLength={200} autoComplete="off" />
            <Select className="w-40" label="Entonces es" tamano="sm" value={tipo} onChange={(e) => setTipo(e.target.value as WorkoutKind)}>
              {WORKOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Button size="sm" type="submit" icon={<Plus size={14} weight="bold" aria-hidden />} disabled={!texto.trim()} cargando={nueva.isPending}>
              Añadir regla
            </Button>
          </form>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="sm" cargando={reaplicar.isPending} onClick={() => reaplicar.mutate([], { onSuccess: setResultado })}>
              Volver a aplicar a las sesiones
            </Button>
            <span className="t-meta">Recalcula el tipo de las sesiones que no has fijado a mano.</span>
          </div>
          {resultado && (
            <p className="mt-3" role="status">
              <StatusBadge tono="success">
                {resultado.checked} {resultado.checked === 1 ? 'sesión revisada' : 'sesiones revisadas'}, {resultado.changed} {resultado.changed === 1 ? 'cambiada' : 'cambiadas'}.
              </StatusBadge>
            </p>
          )}
        </>
      )}
    </Sub>
  )
}

/* ======================= Historial de importaciones ======================= */
function Importaciones() {
  const q = useApi('entreno:imports.list', [])
  return (
    <Sub titulo="Historial de importaciones" texto="Los archivos de Hevy que has importado.">
      {q.isLoading && <LoadingState filas={2} etiqueta="Cargando el historial" />}
      {q.error && <ErrorState titulo="No se ha podido cargar el historial" texto={q.error.message} />}
      {q.data && q.data.length === 0 && <p className="t-meta">Aún no has importado nada.</p>}
      {q.data && q.data.length > 0 && (
        <div className="card card-flush max-h-80 overflow-auto">
          <table className="table" data-density="compact" aria-label="Importaciones">
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Archivo</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Nuevas
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Cambiadas
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Ya estaban
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Con error
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((i) => (
                <tr key={i.id}>
                  <td className="tnum whitespace-nowrap text-ink-2">{fechaHoraLocal(i.importedAt)}</td>
                  <td className="max-w-64">
                    <span className="block truncate" title={i.fileName}>
                      {i.fileName}
                    </span>
                  </td>
                  <td className="tnum text-right">{i.workoutsNew}</td>
                  <td className="tnum text-right">{i.workoutsChanged}</td>
                  <td className="tnum text-right text-ink-2">{i.workoutsDuplicate}</td>
                  <td className="tnum text-right text-ink-2">{i.rowsError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sub>
  )
}

/* ======================= Exportar y restaurar ======================= */
function DatosDeEntreno() {
  const exportado = (r: string | null) => (r ? 'Exportado' : null)
  const csv = useApiMutation('entreno:export.csv', { success: exportado })
  const xlsx = useApiMutation('entreno:export.xlsx', { success: exportado })
  const json = useApiMutation('entreno:export.json', { success: exportado })
  const restaurar = useApiMutation('entreno:restore.json', {
    success: (r) => (r ? `Datos de entreno restaurados.${r.safetyBackup ? ' Copia previa guardada.' : ''}` : null),
    invalidateOnError: true
  })
  const [confirmar, setConfirmar] = useState(false)
  return (
    <Sub titulo="Datos de entreno" texto="Exportar y restaurar son cosas distintas. Tus datos de finanzas no se tocan.">
      <div className="flex flex-col gap-6">
        <div>
          <h4 className="t-body mb-1 font-semibold">Exportar</h4>
          <p className="t-label mb-3">El CSV tiene el mismo formato que el de Hevy. El JSON incluye todo y sirve para restaurar.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<DownloadSimple size={16} aria-hidden />} cargando={csv.isPending} onClick={() => csv.mutate([])}>
              CSV (formato Hevy)
            </Button>
            <Button size="sm" icon={<DownloadSimple size={16} aria-hidden />} cargando={xlsx.isPending} onClick={() => xlsx.mutate([])}>
              Excel (.xlsx)
            </Button>
            <Button size="sm" icon={<DownloadSimple size={16} aria-hidden />} cargando={json.isPending} onClick={() => json.mutate([])}>
              JSON completo (restaurable)
            </Button>
          </div>
        </div>
        <div className="border-t border-line pt-6">
          <h4 className="t-body mb-1 font-semibold">Restaurar</h4>
          <p className="t-label mb-3">Vuelve a unos datos de entreno exportados antes en JSON. Antes se hace una copia de seguridad.</p>
          <Button size="sm" variant="danger" icon={<FileArrowUp size={16} aria-hidden />} cargando={restaurar.isPending} onClick={() => setConfirmar(true)}>
            Restaurar desde un JSON…
          </Button>
        </div>
      </div>
      {confirmar && (
        <ConfirmDialog
          titulo="¿Restaurar los datos de entreno?"
          texto="Se sustituyen todos tus datos de entreno (sesiones, ejercicios, reglas y ajustes) por los del archivo que elijas. Tus datos de finanzas no cambian. Antes se guarda una copia de seguridad de lo que tienes ahora."
          confirmar="Elegir archivo y restaurar"
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => {
            setConfirmar(false)
            restaurar.mutate([])
          }}
        />
      )}
    </Sub>
  )
}
