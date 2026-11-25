// Plan › Esta semana: los siete días con sus huecos. Se puede cambiar de semana, añadir, quitar, mover de día y reordenar.
import { ArrowCounterClockwise, CalendarCheck, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { addDays, todayISO } from '@shared/dates'
import { mondayOf, weekDates } from '@shared/modules/entreno/plan'
import type { Routine, WeekPlan, WeekPlanSlot, WeekPlanSlotInput } from '@shared/modules/entreno/types'
import { Aviso, Button, ConfirmDialog, ErrorState, IconButton, LoadingState, Tag } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { fechaCorta, rangoSemana, WEEKDAY_LABEL } from './format'
import { DiasPlan, HuecoModal, type DiaVista, type HuecoForm } from './PlanPiezas'

const aEntrada = (s: WeekPlanSlot): WeekPlanSlotInput => ({ date: s.date, routineId: s.routineId, time: s.time, note: s.note })

type Editando = { dia: number; hueco: number | null }

export function PlanSemana({ rutinas, onCrearTipos }: { rutinas: Routine[]; onCrearTipos: () => void }) {
  const hoy = todayISO()
  const actual = mondayOf(hoy)
  const [semana, setSemana] = useState(actual)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [confirmarBoceto, setConfirmarBoceto] = useState(false)
  const q = useApi('entreno:weekPlan.get', [semana])
  const guardar = useApiMutation('entreno:weekPlan.save', {})
  const mover = useApiMutation('entreno:weekPlan.move', {})
  const quitar = useApiMutation('entreno:weekPlan.remove', { success: 'Entreno quitado de la semana' })
  const volver = useApiMutation('entreno:weekPlan.resetToBase', { success: 'Semana vuelta al boceto' })
  const ocupado = guardar.isPending || mover.isPending || quitar.isPending || volver.isPending

  const fechas = useMemo(() => weekDates(semana), [semana])
  const plan: WeekPlan | undefined = q.data
  // En una semana anterior al primer boceto sin guardar, el proceso principal devuelve el boceto actual proyectado: no hubo plan, así que no se enseña.
  const sinPlan = !!plan && plan.predatesBase && !plan.saved
  const huecos: WeekPlanSlot[] = sinPlan ? [] : (plan?.slots ?? [])
  const dias: DiaVista[] = useMemo(
    () =>
      fechas.map((f, i) => ({
        id: f,
        titulo: WEEKDAY_LABEL[i],
        subtitulo: fechaCorta(f),
        hoy: f === hoy,
        huecos: huecos
          .filter((s) => s.date === f)
          .map((s) => ({
            key: `${s.date}-${s.order}`,
            nombre: s.routineName,
            kind: s.routineKind,
            time: s.time,
            note: s.note,
            inactivo: rutinas.some((r) => r.id === s.routineId && !r.active)
          }))
      })),
    [fechas, huecos, hoy, rutinas]
  )

  const huecoDe = (dia: number, hueco: number): WeekPlanSlot | undefined => huecos.filter((s) => s.date === fechas[dia])[hueco]

  const guardarHueco = (v: HuecoForm) => {
    if (!editando || !plan) return
    const todos = huecos
    let nuevos: WeekPlanSlotInput[]
    if (editando.hueco === null) nuevos = [...todos.map(aEntrada), { date: fechas[editando.dia], routineId: v.routineId, time: v.time, note: v.note }]
    else {
      const objetivo = huecoDe(editando.dia, editando.hueco)
      nuevos = todos.map((s) => (s === objetivo ? { date: s.date, routineId: v.routineId, time: v.time, note: v.note } : aEntrada(s)))
    }
    guardar.mutate([semana, nuevos], { onSuccess: () => setEditando(null) })
  }

  // Los tipos que se ofrecen: los activos y, al editar, el que ya tiene el hueco aunque esté desactivado.
  const actualId = editando && editando.hueco !== null ? huecoDe(editando.dia, editando.hueco)?.routineId : undefined
  const opciones = rutinas.filter((r) => r.active || r.id === actualId)

  const esActual = semana === actual
  const relativa = semana < actual ? 'Pasada' : semana > actual ? 'Futura' : 'Esta semana'
  const total = huecos.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Cambiar de semana">
          <IconButton etiqueta="Semana anterior" icono={<CaretLeft size={16} />} onClick={() => setSemana(addDays(semana, -7))} />
          <IconButton etiqueta="Semana siguiente" icono={<CaretRight size={16} />} onClick={() => setSemana(addDays(semana, 7))} />
        </div>
        <div className="min-w-0">
          <h2 className="t-section tnum" aria-live="polite">
            {plan ? rangoSemana(plan.weekStart, plan.weekEnd) : rangoSemana(semana, addDays(semana, 6))}
          </h2>
        </div>
        <Tag tono={esActual ? 'accent' : undefined}>{relativa}</Tag>
        <Button size="sm" variant="ghost" icon={<CalendarCheck size={16} aria-hidden />} disabled={esActual} onClick={() => setSemana(actual)}>
          Ir a esta semana
        </Button>
      </div>

      {q.isLoading && <LoadingState filas={5} etiqueta="Cargando la semana" />}
      {q.error && (
        <ErrorState
          titulo="No se ha podido cargar la semana"
          texto={q.error.message}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {plan && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Estado del plan de la semana">
            {sinPlan ? (
              <Tag>Sin plan</Tag>
            ) : plan.saved && plan.origin === 'EDITED' ? (
              <Tag tono="accent">Editada por ti</Tag>
            ) : (
              <Tag tono="info">Sale del boceto</Tag>
            )}
            <span className="t-label">
              {sinPlan
                ? 'Es anterior a tu primer boceto: entonces no tenías plan.'
                : plan.saved && plan.origin === 'EDITED'
                  ? 'Has cambiado esta semana: ya no sigue al boceto.'
                  : plan.saved
                    ? 'Es una copia del boceto de cuando empezó la semana.'
                    : 'Aún no has tocado nada: se usa el boceto actual.'}
            </span>
            <span className="t-meta tnum">
              {total === 0 ? 'Ningún entreno' : `${total} ${total === 1 ? 'entreno' : 'entrenos'}`}
            </span>
            {!sinPlan && (
              <Button size="sm" className="ml-auto" icon={<ArrowCounterClockwise size={16} aria-hidden />} disabled={ocupado || !plan.saved} onClick={() => setConfirmarBoceto(true)}>
                Volver al boceto
              </Button>
            )}
          </div>
          {sinPlan && (
            <Aviso tono="info">
              <div>Si quieres dejar constancia de lo que tocaba, puedes planificarla igualmente.</div>
            </Aviso>
          )}
          <DiasPlan
            dias={dias}
            etiqueta="Días de la semana"
            ocupado={ocupado}
            onAñadir={(dia) => setEditando({ dia, hueco: null })}
            onEditar={(dia, hueco) => setEditando({ dia, hueco })}
            onQuitar={(dia, hueco) => {
              const s = huecoDe(dia, hueco)
              if (s) quitar.mutate([{ date: s.date, order: s.order }])
            }}
            onMover={(dia, hueco, destino) => {
              const s = huecoDe(dia, hueco)
              if (s) mover.mutate([{ from: { date: s.date, order: s.order }, to: { date: fechas[destino] } }])
            }}
            onReordenar={(dia, hueco, delta) => {
              const s = huecoDe(dia, hueco)
              if (s) mover.mutate([{ from: { date: s.date, order: s.order }, to: { date: s.date, order: s.order + delta } }])
            }}
          />
        </>
      )}

      {editando && (
        <HuecoModal
          titulo={editando.hueco === null ? `Añadir un entreno el ${WEEKDAY_LABEL[editando.dia].toLowerCase()}` : 'Cambiar el entreno'}
          descripcion={`${WEEKDAY_LABEL[editando.dia]} ${fechaCorta(fechas[editando.dia])}`}
          rutinas={opciones}
          conNota
          inicial={(() => {
            const s = editando.hueco === null ? undefined : huecoDe(editando.dia, editando.hueco)
            return s ? { routineId: s.routineId, time: s.time, note: s.note } : undefined
          })()}
          guardando={guardar.isPending}
          onGuardar={guardarHueco}
          onCerrar={() => setEditando(null)}
          onCrearTipos={() => (setEditando(null), onCrearTipos())}
        />
      )}
      {confirmarBoceto && (
        <ConfirmDialog
          titulo="¿Volver al boceto?"
          texto={`Esta semana (${rangoSemana(semana, addDays(semana, 6))}) se rehace con el boceto actual. Lo que hayas cambiado en ella se pierde.`}
          confirmar="Volver al boceto"
          onCancelar={() => setConfirmarBoceto(false)}
          onConfirmar={() => {
            setConfirmarBoceto(false)
            volver.mutate([semana])
          }}
        />
      )}
    </div>
  )
}
