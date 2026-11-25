// Catálogo de ejercicios: listado, alta/edición con grupos musculares, alias y unión de dos
// ejercicios. Las funciones que escriben se llaman dentro de una operación de la cola.
import { matchHyroxStation } from '@shared/modules/entreno/hyrox'
import { AliasSchema, ExerciseSchema } from '@shared/modules/entreno/schemas'
import type { Exercise, ExerciseInput, MeasureType } from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { audit, friendly, lastId, nowIso, parseInput, requireExercise, type ExerciseRow } from './repo'

interface ExerciseListRow extends ExerciseRow {
  set_count: number
  last_used: string | null
}

export function listExercises(db: Db): Exercise[] {
  const rows = db.all<ExerciseListRow>(
    `SELECT e.*,
       (SELECT COUNT(*) FROM trn_sets s WHERE s.exercise_id = e.id) AS set_count,
       (SELECT MAX(w.start_time) FROM trn_sets s JOIN trn_workouts w ON w.id = s.workout_id WHERE s.exercise_id = e.id) AS last_used
     FROM trn_exercises e
     ORDER BY e.title COLLATE NOCASE`
  )
  const muscles = db.all<{ exercise_id: number; group_id: number; role: string }>(
    `SELECT m.exercise_id, m.group_id, m.role FROM trn_exercise_muscles m
     JOIN trn_muscle_groups g ON g.id = m.group_id ORDER BY g.sort_order, g.id`
  )
  const aliases = db.all<{ id: number; alias: string; exercise_id: number }>(
    'SELECT id, alias, exercise_id FROM trn_exercise_aliases ORDER BY alias COLLATE NOCASE'
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    measure: r.measure,
    isBodyweight: r.is_bodyweight === 1,
    active: r.active === 1,
    notes: r.notes,
    primaryGroupId: muscles.find((m) => m.exercise_id === r.id && m.role === 'primary')?.group_id ?? null,
    secondaryGroupIds: muscles.filter((m) => m.exercise_id === r.id && m.role === 'secondary').map((m) => m.group_id),
    aliases: aliases.filter((a) => a.exercise_id === r.id).map((a) => ({ id: a.id, alias: a.alias })),
    hyroxStation: r.hyrox_station,
    setCount: r.set_count,
    lastUsed: r.last_used
  }))
}

export function getExercise(db: Db, id: number): Exercise {
  const e = listExercises(db).find((x) => x.id === id)
  if (!e) throw new UserError('Ese ejercicio ya no existe.')
  return e
}

/** El nombre no puede ser el título ni el alias de otro ejercicio. */
function checkNameFree(db: Db, name: string, ownId: number | null, what: string): void {
  const t = db.get<{ id: number }>('SELECT id FROM trn_exercises WHERE title = ? COLLATE NOCASE', [name])
  if (t && t.id !== ownId) throw new UserError(`Ya hay un ejercicio que se llama «${name}». ${what}`)
  const a = db.get<{ exercise_id: number }>('SELECT exercise_id FROM trn_exercise_aliases WHERE alias = ? COLLATE NOCASE', [name])
  if (a && a.exercise_id !== ownId) throw new UserError(`«${name}» ya es un alias de otro ejercicio. ${what}`)
}

/**
 * Crea un ejercicio nuevo con lo mínimo (lo usa el importador para los ejercicios que no conoce).
 * La categoría queda vacía hasta que Michael la ponga; la estación HYROX se propone con el
 * diccionario (`matchHyroxStation`). Devuelve su id.
 */
export function insertExercise(db: Db, title: string, measure: MeasureType = 'WEIGHT_REPS'): number {
  const now = nowIso()
  db.run('INSERT INTO trn_exercises (title, measure, hyrox_station, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    title,
    measure,
    matchHyroxStation(title),
    now,
    now
  ])
  return lastId(db)
}

function writeMuscles(db: Db, exerciseId: number, primary: number | null, secondary: number[]): void {
  db.run('DELETE FROM trn_exercise_muscles WHERE exercise_id = ?', [exerciseId])
  const ids = [...(primary !== null ? [primary] : []), ...secondary]
  for (const g of ids) {
    if (!db.get('SELECT 1 AS x FROM trn_muscle_groups WHERE id = ?', [g])) throw new UserError('Ese grupo muscular ya no existe.')
  }
  if (primary !== null) db.run("INSERT INTO trn_exercise_muscles (exercise_id, group_id, role) VALUES (?, ?, 'primary')", [exerciseId, primary])
  for (const g of [...new Set(secondary)])
    db.run("INSERT INTO trn_exercise_muscles (exercise_id, group_id, role) VALUES (?, ?, 'secondary')", [exerciseId, g])
}

/**
 * Crea o edita un ejercicio y sus grupos musculares. Si cambia el título y alguna serie usa el
 * anterior, el anterior se guarda como alias: así la próxima importación de Hevy lo sigue
 * reconociendo.
 */
export function saveExercise(db: Db, input: ExerciseInput): Exercise {
  const d = parseInput(ExerciseSchema, input)
  return friendly(
    () =>
      db.tx(() => {
        const now = nowIso()
        let id: number
        if (d.id) {
          const before = requireExercise(db, d.id)
          checkNameFree(db, d.title, d.id, 'Si es el mismo, únelos.')
          const beforeDto = getExercise(db, d.id)
          // Estación: sin poner = la que tenga; null = ninguna.
          const station = d.hyroxStation === undefined ? before.hyrox_station : d.hyroxStation
          db.run(
            `UPDATE trn_exercises SET title = ?, category = ?, measure = ?, is_bodyweight = ?, active = ?, notes = ?, hyrox_station = ?,
               updated_at = ?
             WHERE id = ?`,
            [d.title, d.category, d.measure, d.isBodyweight ? 1 : 0, d.active ? 1 : 0, d.notes, station, now, d.id]
          )
          // Renombrar a uno de sus propios alias: el alias sobra.
          db.run('DELETE FROM trn_exercise_aliases WHERE exercise_id = ? AND alias = ? COLLATE NOCASE', [d.id, d.title])
          if (before.title.toLowerCase() !== d.title.toLowerCase()) {
            const used = db.get('SELECT 1 AS x FROM trn_sets WHERE exercise_title = ? COLLATE NOCASE LIMIT 1', [before.title])
            if (used) db.run('INSERT OR IGNORE INTO trn_exercise_aliases (alias, exercise_id) VALUES (?, ?)', [before.title, d.id])
          }
          id = d.id
          writeMuscles(db, id, d.primaryGroupId, d.secondaryGroupIds)
          audit(db, 'trn_exercises', id, 'update', d.title, beforeDto, getExercise(db, id))
        } else {
          checkNameFree(db, d.title, null, '')
          // Estación vacía al crear: se propone con el diccionario.
          const station = d.hyroxStation ?? matchHyroxStation(d.title)
          db.run(
            `INSERT INTO trn_exercises (title, category, measure, is_bodyweight, active, notes, hyrox_station, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.title, d.category, d.measure, d.isBodyweight ? 1 : 0, d.active ? 1 : 0, d.notes, station, now, now]
          )
          id = lastId(db)
          writeMuscles(db, id, d.primaryGroupId, d.secondaryGroupIds)
          audit(db, 'trn_exercises', id, 'create', d.title, null, getExercise(db, id))
        }
        return getExercise(db, id)
      }),
    'Ya hay un ejercicio con ese nombre.'
  )
}

export function addAlias(db: Db, exerciseId: number, alias: string): Exercise {
  const a = parseInput(AliasSchema, alias)
  return friendly(
    () =>
      db.tx(() => {
        const e = requireExercise(db, exerciseId)
        if (e.title.toLowerCase() === a.toLowerCase()) throw new UserError('El alias es igual que el nombre del ejercicio.')
        checkNameFree(db, a, exerciseId, '')
        db.run('INSERT INTO trn_exercise_aliases (alias, exercise_id) VALUES (?, ?)', [a, exerciseId])
        audit(db, 'trn_exercise_aliases', lastId(db), 'create', `${a} → ${e.title}`, null, { alias: a, exerciseId })
        return getExercise(db, exerciseId)
      }),
    'Ese alias ya existe.'
  )
}

export function removeAlias(db: Db, aliasId: number): Exercise {
  return db.tx(() => {
    const row = db.get<{ id: number; alias: string; exercise_id: number }>('SELECT * FROM trn_exercise_aliases WHERE id = ?', [aliasId])
    if (!row) throw new UserError('Ese alias ya no existe.')
    db.run('DELETE FROM trn_exercise_aliases WHERE id = ?', [aliasId])
    audit(db, 'trn_exercise_aliases', aliasId, 'delete', row.alias, { alias: row.alias, exerciseId: row.exercise_id }, null)
    return getExercise(db, row.exercise_id)
  })
}

/**
 * Une el ejercicio `fromId` (B) en `intoId` (A): las series, los elementos de rutina y los
 * objetivos de B pasan a A, los alias de B pasan a A, el título de B queda como alias de A y B se
 * borra. Las series conservan su `exercise_title` original (el de Hevy). Todo en una operación.
 */
export function mergeExercises(db: Db, fromId: number, intoId: number): Exercise {
  if (fromId === intoId) throw new UserError('Elige dos ejercicios distintos para unirlos.')
  return friendly(() =>
    db.tx(() => {
      const from = requireExercise(db, fromId)
      const into = requireExercise(db, intoId)
      const beforeFrom = getExercise(db, fromId)
      const moved = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM trn_sets WHERE exercise_id = ?', [fromId])!.n
      db.run('UPDATE trn_sets SET exercise_id = ? WHERE exercise_id = ?', [intoId, fromId])
      db.run('UPDATE trn_routine_items SET exercise_id = ? WHERE exercise_id = ?', [intoId, fromId])
      db.run('UPDATE trn_goals SET exercise_id = ? WHERE exercise_id = ?', [intoId, fromId])
      // Los alias de B pasan a A (salvo uno igual al título de A, que sobra).
      db.run('DELETE FROM trn_exercise_aliases WHERE exercise_id = ? AND alias = ? COLLATE NOCASE', [fromId, into.title])
      db.run('UPDATE trn_exercise_aliases SET exercise_id = ? WHERE exercise_id = ?', [intoId, fromId])
      db.run('DELETE FROM trn_exercises WHERE id = ?', [fromId])
      if (from.title.toLowerCase() !== into.title.toLowerCase())
        db.run('INSERT OR IGNORE INTO trn_exercise_aliases (alias, exercise_id) VALUES (?, ?)', [from.title, intoId])
      db.run('UPDATE trn_exercises SET updated_at = ? WHERE id = ?', [nowIso(), intoId])
      audit(db, 'trn_exercises', fromId, 'merge', `${from.title} → ${into.title} (${moved} series)`, beforeFrom, {
        mergedInto: intoId
      })
      return getExercise(db, intoId)
    })
  )
}
