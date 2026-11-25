// Tipos de entreno ("Fuerza A", "Natación"…): `trn_routines`, sus ejercicios previstos opcionales
// (`trn_routine_items`) y sus alias (`trn_routine_aliases`, otros títulos de Hevy que cuentan como
// ese tipo al importar). Las funciones que escriben se llaman dentro de una operación de la cola.
import { normalizeKey } from '@shared/modules/entreno/normalize'
import { RoutineSchema } from '@shared/modules/entreno/schemas'
import type { ReapplyResult, Routine, RoutineInput, WorkoutKind } from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { audit, friendly, lastId, nowIso, parseInput } from './repo'

interface RoutineRow {
  id: number
  name: string
  kind: WorkoutKind
  description: string | null
  sort_order: number
  active: number
  workout_count: number
}

interface ItemRow {
  id: number
  routine_id: number
  exercise_id: number
  item_order: number
  target_sets: number | null
  reps_min: number | null
  reps_max: number | null
  target_rpe: number | null
  notes: string | null
}

export function listRoutines(db: Db): Routine[] {
  const rows = db.all<RoutineRow>(
    `SELECT r.*, (SELECT COUNT(*) FROM trn_workouts w WHERE w.routine_id = r.id) AS workout_count
     FROM trn_routines r ORDER BY r.sort_order, r.name COLLATE NOCASE, r.id`
  )
  const aliases = db.all<{ id: number; alias: string; routine_id: number }>(
    'SELECT id, alias, routine_id FROM trn_routine_aliases ORDER BY alias COLLATE NOCASE'
  )
  const items = db.all<ItemRow>('SELECT * FROM trn_routine_items ORDER BY routine_id, item_order')
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    description: r.description,
    sortOrder: r.sort_order,
    active: r.active === 1,
    aliases: aliases.filter((a) => a.routine_id === r.id).map((a) => ({ id: a.id, alias: a.alias })),
    items: items
      .filter((i) => i.routine_id === r.id)
      .map((i) => ({
        id: i.id,
        exerciseId: i.exercise_id,
        order: i.item_order,
        targetSets: i.target_sets,
        repsMin: i.reps_min,
        repsMax: i.reps_max,
        targetRpe: i.target_rpe,
        notes: i.notes
      })),
    workoutCount: r.workout_count
  }))
}

export function getRoutine(db: Db, id: number): Routine {
  const r = listRoutines(db).find((x) => x.id === id)
  if (!r) throw new UserError('Ese tipo de entreno ya no existe.')
  return r
}

/**
 * Nombre normalizado → id del tipo de entreno, con nombres y alias. Lo usa la importación para
 * asignar `routine_id` a las sesiones cuyo título coincide (igual tras normalizar).
 */
export function routineMatcher(db: Db, opts: { activeOnly?: boolean } = {}): (title: string) => number | null {
  const map = new Map<string, number>()
  const only = opts.activeOnly ? 'WHERE r.active = 1' : ''
  for (const r of db.all<{ id: number; name: string }>(`SELECT r.id, r.name FROM trn_routines r ${only} ORDER BY r.id`))
    map.set(normalizeKey(r.name), r.id)
  for (const a of db.all<{ routine_id: number; alias: string }>(
    `SELECT a.routine_id, a.alias FROM trn_routine_aliases a JOIN trn_routines r ON r.id = a.routine_id ${only} ORDER BY a.id`
  )) {
    const k = normalizeKey(a.alias)
    if (!map.has(k)) map.set(k, a.routine_id)
  }
  return (title) => map.get(normalizeKey(title)) ?? null
}

/**
 * Comprueba que ningún nombre o alias del tipo de entreno `ownId` choca (tras normalizar) con el
 * nombre o un alias de otro: si chocaran, un título de Hevy no sabría a cuál asignarse.
 */
function checkNamesFree(db: Db, ownId: number | null, names: string[]): void {
  const own = new Map<string, string>()
  for (const n of names) {
    const k = normalizeKey(n)
    if (!k) throw new UserError(`«${n}» no sirve como nombre: tiene que llevar alguna letra o número.`)
    if (!own.has(k)) own.set(k, n)
  }
  const others = [
    ...db.all<{ id: number; label: string; owner: string }>('SELECT id, name AS label, name AS owner FROM trn_routines'),
    ...db.all<{ id: number; label: string; owner: string }>(
      'SELECT r.id, a.alias AS label, r.name AS owner FROM trn_routine_aliases a JOIN trn_routines r ON r.id = a.routine_id'
    )
  ]
  for (const o of others) {
    if (o.id === ownId) continue
    const mine = own.get(normalizeKey(o.label))
    if (mine !== undefined)
      throw new UserError(
        o.label === o.owner
          ? `Ya hay un tipo de entreno que se llama «${o.owner}».`
          : `«${mine}» ya es un alias de «${o.owner}».`
      )
  }
}

function writeItems(db: Db, routineId: number, items: NonNullable<ReturnType<typeof RoutineSchema.parse>['items']>): void {
  db.run('DELETE FROM trn_routine_items WHERE routine_id = ?', [routineId])
  items.forEach((it, order) => {
    if (!db.get('SELECT 1 AS x FROM trn_exercises WHERE id = ?', [it.exerciseId])) throw new UserError('Ese ejercicio ya no existe.')
    db.run(
      `INSERT INTO trn_routine_items (routine_id, exercise_id, item_order, target_sets, reps_min, reps_max, target_rpe, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [routineId, it.exerciseId, order, it.targetSets, it.repsMin, it.repsMax, it.targetRpe, it.notes]
    )
  })
}

/** Alias sin repetidos y sin el propio nombre (comparando tras normalizar). */
function cleanAliases(name: string, aliases: string[]): string[] {
  const seen = new Set<string>([normalizeKey(name)])
  return aliases.filter((a) => {
    const k = normalizeKey(a)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function writeAliases(db: Db, routineId: number, aliases: string[]): void {
  db.run('DELETE FROM trn_routine_aliases WHERE routine_id = ?', [routineId])
  for (const a of aliases) db.run('INSERT INTO trn_routine_aliases (alias, routine_id) VALUES (?, ?)', [a, routineId])
}

/** Crea o edita un tipo de entreno. El nombre es único (sin distinguir mayúsculas, tildes ni espacios). */
export function saveRoutine(db: Db, input: RoutineInput): Routine {
  const d = parseInput(RoutineSchema, input)
  return friendly(
    () =>
      db.tx(() => {
        const now = nowIso()
        let id: number
        let before: Routine | null = null
        if (d.id) {
          before = getRoutine(db, d.id)
          // Si cambia el nombre, el alias igual al nombre nuevo sobra.
          const aliases = cleanAliases(d.name, d.aliases ?? before.aliases.map((a) => a.alias))
          checkNamesFree(db, d.id, [d.name, ...aliases])
          db.run('UPDATE trn_routines SET name = ?, kind = ?, description = ?, active = ?, updated_at = ? WHERE id = ?', [
            d.name,
            d.kind,
            d.description,
            d.active ? 1 : 0,
            now,
            d.id
          ])
          id = d.id
          writeAliases(db, id, aliases)
        } else {
          const aliases = cleanAliases(d.name, d.aliases ?? [])
          checkNamesFree(db, null, [d.name, ...aliases])
          const next = db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM trn_routines')!.n
          db.run(
            'INSERT INTO trn_routines (name, kind, description, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [d.name, d.kind, d.description, next, d.active ? 1 : 0, now, now]
          )
          id = lastId(db)
          writeAliases(db, id, aliases)
        }
        if (d.items) writeItems(db, id, d.items)
        const after = getRoutine(db, id)
        audit(db, 'trn_routines', id, before ? 'update' : 'create', d.name, before, after)
        return after
      }),
    'Ya hay un tipo de entreno con ese nombre o alias.'
  )
}

/**
 * Borra un tipo de entreno que no se use en ninguna semana guardada ni sesión (si se usa, hay que
 * desactivarlo: borrar no puede cambiar semanas pasadas). Sus ejercicios previstos, alias y huecos
 * del boceto se van con él (ON DELETE CASCADE).
 */
export function deleteRoutine(db: Db, id: number): void {
  db.tx(() => {
    const before = getRoutine(db, id)
    // Borrarlo cambiaría semanas guardadas o sesiones (la FK CASCADE se llevaría sus huecos).
    if (
      db.get('SELECT 1 AS x FROM trn_week_plan WHERE routine_id = ? LIMIT 1', [id]) ||
      db.get('SELECT 1 AS x FROM trn_workouts WHERE routine_id = ? LIMIT 1', [id])
    )
      throw new UserError('Este tipo de entreno se usa en semanas guardadas o sesiones. Desactívalo en vez de borrarlo.')
    db.run('DELETE FROM trn_routines WHERE id = ?', [id])
    audit(db, 'trn_routines', id, 'delete', before.name, before, null)
  })
}

/**
 * Asigna tipo de entreno a las sesiones que no tienen ninguno y cuyo título coincide (igual tras
 * normalizar) con el nombre o un alias de un tipo de entreno activo. Nunca cambia una sesión que ya
 * tenga tipo de entreno. Devuelve cuántas ha revisado y cuántas ha cambiado.
 */
export function reapplyRoutines(db: Db): ReapplyResult {
  return db.tx(() => {
    const match = routineMatcher(db, { activeOnly: true })
    const sinTipo = db.all<{ id: number; title: string }>('SELECT id, title FROM trn_workouts WHERE routine_id IS NULL ORDER BY id')
    let changed = 0
    for (const w of sinTipo) {
      const rid = match(w.title)
      if (rid === null) continue
      db.run('UPDATE trn_workouts SET routine_id = ?, updated_at = ? WHERE id = ? AND routine_id IS NULL', [rid, nowIso(), w.id])
      changed++
    }
    if (changed > 0)
      audit(db, 'trn_workouts', '*', 'reapplyRoutine', `Tipo de entreno asignado a ${changed} ${changed === 1 ? 'sesión' : 'sesiones'}`, null, {
        checked: sinTipo.length,
        changed
      })
    return { checked: sinTipo.length, changed }
  })
}

/** Reordena los tipos de entreno: tienen que venir todos, cada uno una vez. */
export function reorderRoutines(db: Db, ids: number[]): Routine[] {
  return db.tx(() => {
    const current = db.all<{ id: number }>('SELECT id FROM trn_routines ORDER BY sort_order, id').map((r) => r.id)
    const all = new Set(current)
    if (ids.length !== all.size || new Set(ids).size !== ids.length || !ids.every((x) => all.has(x)))
      throw new UserError('La lista de tipos de entreno ha cambiado mientras la ordenabas. Vuelve a cargarla e inténtalo de nuevo.')
    ids.forEach((rid, i) => db.run('UPDATE trn_routines SET sort_order = ? WHERE id = ?', [i, rid]))
    audit(db, 'trn_routines', '*', 'reorder', 'Orden de los tipos de entreno', current, ids)
    return listRoutines(db)
  })
}
