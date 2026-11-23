// Escritura de una importación de Hevy ya decidida. El importador (parser + comparación de
// firmas) decide qué sesiones son nuevas, duplicadas o cambiadas; aquí solo se escriben.
//
// `applyHevyWorkouts` se llama dentro de UNA operación de la cola (p. ej.
// `queue.enqueue('entreno:hevy.import', () => applyHevyWorkouts(db, input), { before: copia, audit })`):
// si algo falla, no queda nada a medias.
import { ApplyHevySchema } from '@shared/modules/entreno/schemas'
import type {
  ApplyHevyInput,
  ApplyHevyResult,
  HevySetInput,
  HevyWorkoutInput,
  MeasureType,
  StoredHevyWorkout
} from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { insertExercise } from './exercises'
import { findExerciseByName, friendly, kindFor, kindRules, lastId, nowIso, parseInput, type SetRow, type WorkoutRow } from './repo'

/**
 * Sesiones de Hevy guardadas, por `hevy_key`, con sus series en orden (`exercise_order`,
 * `set_index`). Con `keys`, solo esas. Solo lee.
 */
export function loadHevyWorkouts(db: Db, keys?: readonly string[]): Map<string, StoredHevyWorkout> {
  const out = new Map<string, StoredHevyWorkout>()
  const wanted = keys ? new Set(keys) : null
  const byId = new Map<number, StoredHevyWorkout>()
  for (const w of db.all<WorkoutRow>("SELECT * FROM trn_workouts WHERE source = 'HEVY' ORDER BY start_time, id")) {
    if (!w.hevy_key || (wanted && !wanted.has(w.hevy_key))) continue
    const s: StoredHevyWorkout = {
      id: w.id,
      hevyKey: w.hevy_key,
      title: w.title,
      startTime: w.start_time,
      endTime: w.end_time,
      description: w.description,
      kind: w.kind,
      kindManual: w.kind_manual === 1,
      sets: []
    }
    out.set(w.hevy_key, s)
    byId.set(w.id, s)
  }
  if (byId.size === 0) return out
  for (const r of db.all<SetRow>(
    "SELECT s.* FROM trn_sets s JOIN trn_workouts w ON w.id = s.workout_id WHERE w.source = 'HEVY' ORDER BY s.workout_id, s.exercise_order, s.set_index"
  )) {
    byId.get(r.workout_id)?.sets.push({
      exerciseTitle: r.exercise_title,
      exerciseOrder: r.exercise_order,
      supersetId: r.superset_id,
      exerciseNotes: r.exercise_notes,
      setIndex: r.set_index,
      setType: r.set_type,
      weightKg: r.weight_kg,
      reps: r.reps,
      distanceKm: r.distance_km,
      durationSeconds: r.duration_seconds,
      rpe: r.rpe
    })
  }
  return out
}

/** Tipo de medida de un ejercicio nuevo, según qué columnas traen sus series. */
export function inferMeasure(sets: readonly HevySetInput[]): MeasureType {
  const has = (f: (s: HevySetInput) => number | null) => sets.some((s) => f(s) !== null && f(s) !== 0)
  const w = has((s) => s.weightKg)
  if (has((s) => s.distanceKm)) return w ? 'WEIGHT_DISTANCE' : 'DISTANCE_DURATION'
  if (has((s) => s.reps)) return w ? 'WEIGHT_REPS' : 'REPS'
  if (has((s) => s.durationSeconds)) return w ? 'WEIGHT_DURATION' : 'DURATION'
  return 'WEIGHT_REPS'
}

function insertSets(db: Db, workoutId: number, sets: readonly HevySetInput[], exerciseId: (title: string) => number): number {
  for (const s of sets) {
    db.run(
      `INSERT INTO trn_sets (workout_id, exercise_title, superset_id, exercise_notes, set_index, set_type, weight_kg, reps,
         distance_km, duration_seconds, rpe, exercise_id, exercise_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workoutId,
        s.exerciseTitle,
        s.supersetId,
        s.exerciseNotes,
        s.setIndex,
        s.setType,
        s.weightKg,
        s.reps,
        s.distanceKm,
        s.durationSeconds,
        s.rpe,
        exerciseId(s.exerciseTitle),
        s.exerciseOrder
      ]
    )
  }
  return sets.length
}

/**
 * Escribe una importación de Hevy:
 * - Crea los ejercicios que no existan (por título o alias, sin distinguir mayúsculas) con la
 *   categoría vacía y el tipo de medida deducido de sus series.
 * - Inserta las sesiones nuevas (`source = 'HEVY'`), con el tipo de `kinds[hevyKey]` o, si no,
 *   el de las reglas.
 * - En las cambiadas actualiza fin y descripción y sustituye todas sus series. Conserva
 *   perceived_effort, notes, block_id, routine_id y el tipo si se corrigió a mano (si no, lo
 *   recalcula con las reglas).
 * - Apunta la importación en `trn_imports` y enlaza las sesiones nuevas y cambiadas con ella.
 * No escribe en `audit_log`: eso lo hace quien encola (opción `audit` de la cola).
 */
export function applyHevyWorkouts(db: Db, input: ApplyHevyInput): ApplyHevyResult {
  const d = parseInput(ApplyHevySchema, input)
  const keys = [...d.newWorkouts, ...d.changedWorkouts].map((w) => w.hevyKey)
  if (new Set(keys).size !== keys.length) throw new UserError('La importación tiene sesiones repetidas.')
  return friendly(
    () =>
      db.tx(() => {
        const now = nowIso()
        const rules = kindRules(db)
        const all: HevyWorkoutInput[] = [...d.newWorkouts, ...d.changedWorkouts]

        // Ejercicios: los que no existen se crean una vez, con el tipo de medida de todas sus series.
        const ids = new Map<string, number>()
        const missing = new Map<string, HevySetInput[]>()
        for (const w of all)
          for (const s of w.sets) {
            const k = s.exerciseTitle.toLowerCase()
            if (ids.has(k) || missing.has(k)) {
              missing.get(k)?.push(s)
              continue
            }
            const e = findExerciseByName(db, s.exerciseTitle)
            if (e) ids.set(k, e.id)
            else missing.set(k, [s])
          }
        for (const [k, sets] of missing) ids.set(k, insertExercise(db, sets[0].exerciseTitle, inferMeasure(sets)))
        const exerciseId = (title: string) => ids.get(title.toLowerCase())!

        db.run(
          `INSERT INTO trn_imports (file_name, file_hash, imported_at, format, rows_total, workouts_new, workouts_duplicate,
             workouts_changed, rows_error, exercises_new)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            d.meta.fileName,
            d.meta.fileHash,
            now,
            d.meta.format,
            d.meta.rowsTotal,
            d.newWorkouts.length,
            d.meta.workoutsDuplicate,
            d.changedWorkouts.length,
            d.meta.rowsError,
            missing.size
          ]
        )
        const importId = lastId(db)

        let setsWritten = 0
        for (const w of d.newWorkouts) {
          if (db.get('SELECT 1 AS x FROM trn_workouts WHERE hevy_key = ?', [w.hevyKey]))
            throw new UserError(`La sesión «${w.title}» (${w.startTime.replace('T', ' ')}) ya estaba importada.`)
          const kind = d.kinds?.[w.hevyKey] ?? kindFor(rules, w.title, w.sets.map((s) => s.exerciseTitle))
          db.run(
            `INSERT INTO trn_workouts (title, start_time, end_time, description, kind, kind_manual, source, import_id, hevy_key,
               created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 'HEVY', ?, ?, ?, ?)`,
            [w.title, w.startTime, w.endTime, w.description, kind, importId, w.hevyKey, now, now]
          )
          setsWritten += insertSets(db, lastId(db), w.sets, exerciseId)
        }

        for (const w of d.changedWorkouts) {
          const old = db.get<WorkoutRow>("SELECT * FROM trn_workouts WHERE hevy_key = ? AND source = 'HEVY'", [w.hevyKey])
          if (!old) throw new UserError(`La sesión «${w.title}» (${w.startTime.replace('T', ' ')}) ya no está en la app: vuelve a importar.`)
          const kind = old.kind_manual === 1 ? old.kind : kindFor(rules, w.title, w.sets.map((s) => s.exerciseTitle))
          db.run('DELETE FROM trn_sets WHERE workout_id = ?', [old.id])
          db.run(
            'UPDATE trn_workouts SET title = ?, start_time = ?, end_time = ?, description = ?, kind = ?, import_id = ?, updated_at = ? WHERE id = ?',
            [w.title, w.startTime, w.endTime, w.description, kind, importId, now, old.id]
          )
          setsWritten += insertSets(db, old.id, w.sets, exerciseId)
        }

        return {
          importId,
          workoutsNew: d.newWorkouts.length,
          workoutsChanged: d.changedWorkouts.length,
          workoutsDuplicate: d.meta.workoutsDuplicate,
          exercisesNew: missing.size,
          setsWritten
        }
      }),
    'La importación tiene series repetidas (mismo ejercicio y número de serie en una sesión).'
  )
}
