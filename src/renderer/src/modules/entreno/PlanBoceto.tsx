// Plan › Semana base (boceto): qué toca cada día de la semana, sin fechas. Cada cambio se guarda al momento.
import { Info } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import type { BaseWeekSlot, BaseWeekSlotInput, Routine } from '@shared/modules/entreno/types'
import { Button, ErrorState, LoadingState } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { WEEKDAY_LABEL } from './format'
import { DiasPlan, HuecoModal, type DiaVista, type HuecoForm } from './PlanPiezas'

type Editando = { dia: number; hueco: number | null }

/** Los huecos agrupados por día (índice 0 = lunes), en su orden. */
function porDia(slots: BaseWeekSlot[]): BaseWeekSlotInput[][] {
  const dias: BaseWeekSlotInput[][] = [[], [], [], [], [], [], []]
  for (const s of [...slots].sort((a, b) => a.weekday - b.weekday || a.order - b.order)) dias[s.weekday - 1].push({ weekday: s.weekday, routineId: s.routineId, time: s.time })
  return dias
}
const aplanar = (dias: BaseWeekSlotInput[][]): BaseWeekSlotInput[] => dias.flat()

export function PlanBoceto({ rutinas, onCrearTipos }: { rutinas: Routine[]; onCrearTipos: () => void }) {
  const q = useApi('entreno:baseWeek.get', [])
  const guardar = useApiMutation('entreno:baseWeek.save', {})
  const [editando, setEditando] = useState<Editando | null>(null)
  const slots = q.data?.slots

  const dias: DiaVista[] = useMemo(
    () =>
      WEEKDAY_LABEL.map((titulo, i) => ({
        id: String(i + 1),
        titulo,
        huecos: (slots ?? [])
          .filter((s) => s.weekday === i + 1)
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ key: `${s.weekday}-${s.order}`, nombre: s.routineName, kind: s.routineKind, time: s.time, inactivo: rutinas.some((r) => r.id === s.routineId && !r.active) }))
      })),
    [slots, rutinas]
  )

  const aplicar = (cambiar: (d: BaseWeekSlotInput[][]) => void, opts?: { onSuccess?: () => void }) => {
    if (!slots) return
    const d = porDia(slots)
    cambiar(d)
    guardar.mutate([aplanar(d)], opts)
  }

  const guardarHueco = (v: HuecoForm) => {
    if (!editando) return
    aplicar(
      (d) => {
        const nuevo: BaseWeekSlotInput = { weekday: editando.dia + 1, routineId: v.routineId, time: v.time }
        if (editando.hueco === null) d[editando.dia].push(nuevo)
        else d[editando.dia][editando.hueco] = nuevo
      },
      { onSuccess: () => setEditando(null) }
    )
  }

  const actualId = editando && editando.hueco !== null && slots ? porDia(slots)[editando.dia][editando.hueco]?.routineId : undefined
  const opciones = rutinas.filter((r) => r.active || r.id === actualId)
  const inicial =
    editando && editando.hueco !== null && slots
      ? (() => {
          const s = porDia(slots)[editando.dia][editando.hueco]
          return s ? { routineId: s.routineId, time: s.time ?? null, note: null } : undefined
        })()
      : undefined

  return (
    <div className="flex flex-col gap-6">
      <p className="t-label flex items-start gap-2">
        <Info size={18} aria-hidden className="mt-px shrink-0 text-info" />
        <span>El boceto es tu semana tipo. Cambiarlo solo afecta a la semana actual, si aún no la has editado, y a las futuras. Las semanas pasadas no cambian.</span>
      </p>
      {q.isLoading && <LoadingState filas={5} etiqueta="Cargando el boceto" />}
      {q.error && (
        <ErrorState
          titulo="No se ha podido cargar el boceto"
          texto={q.error.message}
          accion={
            <Button size="sm" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {slots && (
        <DiasPlan
          dias={dias}
          etiqueta="Días de la semana base"
          ocupado={guardar.isPending}
          onAñadir={(dia) => setEditando({ dia, hueco: null })}
          onEditar={(dia, hueco) => setEditando({ dia, hueco })}
          onQuitar={(dia, hueco) => aplicar((d) => void d[dia].splice(hueco, 1))}
          onMover={(dia, hueco, destino) =>
            aplicar((d) => {
              const [s] = d[dia].splice(hueco, 1)
              d[destino].push({ ...s, weekday: destino + 1 })
            })
          }
          onReordenar={(dia, hueco, delta) =>
            aplicar((d) => {
              const [s] = d[dia].splice(hueco, 1)
              d[dia].splice(hueco + delta, 0, s)
            })
          }
        />
      )}
      {editando && (
        <HuecoModal
          titulo={editando.hueco === null ? `Añadir un entreno el ${WEEKDAY_LABEL[editando.dia].toLowerCase()}` : 'Cambiar el entreno'}
          descripcion={`${WEEKDAY_LABEL[editando.dia]} de la semana base`}
          rutinas={opciones}
          inicial={inicial}
          guardando={guardar.isPending}
          onGuardar={guardarHueco}
          onCerrar={() => setEditando(null)}
          onCrearTipos={() => (setEditando(null), onCrearTipos())}
        />
      )}
    </div>
  )
}
