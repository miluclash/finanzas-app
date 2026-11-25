// Entreno · Objetivos: lista por estado, formulario por tipo y gestión de eventos. El progreso y los gráficos llegan con el Resumen.
import { CalendarStar, ChartLineUp, CheckCircle, PencilSimple, Plus, Target, Trash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDate } from '@shared/dates'
import { GOAL_STATUSES, GOAL_TYPES, WORKOUT_KINDS, type Exercise, type Goal, type GoalInput, type GoalStatus, type GoalType, type MuscleGroup, type TrainingEvent, type WorkoutKind } from '@shared/modules/entreno/types'
import { Aviso, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, Modal, PageHeader, SegmentedControl, Select, Seccion, StatusBadge, Tag, TextArea, TextField, Tooltip } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { ErrorDeServidor } from './PlanPiezas'
import { formatKg, formatNum, GOAL_STATUS_LABEL, GOAL_TYPE_LABEL, KIND_LABEL, leerEntero, leerNumero } from './format'

/** Texto corto de qué pide el objetivo, con los nombres de ejercicios, grupos y eventos. */
function describir(g: Goal, ejercicios: Map<number, string>, grupos: Map<number, string>, eventos: Map<number, TrainingEvent>): string {
  const ej = g.exerciseId !== null ? (ejercicios.get(g.exerciseId) ?? 'Ejercicio borrado') : ''
  const gr = g.groupId !== null ? (grupos.get(g.groupId) ?? 'Grupo borrado') : ''
  switch (g.type) {
    case 'E1RM':
      return `${ej}: llegar a ${formatKg(g.targetValue)} de e1RM`
    case 'WEIGHT_REPS':
      return `${ej}: ${formatKg(g.targetValue)} × ${formatNum(g.targetReps)} repeticiones`
    case 'WEEKLY_VOLUME':
      return g.groupId !== null ? `${gr}: ${formatNum(g.targetValue)} series efectivas por semana` : `${ej}: ${formatNum(g.targetValue)} kg de volumen por semana`
    case 'FREQUENCY':
      return g.kind !== null ? `${KIND_LABEL[g.kind]}: ${formatNum(g.targetValue)} sesiones por semana` : `${gr}: ${formatNum(g.targetValue)} días por semana`
    case 'EVENT': {
      const e = g.eventId !== null ? eventos.get(g.eventId) : undefined
      return e ? `Evento el ${formatDate(e.date)}` : 'Evento borrado'
    }
  }
}

/**
 * Hueco del progreso de un objetivo. Aquí irán el valor observado, el e1RM, la proyección y el gráfico (Resumen, 2C).
 * Hoy solo avisa: no hay ninguna cifra inventada.
 */
export function ProgresoObjetivo({ goal }: { goal: Goal }) {
  return (
    <div data-hueco="progreso-objetivo" data-goal-id={goal.id} className="mt-4 flex items-start gap-3 r-control border border-dashed border-line-strong px-4 py-3">
      <ChartLineUp size={20} className="mt-px shrink-0 text-ink-3" aria-hidden />
      <p className="t-label">El progreso y la proyección de este objetivo aparecerán aquí.</p>
    </div>
  )
}

export function ObjetivosPage() {
  const [params, setParams] = useSearchParams()
  const objetivos = useApi('entreno:goals.list', [])
  const eventos = useApi('entreno:events.list', [])
  const ejercicios = useApi('entreno:exercises.list', [])
  const grupos = useApi('entreno:muscleGroups.list', [])
  const [objetivo, setObjetivo] = useState<Goal | 'nuevo' | null>(null)
  const [evento, setEvento] = useState<TrainingEvent | 'nuevo' | null>(null)
  const [borrar, setBorrar] = useState<Goal | null>(null)
  const estado = useApiMutation('entreno:goals.setStatus', { success: 'Objetivo actualizado' })
  const eliminar = useApiMutation('entreno:goals.delete', { success: 'Objetivo borrado' })

  // Ctrl+K «Nuevo objetivo» llega con ?nuevo=1: abre el formulario y limpia la dirección.
  useEffect(() => {
    if (params.get('nuevo')) {
      setObjetivo('nuevo')
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const nEjercicios = new Map((ejercicios.data ?? []).map((e) => [e.id, e.title]))
  const nGrupos = new Map((grupos.data ?? []).map((g) => [g.id, g.name]))
  const mEventos = new Map((eventos.data ?? []).map((e) => [e.id, e]))
  const lista = objetivos.data
  const por = (s: GoalStatus) => (lista ?? []).filter((g) => g.status === s)

  const tarjeta = (g: Goal) => (
    <div key={g.id} className="col-span-12 @4xl:col-span-6">
      <Card as="article" etiqueta={g.name} className="h-full">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="t-body min-w-0 font-semibold">{g.name}</h3>
          <Tag className="shrink-0">{GOAL_TYPE_LABEL[g.type]}</Tag>
        </div>
        <p className="t-body">{describir(g, nEjercicios, nGrupos, mEventos)}</p>
        <p className="t-label mt-1 tnum">{g.type === 'EVENT' ? null : g.deadline ? `Fecha límite: ${formatDate(g.deadline)}` : 'Sin fecha límite'}</p>
        {g.status !== 'ACTIVE' && (
          <p className="mt-3">
            <StatusBadge tono={g.status === 'ACHIEVED' ? 'success' : 'neutral'}>{GOAL_STATUS_LABEL[g.status]}</StatusBadge>
          </p>
        )}
        {g.notes && <p className="t-meta mt-2 whitespace-pre-line">{g.notes}</p>}
        {g.status === 'ACTIVE' && <ProgresoObjetivo goal={g} />}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {g.status === 'ACTIVE' ? (
            <>
              <Button size="sm" variant="primary" icon={<CheckCircle size={16} aria-hidden />} onClick={() => estado.mutate([g.id, 'ACHIEVED'])} disabled={estado.isPending} aria-label={`Marcar como conseguido: ${g.name}`}>
                Conseguido
              </Button>
              <Button size="sm" variant="ghost" onClick={() => estado.mutate([g.id, 'ABANDONED'])} disabled={estado.isPending} aria-label={`Abandonar: ${g.name}`}>
                Abandonar
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => estado.mutate([g.id, 'ACTIVE'])} disabled={estado.isPending} aria-label={`Reactivar: ${g.name}`}>
              Reactivar
            </Button>
          )}
          <span className="ml-auto flex items-center gap-1">
            <Tooltip texto="Editar">
              <IconButton variant="ghost" size="sm" etiqueta={`Editar ${g.name}`} icono={<PencilSimple size={16} />} onClick={() => setObjetivo(g)} />
            </Tooltip>
            <Tooltip texto="Borrar">
              <IconButton variant="ghost" size="sm" etiqueta={`Borrar ${g.name}`} icono={<Trash size={16} />} onClick={() => setBorrar(g)} />
            </Tooltip>
          </span>
        </div>
      </Card>
    </div>
  )

  const bloque = (titulo: string, texto: string, items: Goal[]) =>
    items.length > 0 && (
      <Seccion titulo={titulo} texto={texto}>
        <div className="page-grid">{items.map(tarjeta)}</div>
      </Seccion>
    )

  return (
    <div>
      <PageHeader
        titulo="Objetivos"
        texto="Lo que te has marcado: un peso, un volumen, una frecuencia o un evento."
        acciones={
          <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setObjetivo('nuevo')}>
            Nuevo objetivo
          </Button>
        }
      />
      {objetivos.isLoading && <LoadingState filas={4} etiqueta="Cargando los objetivos" />}
      {objetivos.error && (
        <ErrorState
          titulo="No se han podido cargar los objetivos"
          texto={objetivos.error.message}
          accion={
            <Button size="sm" onClick={() => objetivos.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {lista && (
        <div className="flex flex-col gap-10">
          {lista.length === 0 ? (
            <div className="card">
              <EmptyState
                icono={<Target size={24} weight="duotone" aria-hidden />}
                titulo="Aún no tienes objetivos"
                texto="Ponte una meta, por ejemplo llegar a 120 kg de e1RM en sentadilla o entrenar 4 veces por semana."
                accion={
                  <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setObjetivo('nuevo')}>
                    Crear el primero
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {por('ACTIVE').length === 0 && <p className="t-label">No tienes ningún objetivo activo.</p>}
              {bloque('Activos', 'Los que estás persiguiendo ahora.', por('ACTIVE'))}
              {bloque('Conseguidos', 'Los que ya has cumplido.', por('ACHIEVED'))}
              {bloque('Abandonados', 'Los que has dejado. Puedes reactivarlos.', por('ABANDONED'))}
            </>
          )}

          <Seccion
            titulo="Eventos"
            texto="Citas con fecha, como una carrera de HYROX. Un objetivo de tipo evento y los bloques pueden apuntar a uno."
            acciones={
              <Button size="sm" icon={<Plus size={14} weight="bold" aria-hidden />} onClick={() => setEvento('nuevo')}>
                Nuevo evento
              </Button>
            }
          >
            {eventos.data && eventos.data.length === 0 && (
              <div className="card">
                <EmptyState compacto icono={<CalendarStar size={24} weight="duotone" aria-hidden />} titulo="Aún no hay eventos" texto="Añade tu próxima carrera o competición para tener una fecha a la que llegar." />
              </div>
            )}
            {eventos.data && eventos.data.length > 0 && (
              <ul className="divide-line r-card border border-line bg-card" aria-label="Eventos">
                {[...eventos.data]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <span className="tnum t-label w-24 shrink-0">{formatDate(e.date)}</span>
                      <div className="min-w-48 flex-1">
                        <button type="button" className="t-body max-w-full truncate text-left font-semibold hover:underline" onClick={() => setEvento(e)} title={e.name} aria-label={`Editar ${e.name}`}>
                          {e.name}
                        </button>
                        {e.notes && <p className="t-meta truncate">{e.notes}</p>}
                      </div>
                      <Tooltip texto="Editar">
                        <IconButton variant="ghost" size="sm" etiqueta={`Editar ${e.name}`} icono={<PencilSimple size={16} />} onClick={() => setEvento(e)} />
                      </Tooltip>
                    </li>
                  ))}
              </ul>
            )}
          </Seccion>
        </div>
      )}

      {objetivo !== null && (
        <ObjetivoModal
          goal={objetivo === 'nuevo' ? null : objetivo}
          ejercicios={ejercicios.data ?? []}
          grupos={grupos.data ?? []}
          eventos={eventos.data ?? []}
          onCerrar={() => setObjetivo(null)}
          onCrearEvento={() => (setObjetivo(null), setEvento('nuevo'))}
        />
      )}
      {evento !== null && <EventoModal evento={evento === 'nuevo' ? null : evento} onCerrar={() => setEvento(null)} />}
      {borrar && (
        <ConfirmDialog
          titulo={`¿Borrar «${borrar.name}»?`}
          texto="El objetivo desaparece de tu lista. Si solo lo has dejado, mejor márcalo como abandonado. No se puede deshacer."
          confirmar="Borrar objetivo"
          onCancelar={() => setBorrar(null)}
          onConfirmar={() => {
            const g = borrar
            setBorrar(null)
            eliminar.mutate([g.id])
          }}
        />
      )}
    </div>
  )
}

/* ======================= Formulario de un objetivo ======================= */
type MedirVolumen = 'GRUPO' | 'EJERCICIO'
type MedirFrecuencia = 'TIPO' | 'GRUPO'

function ObjetivoModal({ goal, ejercicios, grupos, eventos, onCerrar, onCrearEvento }: { goal: Goal | null; ejercicios: Exercise[]; grupos: MuscleGroup[]; eventos: TrainingEvent[]; onCerrar: () => void; onCrearEvento: () => void }) {
  const [nombre, setNombre] = useState(goal?.name ?? '')
  const [tipo, setTipo] = useState<GoalType>(goal?.type ?? 'E1RM')
  const [ejercicio, setEjercicio] = useState(goal?.exerciseId == null ? '' : String(goal.exerciseId))
  const [grupo, setGrupo] = useState(goal?.groupId == null ? '' : String(goal.groupId))
  const [kind, setKind] = useState<WorkoutKind>(goal?.kind ?? 'GYM')
  const [evento, setEvento] = useState(goal?.eventId == null ? '' : String(goal.eventId))
  const [valor, setValor] = useState(goal?.targetValue == null ? '' : String(goal.targetValue).replace('.', ','))
  const [reps, setReps] = useState(goal?.targetReps == null ? '' : String(goal.targetReps))
  const [medirVolumen, setMedirVolumen] = useState<MedirVolumen>(goal?.type === 'WEEKLY_VOLUME' && goal.exerciseId !== null ? 'EJERCICIO' : 'GRUPO')
  const [medirFrecuencia, setMedirFrecuencia] = useState<MedirFrecuencia>(goal?.type === 'FREQUENCY' && goal.groupId !== null ? 'GRUPO' : 'TIPO')
  const [limite, setLimite] = useState(goal?.deadline ?? '')
  const [estado, setEstado] = useState<GoalStatus>(goal?.status ?? 'ACTIVE')
  const [notas, setNotas] = useState(goal?.notes ?? '')
  const [intentado, setIntentado] = useState(false)
  const inicial = useRef<HTMLSelectElement>(null)

  const cambiarEstado = useApiMutation('entreno:goals.setStatus', { onSuccess: onCerrar })
  const guardar = useApiMutation('entreno:goals.save', {
    success: goal ? 'Objetivo guardado' : 'Objetivo creado',
    onSuccess: () => {
      if (!goal) onCerrar()
    }
  })

  const ejerciciosVisibles = ejercicios.filter((e) => e.active || String(e.id) === ejercicio).sort((a, b) => a.title.localeCompare(b.title, 'es'))
  const gruposVisibles = grupos.filter((g) => g.active || String(g.id) === grupo)

  const num = leerNumero(valor)
  const numReps = leerEntero(reps)
  const valorMalo = num === null || Number.isNaN(num) || num <= 0
  const repsMalas = numReps === null || Number.isNaN(numReps) || numReps <= 0

  const nombreEj = ejercicios.find((e) => String(e.id) === ejercicio)?.title ?? ''
  const nombreGr = grupos.find((g) => String(g.id) === grupo)?.name ?? ''
  const nombreEv = eventos.find((e) => String(e.id) === evento)?.name ?? ''
  const cifra = valorMalo ? '' : formatNum(num)
  const sugerido = ((): string => {
    switch (tipo) {
      case 'E1RM':
        return nombreEj && cifra ? `E1RM de ${nombreEj}: ${cifra} kg` : ''
      case 'WEIGHT_REPS':
        return nombreEj && cifra && !repsMalas ? `${nombreEj}: ${cifra} kg × ${numReps}` : ''
      case 'WEEKLY_VOLUME':
        return medirVolumen === 'GRUPO' ? (nombreGr ? `Volumen semanal de ${nombreGr.toLowerCase()}` : '') : nombreEj ? `Volumen semanal de ${nombreEj}` : ''
      case 'FREQUENCY':
        return cifra ? (medirFrecuencia === 'TIPO' ? `${KIND_LABEL[kind]}: ${cifra} por semana` : nombreGr ? `${nombreGr}: ${cifra} días por semana` : '') : ''
      case 'EVENT':
        return nombreEv
    }
  })()

  const errores: Partial<Record<'nombre' | 'ejercicio' | 'grupo' | 'evento' | 'valor' | 'reps', string>> = {}
  if (!nombre.trim() && !sugerido) errores.nombre = 'Ponle un nombre al objetivo.'
  if ((tipo === 'E1RM' || tipo === 'WEIGHT_REPS' || (tipo === 'WEEKLY_VOLUME' && medirVolumen === 'EJERCICIO')) && !ejercicio) errores.ejercicio = 'Elige un ejercicio.'
  if (((tipo === 'WEEKLY_VOLUME' && medirVolumen === 'GRUPO') || (tipo === 'FREQUENCY' && medirFrecuencia === 'GRUPO')) && !grupo) errores.grupo = 'Elige un grupo muscular.'
  if (tipo === 'EVENT' && !evento) errores.evento = 'Elige un evento.'
  if (tipo !== 'EVENT' && valorMalo) errores.valor = 'Pon un número mayor que cero.'
  if (tipo === 'WEIGHT_REPS' && repsMalas) errores.reps = 'Pon un número entero mayor que cero.'
  const ver = (k: keyof typeof errores) => (intentado ? errores[k] : undefined)

  const enviar = () => {
    setIntentado(true)
    if (Object.keys(errores).length > 0) return
    const entrada: GoalInput = {
      id: goal?.id ?? null,
      name: nombre.trim() || sugerido,
      type: tipo,
      targetValue: tipo === 'EVENT' ? null : num,
      targetReps: tipo === 'WEIGHT_REPS' ? numReps : null,
      deadline: tipo === 'EVENT' ? null : limite || null,
      exerciseId: tipo === 'E1RM' || tipo === 'WEIGHT_REPS' || (tipo === 'WEEKLY_VOLUME' && medirVolumen === 'EJERCICIO') ? Number(ejercicio) : null,
      groupId: (tipo === 'WEEKLY_VOLUME' && medirVolumen === 'GRUPO') || (tipo === 'FREQUENCY' && medirFrecuencia === 'GRUPO') ? Number(grupo) : null,
      eventId: tipo === 'EVENT' ? Number(evento) : null,
      kind: tipo === 'FREQUENCY' && medirFrecuencia === 'TIPO' ? kind : null,
      notes: notas.trim() || null
    }
    if (!goal) guardar.mutate([{ ...entrada, status: 'ACTIVE' }])
    // Al editar, el estado va aparte (goals.setStatus): primero se guardan los campos y después, si ha cambiado, el estado.
    else
      guardar.mutate([entrada], {
        onSuccess: () => {
          if (estado !== goal.status) cambiarEstado.mutate([goal.id, estado])
          else onCerrar()
        }
      })
  }

  return (
    <Modal
      titulo={goal ? goal.name : 'Nuevo objetivo'}
      descripcion={goal ? undefined : 'Elige qué quieres conseguir.'}
      ancho="lg"
      inicial={inicial}
      onCerrar={onCerrar}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={enviar} cargando={guardar.isPending || cambiarEstado.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <Select ref={inicial} label="Qué quieres conseguir" value={tipo} onChange={(e) => setTipo(e.target.value as GoalType)}>
          {GOAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {GOAL_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>

        {(tipo === 'E1RM' || tipo === 'WEIGHT_REPS') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectorEjercicio ejercicios={ejerciciosVisibles} valor={ejercicio} onChange={setEjercicio} error={ver('ejercicio')} />
            <TextField
              label={tipo === 'E1RM' ? 'E1RM que quieres alcanzar' : 'Peso'}
              unidad="kg"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              error={ver('valor')}
              ayuda={tipo === 'E1RM' ? 'Fuerza máxima estimada (1RM) según tus series.' : undefined}
              className="[&_input]:text-right [&_input]:tabular-nums"
            />
            {tipo === 'WEIGHT_REPS' && <TextField label="Repeticiones" unidad="reps" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} error={ver('reps')} ayuda="Con al menos ese peso, en una serie." className="[&_input]:text-right [&_input]:tabular-nums" />}
          </div>
        )}

        {tipo === 'WEEKLY_VOLUME' && (
          <div className="flex flex-col gap-4">
            <div>
              <span className="field-label">Medir por</span>
              <SegmentedControl
                label="Medir el volumen por"
                value={medirVolumen}
                onChange={setMedirVolumen}
                opciones={[
                  { id: 'GRUPO', texto: 'Grupo muscular' },
                  { id: 'EJERCICIO', texto: 'Ejercicio' }
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {medirVolumen === 'GRUPO' ? <SelectorGrupo grupos={gruposVisibles} valor={grupo} onChange={setGrupo} error={ver('grupo')} /> : <SelectorEjercicio ejercicios={ejerciciosVisibles} valor={ejercicio} onChange={setEjercicio} error={ver('ejercicio')} />}
              <TextField
                label="Volumen semanal"
                unidad={medirVolumen === 'GRUPO' ? 'series' : 'kg'}
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                error={ver('valor')}
                ayuda={medirVolumen === 'GRUPO' ? 'Series efectivas por semana.' : 'Kilos movidos por semana (peso × repeticiones).'}
                className="[&_input]:text-right [&_input]:tabular-nums"
              />
            </div>
          </div>
        )}

        {tipo === 'FREQUENCY' && (
          <div className="flex flex-col gap-4">
            <div>
              <span className="field-label">Medir por</span>
              <SegmentedControl
                label="Medir la frecuencia por"
                value={medirFrecuencia}
                onChange={setMedirFrecuencia}
                opciones={[
                  { id: 'TIPO', texto: 'Tipo de sesión' },
                  { id: 'GRUPO', texto: 'Grupo muscular' }
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {medirFrecuencia === 'TIPO' ? (
                <Select label="Tipo de sesión" value={kind} onChange={(e) => setKind(e.target.value as WorkoutKind)}>
                  {WORKOUT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              ) : (
                <SelectorGrupo grupos={gruposVisibles} valor={grupo} onChange={setGrupo} error={ver('grupo')} />
              )}
              <TextField
                label="Veces por semana"
                unidad={medirFrecuencia === 'TIPO' ? 'sesiones' : 'días'}
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                error={ver('valor')}
                ayuda={medirFrecuencia === 'TIPO' ? 'Sesiones de ese tipo cada semana.' : 'Días distintos en que trabajas ese grupo.'}
                className="[&_input]:text-right [&_input]:tabular-nums"
              />
            </div>
          </div>
        )}

        {tipo === 'EVENT' && (
          <div className="flex flex-col gap-3">
            <Select label="Evento" value={evento} onChange={(e) => setEvento(e.target.value)} error={ver('evento')} ayuda="La fecha del objetivo es la del evento.">
              <option value="">Elige un evento…</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {formatDate(e.date)}
                </option>
              ))}
            </Select>
            {eventos.length === 0 && (
              <Aviso tono="info">
                <div>Aún no hay eventos.</div>
                <div>
                  <Button size="sm" onClick={onCrearEvento}>
                    Crear un evento
                  </Button>
                </div>
              </Aviso>
            )}
          </div>
        )}

        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={ver('nombre')} placeholder={sugerido || 'Nombre del objetivo'} ayuda={nombre.trim() ? undefined : sugerido ? 'Si lo dejas vacío, se usa el sugerido.' : undefined} maxLength={200} autoComplete="off" />

        <div className="grid gap-4 sm:grid-cols-2">
          {tipo !== 'EVENT' && <TextField label="Fecha límite (opcional)" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} ayuda="La proyección se calcula hasta esa fecha." />}
          {goal && (
            <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as GoalStatus)}>
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {GOAL_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </div>
        <TextArea label="Notas (opcional)" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function SelectorEjercicio({ ejercicios, valor, onChange, error }: { ejercicios: Exercise[]; valor: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Select label="Ejercicio" value={valor} onChange={(e) => onChange(e.target.value)} error={error}>
      <option value="">Elige un ejercicio…</option>
      {ejercicios.map((e) => (
        <option key={e.id} value={e.id}>
          {e.title}
        </option>
      ))}
    </Select>
  )
}
function SelectorGrupo({ grupos, valor, onChange, error }: { grupos: MuscleGroup[]; valor: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Select label="Grupo muscular" value={valor} onChange={(e) => onChange(e.target.value)} error={error}>
      <option value="">Elige un grupo…</option>
      {grupos.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  )
}

/* ======================= Evento ======================= */
function EventoModal({ evento, onCerrar }: { evento: TrainingEvent | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(evento?.name ?? '')
  const [fecha, setFecha] = useState(evento?.date ?? '')
  const [notas, setNotas] = useState(evento?.notes ?? '')
  const [intentado, setIntentado] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const inicial = useRef<HTMLInputElement>(null)
  const guardar = useApiMutation('entreno:events.save', { success: evento ? 'Evento guardado' : 'Evento creado', silentError: true, onSuccess: onCerrar })
  const borrar = useApiMutation('entreno:events.delete', { success: 'Evento borrado', silentError: true, onSuccess: onCerrar })
  const errorNombre = intentado && !nombre.trim() ? 'Ponle un nombre al evento.' : undefined
  const errorFecha = intentado && !fecha ? 'Pon la fecha del evento.' : undefined
  const enviar = () => {
    setIntentado(true)
    setErrorServidor(null)
    if (!nombre.trim() || !fecha) return
    guardar.mutate([{ id: evento?.id ?? null, name: nombre.trim(), date: fecha, notes: notas.trim() || null }], { onError: (e) => setErrorServidor(e.message) })
  }
  return (
    <>
      <Modal
        titulo={evento ? evento.name : 'Nuevo evento'}
        descripcion={evento ? undefined : 'Una carrera, una competición o cualquier cita con fecha.'}
        ancho="sm"
        inicial={inicial}
        onCerrar={onCerrar}
        pie={
          <>
            {evento && (
              <Button variant="danger" className="mr-auto" icon={<Trash size={16} aria-hidden />} onClick={() => (setErrorServidor(null), setConfirmar(true))}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={enviar} cargando={guardar.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            enviar()
          }}
        >
          {errorServidor && <ErrorDeServidor texto={errorServidor} />}
          <TextField ref={inicial} label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errorNombre} maxLength={200} autoComplete="off" placeholder="HYROX Madrid" />
          <TextField label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} error={errorFecha} />
          <TextArea label="Notas (opcional)" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          <button type="submit" hidden />
        </form>
      </Modal>
      {confirmar && evento && (
        <ConfirmDialog
          titulo={`¿Borrar «${evento.name}»?`}
          texto="Si algún objetivo o bloque apunta a este evento, no se podrá borrar y te lo diremos. No se puede deshacer."
          confirmar="Borrar evento"
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => {
            setConfirmar(false)
            borrar.mutate([evento.id], { onError: (e) => setErrorServidor(e.message) })
          }}
        />
      )}
    </>
  )
}
