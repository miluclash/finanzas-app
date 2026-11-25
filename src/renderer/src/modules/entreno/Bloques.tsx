// Plan › Bloques: etapas de entrenamiento con fechas, objetivo principal y sesiones previstas por semana. No pueden solaparse.
import { PencilSimple, Plus, Stack, Trash } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { formatDate, todayISO } from '@shared/dates'
import type { Block, TrainingEvent, WorkoutKind } from '@shared/modules/entreno/types'
import { Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, Modal, Select, Tag, TextArea, TextField, Tooltip } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { KIND_LABEL, leerEntero } from './format'
import { ErrorDeServidor } from './PlanPiezas'

const PREVISTAS: { kind: WorkoutKind; campo: 'plannedGym' | 'plannedSwim' | 'plannedHyrox' | 'plannedRun' | 'plannedOther' }[] = [
  { kind: 'GYM', campo: 'plannedGym' },
  { kind: 'SWIM', campo: 'plannedSwim' },
  { kind: 'HYROX', campo: 'plannedHyrox' },
  { kind: 'RUN', campo: 'plannedRun' },
  { kind: 'OTHER', campo: 'plannedOther' }
]

/** «4 gimnasio · 2 natación» (solo los que no son cero) */
const resumenPrevistas = (b: Block): string => {
  const partes = PREVISTAS.filter((p) => b[p.campo] > 0).map((p) => `${b[p.campo]} ${KIND_LABEL[p.kind].toLowerCase()}`)
  return partes.length ? `${partes.join(' · ')} por semana` : 'Sin sesiones previstas'
}

export function BloquesPlan() {
  const q = useApi('entreno:blocks.list', [])
  const eventos = useApi('entreno:events.list', [])
  const [editando, setEditando] = useState<number | 'nuevo' | null>(null)
  const hoy = todayISO()
  const nombreEvento = new Map((eventos.data ?? []).map((e) => [e.id, e.name]))
  const lista = [...(q.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="t-label max-w-3xl">
          Un bloque es una etapa con su objetivo (por ejemplo «Preparación HYROX»). Las sesiones se asignan solas al bloque que cubre su fecha. Los bloques no pueden solaparse.
        </p>
        <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setEditando('nuevo')}>
          Nuevo bloque
        </Button>
      </div>
      {q.isLoading && <LoadingState filas={3} etiqueta="Cargando los bloques" />}
      {q.error && (
        <ErrorState
          titulo="No se han podido cargar los bloques"
          texto={q.error.message}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {q.data && q.data.length === 0 && (
        <div className="card">
          <EmptyState
            icono={<Stack size={24} weight="duotone" aria-hidden />}
            titulo="Aún no tienes bloques"
            texto="Crea uno para agrupar tus sesiones por etapas y, más adelante, ver cómo evoluciona cada una."
            accion={
              <Button variant="primary" icon={<Plus size={16} weight="bold" aria-hidden />} onClick={() => setEditando('nuevo')}>
                Crear el primero
              </Button>
            }
          />
        </div>
      )}
      {lista.length > 0 && (
        <ul className="divide-line r-card border border-line bg-card" aria-label="Bloques">
          {lista.map((b) => {
            const enCurso = b.startDate <= hoy && (b.endDate === null || b.endDate >= hoy)
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="flex min-w-56 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="t-body max-w-full truncate text-left font-semibold hover:underline" onClick={() => setEditando(b.id)} title={b.name} aria-label={`Editar ${b.name}`}>
                      {b.name}
                    </button>
                    {enCurso && <Tag tono="accent">En curso</Tag>}
                    {b.isDeload && <Tag tono="info">Semana de descarga</Tag>}
                    {b.eventId !== null && <Tag>Fase de {nombreEvento.get(b.eventId) ?? 'un evento'}</Tag>}
                  </div>
                  <p className="t-label tnum">
                    {formatDate(b.startDate)} – {b.endDate ? formatDate(b.endDate) : 'sin fecha de fin'}
                  </p>
                  {b.mainGoal && <p className="t-label">Objetivo: {b.mainGoal}</p>}
                  <p className="t-meta">
                    {resumenPrevistas(b)} · {b.workoutCount} {b.workoutCount === 1 ? 'sesión hecha' : 'sesiones hechas'}
                  </p>
                </div>
                <Tooltip texto="Editar">
                  <IconButton variant="ghost" size="sm" etiqueta={`Editar ${b.name}`} icono={<PencilSimple size={16} />} onClick={() => setEditando(b.id)} />
                </Tooltip>
              </li>
            )
          })}
        </ul>
      )}
      {editando !== null && <BloqueModal id={editando} bloques={q.data ?? []} eventos={eventos.data ?? []} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

function BloqueModal({ id, bloques, eventos, onCerrar }: { id: number | 'nuevo'; bloques: Block[]; eventos: TrainingEvent[]; onCerrar: () => void }) {
  const actual = id === 'nuevo' ? null : (bloques.find((b) => b.id === id) ?? null)
  const [nombre, setNombre] = useState(actual?.name ?? '')
  const [inicio, setInicio] = useState(actual?.startDate ?? todayISO())
  const [fin, setFin] = useState(actual?.endDate ?? '')
  const [objetivo, setObjetivo] = useState(actual?.mainGoal ?? '')
  const [prev, setPrev] = useState<Record<string, string>>(() =>
    Object.fromEntries(PREVISTAS.map((p) => [p.campo, String(actual ? actual[p.campo] : p.campo === 'plannedGym' ? 4 : p.campo === 'plannedSwim' ? 2 : 0)]))
  )
  const [evento, setEvento] = useState(actual?.eventId === null || !actual ? '' : String(actual.eventId))
  const [descarga, setDescarga] = useState(actual?.isDeload ?? false)
  const [notas, setNotas] = useState(actual?.notes ?? '')
  const [intentado, setIntentado] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const inicial = useRef<HTMLInputElement>(null)

  const guardar = useApiMutation('entreno:blocks.save', { success: id === 'nuevo' ? 'Bloque creado' : 'Bloque guardado', silentError: true, onSuccess: onCerrar })
  const borrar = useApiMutation('entreno:blocks.delete', { success: 'Bloque borrado', silentError: true, onSuccess: onCerrar })

  const cuentas = PREVISTAS.map((p) => ({ ...p, valor: leerEntero(prev[p.campo]) }))
  const cuentaMala = (v: number | null) => v === null || Number.isNaN(v) || v > 50
  const errorNombre = intentado && !nombre.trim() ? 'Ponle un nombre al bloque.' : undefined
  const errorInicio = intentado && !inicio ? 'Pon la fecha de inicio.' : undefined
  const errorFin = fin && inicio && fin < inicio ? 'La fecha de fin no puede ser anterior a la de inicio.' : undefined
  const errorCuentas = intentado && cuentas.some((c) => cuentaMala(c.valor)) ? 'Las sesiones previstas son números enteros de 0 a 50.' : undefined

  const enviar = () => {
    setIntentado(true)
    setErrorServidor(null)
    if (!nombre.trim() || !inicio || errorFin || cuentas.some((c) => cuentaMala(c.valor))) return
    const n = Object.fromEntries(cuentas.map((c) => [c.campo, c.valor as number])) as Record<(typeof PREVISTAS)[number]['campo'], number>
    guardar.mutate(
      [
        {
          id: actual?.id ?? null,
          name: nombre.trim(),
          startDate: inicio,
          endDate: fin || null,
          mainGoal: objetivo.trim() || null,
          ...n,
          notes: notas.trim() || null,
          eventId: evento === '' ? null : Number(evento),
          isDeload: descarga
        }
      ],
      { onError: (e) => setErrorServidor(e.message) }
    )
  }

  if (id !== 'nuevo' && !actual) return null

  return (
    <>
      <Modal
        titulo={actual ? actual.name : 'Nuevo bloque'}
        descripcion={actual ? `${actual.workoutCount} ${actual.workoutCount === 1 ? 'sesión dentro de sus fechas' : 'sesiones dentro de sus fechas'}` : 'Una etapa de tu entrenamiento.'}
        ancho="lg"
        inicial={inicial}
        onCerrar={onCerrar}
        pie={
          <>
            {actual && (
              <Button variant="danger" className="mr-auto" icon={<Trash size={16} aria-hidden />} onClick={() => (setErrorServidor(null), setConfirmarBorrar(true))}>
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
        <div className="flex flex-col gap-6">
          {errorServidor && <ErrorDeServidor texto={errorServidor} />}
          <TextField ref={inicial} label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errorNombre} maxLength={200} autoComplete="off" placeholder="Preparación HYROX, Volumen de invierno…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Empieza" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} error={errorInicio} />
            <TextField label="Termina (opcional)" type="date" value={fin} min={inicio || undefined} onChange={(e) => setFin(e.target.value)} error={errorFin} ayuda="Sin fecha, el bloque sigue abierto." />
          </div>
          <TextField label="Objetivo principal (opcional)" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} autoComplete="off" placeholder="Subir el press banca, llegar fino a la carrera…" />

          <fieldset>
            <legend className="t-card-title mb-1">Sesiones previstas por semana</legend>
            <p className="t-label mb-3">Cuántas sesiones de cada tipo quieres hacer cada semana de este bloque.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {PREVISTAS.map((p) => (
                <TextField key={p.campo} label={KIND_LABEL[p.kind]} tamano="sm" inputMode="numeric" value={prev[p.campo]} onChange={(e) => setPrev({ ...prev, [p.campo]: e.target.value })} className="[&_input]:text-right [&_input]:tabular-nums" />
              ))}
            </div>
            {errorCuentas && (
              <p className="field-error mt-2" role="alert">
                {errorCuentas}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Es una fase del evento" value={evento} onChange={(e) => setEvento(e.target.value)} ayuda={eventos.length === 0 ? 'Aún no hay eventos. Se crean en Objetivos.' : 'Para ver la cuenta atrás y las fases en el Resumen.'}>
              <option value="">Ninguno</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {formatDate(e.date)}
                </option>
              ))}
            </Select>
            <div className="pt-6">
              <Checkbox checked={descarga} onChange={setDescarga} label="Semana de descarga" ayuda="Se anota en el gráfico de volumen." />
            </div>
          </div>
          <TextArea label="Notas (opcional)" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </Modal>
      {confirmarBorrar && actual && (
        <ConfirmDialog
          titulo={`¿Borrar «${actual.name}»?`}
          texto="Se quita el bloque y sus sesiones quedan sin bloque. Las sesiones no se borran. No se puede deshacer."
          confirmar="Borrar bloque"
          onCancelar={() => setConfirmarBorrar(false)}
          onConfirmar={() => {
            setConfirmarBorrar(false)
            borrar.mutate([actual.id], { onError: (e) => setErrorServidor(e.message) })
          }}
        />
      )}
    </>
  )
}
