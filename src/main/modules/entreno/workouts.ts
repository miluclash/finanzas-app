// Sesiones de entreno: listado, detalle, campos propios (tipo, esfuerzo, notas, bloque, rutina),
// sesiones manuales y borrado. Las funciones que escriben se llaman dentro de una operación de la cola.
import { ManualWorkoutSchema, WorkoutExtrasSchema, WorkoutFilterInput } from '@shared/modules/entreno/schemas'
import type {
  ManualWorkoutInput,
  WorkoutDetail,
  WorkoutExercise,
  WorkoutExtrasInput,
  WorkoutFilter,
  WorkoutSummary
} from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import {
  audit,
  checkPlanRefs,
  durationSeconds,
  friendly,
  kindFor,
  kindRules,
  lastId,
  nowIso,
  parseInput,
  requireExercise,
  requireWorkout,
  toWorkout,
  type SetRow,
  type WorkoutRow
} from './repo'

interface SummaryRow extends WorkoutRow {
  exercise_count: number
  set_count: number
}

const SUMMARY_SQL = `SELECT w.*,
  (SELECT COUNT(DISTINCT s.exercise_order) FROM trn_sets s WHERE s.workout_id = w.id) AS exercise_count,
  (SELECT COUNT(*) FROM trn_sets s WHERE s.workout_id = w.id) AS set_count
FROM trn_workouts w`

function toSummary(r: SummaryRow): WorkoutSummary {
  return {
    ...toWorkout(r),
    durationSeconds: durationSeconds(r.start_time, r.end_time),
    exerciseCount: r.exercise_count,
    setCount: r.set_count
  }
}

/** Sesiones, de la más reciente a la más antigua, con su resumen. */
export function listWorkouts(db: Db, filter: WorkoutFilter = {}): WorkoutSummary[] {
  const f = parseInput(WorkoutFilterInput, filter ?? {})
  const where: string[] = []
  const params: Array<string | number | null> = []
  if (f.kind) {
    where.push('w.kind = ?')
    params.push(f.kind)
  }
  if (f.source) {
    where.push('w.source = ?')
    params.push(f.source)
  }
  if (f.from) {
    where.push('w.start_time >= ?')
    params.push(f.from)
  }
  if (f.to) {
    // `start_time` es `YYYY-MM-DDTHH:mm`: todo el día `to` queda por debajo de `to` + 'U'.
    where.push('w.start_time < ?')
    params.push(`${f.to}U`)
  }
  if (f.search) {
    const like = `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    where.push(
      `(w.title LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\' OR w.notes LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM trn_sets s WHERE s.workout_id = w.id AND s.exercise_title LIKE ? ESCAPE '\\'))`
    )
    params.push(like, like, like, like)
  }
  const limit = f.limit ? ` LIMIT ${f.limit} OFFSET ${f.offset ?? 0}` : ''
  return db
    .all<SummaryRow>(`${SUMMARY_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY w.start_time DESC, w.id DESC${limit}`, params)
    .map(toSummary)
}

export function setsOf(db: Db, workoutId: number): SetRow[] {
  return db.all<SetRow>('SELECT * FROM trn_sets WHERE workout_id = ? ORDER BY exercise_order, set_index', [workoutId])
}

/** Sesión con sus ejercicios y series en orden. */
export function getWorkout(db: Db, id: number): WorkoutDetail {
  const row = db.get<SummaryRow>(`${SUMMARY_SQL} WHERE w.id = ?`, [id])
  if (!row) throw new UserError('Esa sesión ya no existe.')
  const titles = new Map(
    db
      .all<{ id: number; title: string }>(
        'SELECT DISTINCT e.id, e.title FROM trn_sets s JOIN trn_exercises e ON e.id = s.exercise_id WHERE s.workout_id = ?',
        [id]
      )
      .map((e) => [e.id, e.title])
  )
  const exercises: WorkoutExercise[] = []
  for (const s of setsOf(db, id)) {
    let ex = exercises[exercises.length - 1]
    if (!ex || ex.exerciseOrder !== s.exercise_order) {
      ex = {
        exerciseOrder: s.exercise_order,
        exerciseId: s.exercise_id,
        exerciseTitle: s.exercise_title,
        catalogTitle: titles.get(s.exercise_id) ?? s.exercise_title,
        supersetId: s.superset_id,
        exerciseNotes: s.exercise_notes,
        sets: []
      }
      exercises.push(ex)
    }
    ex.sets.push({
      id: s.id,
      setIndex: s.set_index,
      setType: s.set_type,
      weightKg: s.weight_kg,
      reps: s.reps,
      distanceKm: s.distance_km,
      durationSeconds: s.duration_seconds,
      rpe: s.rpe,
      notes: s.notes
    })
  }
  return { ...toSummary(row), exercises }
}

/** Títulos de ejercicio de una sesión (para las reglas de tipo). */
export function exerciseTitlesOf(db: Db, workoutId: number): string[] {
  return db.all<{ t: string }>('SELECT DISTINCT exercise_title AS t FROM trn_sets WHERE workout_id = ?', [workoutId]).map((r) => r.t)
}

/**
 * Cambia los campos propios de una sesión. Poner un tipo lo marca como corregido a mano
 * (`kind_manual = 1`); `kind: null` lo devuelve a automático y lo recalcula con las reglas.
 */
export function updateWorkoutExtras(db: Db, input: WorkoutExtrasInput): WorkoutDetail {
  const d = parseInput(WorkoutExtrasSchema, input)
  return friendly(() =>
    db.tx(() => {
      const before = requireWorkout(db, d.id)
      checkPlanRefs(db, d.blockId, d.routineId)
      const sets: string[] = []
      const params: Array<string | number | null> = []
      const put = (col: string, v: string | number | null) => {
        sets.push(`${col} = ?`)
        params.push(v)
      }
      if (d.kind !== undefined) {
        if (d.kind === null) {
          put('kind', kindFor(kindRules(db), before.title, exerciseTitlesOf(db, d.id)))
          put('kind_manual', 0)
        } else {
          put('kind', d.kind)
          put('kind_manual', 1)
        }
      }
      if (d.perceivedEffort !== undefined) put('perceived_effort', d.perceivedEffort)
      if (d.notes !== undefined) put('notes', d.notes)
      if (d.blockId !== undefined) put('block_id', d.blockId)
      if (d.routineId !== undefined) put('routine_id', d.routineId)
      if (sets.length === 0) return getWorkout(db, d.id)
      put('updated_at', nowIso())
      db.run(`UPDATE trn_workouts SET ${sets.join(', ')} WHERE id = ?`, [...params, d.id])
      const after = requireWorkout(db, d.id)
      audit(db, 'trn_workouts', d.id, 'update', before.title, toWorkout(before), toWorkout(after))
      return getWorkout(db, d.id)
    })
  )
}

/** Crea o edita una sesión MANUAL completa (sustituye todas sus series). */
export function saveManualWorkout(db: Db, input: ManualWorkoutInput): WorkoutDetail {
  const d = parseInput(ManualWorkoutSchema, input)
  return friendly(() =>
    db.tx(() => {
      checkPlanRefs(db, d.blockId, d.routineId)
      const exercises = d.exercises.map((e) => ({ ...e, row: requireExercise(db, e.exerciseId) }))
      const kind = d.kind ?? kindFor(kindRules(db), d.title, exercises.map((e) => e.row.title))
      const kindManual = d.kind ? 1 : 0
      const now = nowIso()
      let id: number
      let before: WorkoutDetail | null = null
      if (d.id) {
        const existing = requireWorkout(db, d.id)
        if (existing.source !== 'MANUAL')
          throw new UserError('Las sesiones importadas de Hevy no se editan aquí: cambia las series en Hevy y vuelve a importar.')
        before = getWorkout(db, d.id)
        id = d.id
        db.run(
          `UPDATE trn_workouts SET title = ?, start_time = ?, end_time = ?, description = ?, kind = ?, kind_manual = ?,
             perceived_effort = ?, notes = ?, block_id = ?, routine_id = ?, updated_at = ? WHERE id = ?`,
          [d.title, d.startTime, d.endTime, d.description, kind, kindManual, d.perceivedEffort, d.notes, d.blockId, d.routineId, now, id]
        )
        db.run('DELETE FROM trn_sets WHERE workout_id = ?', [id])
      } else {
        db.run(
          `INSERT INTO trn_workouts (title, start_time, end_time, description, kind, kind_manual, perceived_effort, notes,
             block_id, routine_id, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)`,
          [d.title, d.startTime, d.endTime, d.description, kind, kindManual, d.perceivedEffort, d.notes, d.blockId, d.routineId, now, now]
        )
        id = lastId(db)
      }
      exercises.forEach((e, order) => {
        e.sets.forEach((s, index) => {
          db.run(
            `INSERT INTO trn_sets (workout_id, exercise_title, superset_id, exercise_notes, set_index, set_type, weight_kg, reps,
               distance_km, duration_seconds, rpe, exercise_id, exercise_order, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, e.row.title, e.supersetId, e.exerciseNotes, index, s.setType, s.weightKg, s.reps, s.distanceKm, s.durationSeconds, s.rpe, e.row.id, order, s.notes]
          )
        })
      })
      const after = getWorkout(db, id)
      audit(db, 'trn_workouts', id, before ? 'update' : 'create', d.title, before, after)
      return after
    })
  )
}

/** Borra una sesión (sus series se borran con ella, ON DELETE CASCADE). */
export function deleteWorkout(db: Db, id: number): void {
  db.tx(() => {
    const before = getWorkout(db, id)
    db.run('DELETE FROM trn_workouts WHERE id = ?', [id])
    audit(db, 'trn_workouts', id, 'delete', before.title, before, null)
  })
}
