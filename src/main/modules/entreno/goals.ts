// Objetivos de entreno (`trn_goals`): alta y edición validadas por tipo, estado (activo, conseguido,
// abandonado) y borrado. El progreso y la proyección son lógica pura de las métricas, no de aquí.
// Las funciones que escriben se llaman dentro de una operación de la cola.
import { GoalSchema, GoalStatusSchema } from '@shared/modules/entreno/schemas'
import type { Goal, GoalInput, GoalStatus, GoalType, WorkoutKind } from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { audit, friendly, lastId, nowIso, parseInput } from './repo'

interface GoalRow {
  id: number
  name: string
  type: GoalType
  target_value: number | null
  target_reps: number | null
  deadline: string | null
  exercise_id: number | null
  group_id: number | null
  event_id: number | null
  kind: WorkoutKind | null
  status: GoalStatus
  notes: string | null
  created_at: string
  updated_at: string
}

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  type: r.type,
  targetValue: r.target_value,
  targetReps: r.target_reps,
  deadline: r.deadline,
  exerciseId: r.exercise_id,
  groupId: r.group_id,
  eventId: r.event_id,
  kind: r.kind,
  status: r.status,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

/** Objetivos: primero los activos y, dentro de cada estado, por fecha límite. */
export function listGoals(db: Db): Goal[] {
  return db
    .all<GoalRow>(
      `SELECT * FROM trn_goals
       ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'ACHIEVED' THEN 1 ELSE 2 END, deadline IS NULL, deadline, id`
    )
    .map(toGoal)
}

function getGoal(db: Db, id: number): Goal {
  const r = db.get<GoalRow>('SELECT * FROM trn_goals WHERE id = ?', [id])
  if (!r) throw new UserError('Ese objetivo ya no existe.')
  return toGoal(r)
}

/** Campos que usa cada tipo; el resto se guarda vacío. */
const USES: Record<GoalType, { value: boolean; reps: boolean; exercise: boolean; group: boolean; event: boolean; kind: boolean }> = {
  E1RM: { value: true, reps: false, exercise: true, group: false, event: false, kind: false },
  WEIGHT_REPS: { value: true, reps: true, exercise: true, group: false, event: false, kind: false },
  WEEKLY_VOLUME: { value: true, reps: false, exercise: true, group: true, event: false, kind: false },
  FREQUENCY: { value: true, reps: false, exercise: false, group: true, event: false, kind: true },
  EVENT: { value: false, reps: false, exercise: false, group: false, event: true, kind: false }
}

/** Crea o edita un objetivo. Valida por tipo (también las referencias) y vacía lo que su tipo no usa. */
export function saveGoal(db: Db, input: GoalInput): Goal {
  const d = parseInput(GoalSchema, input)
  const u = USES[d.type]
  const v = {
    targetValue: u.value ? d.targetValue : null,
    targetReps: u.reps ? d.targetReps : null,
    exerciseId: u.exercise ? d.exerciseId : null,
    groupId: u.group ? d.groupId : null,
    eventId: u.event ? d.eventId : null,
    kind: u.kind ? d.kind : null
  }
  return friendly(() =>
    db.tx(() => {
      if (v.exerciseId !== null && !db.get('SELECT 1 AS x FROM trn_exercises WHERE id = ?', [v.exerciseId]))
        throw new UserError('Ese ejercicio ya no existe.')
      if (v.groupId !== null && !db.get('SELECT 1 AS x FROM trn_muscle_groups WHERE id = ?', [v.groupId]))
        throw new UserError('Ese grupo muscular ya no existe.')
      if (v.eventId !== null && !db.get('SELECT 1 AS x FROM trn_events WHERE id = ?', [v.eventId]))
        throw new UserError('Ese evento ya no existe.')
      const now = nowIso()
      const vals = [d.name, d.type, v.targetValue, v.targetReps, d.deadline, v.exerciseId, v.groupId, v.eventId, v.kind, d.notes]
      let id: number
      let before: Goal | null = null
      if (d.id) {
        before = getGoal(db, d.id)
        db.run(
          `UPDATE trn_goals SET name = ?, type = ?, target_value = ?, target_reps = ?, deadline = ?, exercise_id = ?, group_id = ?,
             event_id = ?, kind = ?, notes = ?, updated_at = ? WHERE id = ?`,
          [...vals, now, d.id]
        )
        id = d.id
      } else {
        db.run(
          `INSERT INTO trn_goals (name, type, target_value, target_reps, deadline, exercise_id, group_id, event_id, kind, notes,
             status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...vals, d.status, now, now]
        )
        id = lastId(db)
      }
      const after = getGoal(db, id)
      audit(db, 'trn_goals', id, before ? 'update' : 'create', d.name, before, after)
      return after
    })
  )
}

/** Cambia el estado de un objetivo (p. ej. marcarlo como conseguido cuando Michael lo confirma). */
export function setGoalStatus(db: Db, id: number, status: GoalStatus): Goal {
  const s = parseInput(GoalStatusSchema, status)
  return db.tx(() => {
    const before = getGoal(db, id)
    if (before.status === s) return before
    db.run('UPDATE trn_goals SET status = ?, updated_at = ? WHERE id = ?', [s, nowIso(), id])
    const after = getGoal(db, id)
    audit(db, 'trn_goals', id, 'status', `${before.name}: ${before.status} → ${s}`, before, after)
    return after
  })
}

export function deleteGoal(db: Db, id: number): void {
  db.tx(() => {
    const before = getGoal(db, id)
    db.run('DELETE FROM trn_goals WHERE id = ?', [id])
    audit(db, 'trn_goals', id, 'delete', before.name, before, null)
  })
}
