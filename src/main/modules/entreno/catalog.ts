// Catálogos y ajustes de Entreno: grupos musculares, reglas de tipo de sesión, parámetros de
// métricas e historial de importaciones. Las funciones que escriben se llaman dentro de una
// operación de la cola.
import { KindRuleSchema, MuscleGroupSchema, SettingsPatchSchema, SettingsSchema } from '@shared/modules/entreno/schemas'
import type {
  EntrenoSettings,
  ImportRecord,
  KindRule,
  KindRuleInput,
  MuscleGroup,
  MuscleGroupInput,
  ReapplyResult
} from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { audit, friendly, kindFor, kindRules, lastId, parseInput, toKindRule, type KindRuleRow } from './repo'
import { DEFAULT_SETTINGS } from './seed'

// ---------- Grupos musculares ----------

export function listMuscleGroups(db: Db): MuscleGroup[] {
  return db
    .all<{
      id: number
      name: string
      sort_order: number
      active: number
      weekly_sets_min: number
      weekly_sets_max: number
      exercise_count: number
    }>(
      `SELECT g.*, (SELECT COUNT(DISTINCT m.exercise_id) FROM trn_exercise_muscles m WHERE m.group_id = g.id) AS exercise_count
       FROM trn_muscle_groups g ORDER BY g.sort_order, g.id`
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
      active: r.active === 1,
      weeklySetsMin: r.weekly_sets_min,
      weeklySetsMax: r.weekly_sets_max,
      exerciseCount: r.exercise_count
    }))
}

/** Valores por defecto del rango semanal de series de un grupo muscular nuevo. */
export const DEFAULT_WEEKLY_SETS = { min: 10, max: 20 } as const

export function saveMuscleGroup(db: Db, input: MuscleGroupInput): MuscleGroup {
  const d = parseInput(MuscleGroupSchema, input)
  return friendly(
    () =>
      db.tx(() => {
        let id: number
        const checkRange = (min: number, max: number) => {
          if (min > max) throw new UserError('El mínimo de series semanales no puede ser mayor que el máximo.')
        }
        if (d.id) {
          const before = listMuscleGroups(db).find((g) => g.id === d.id)
          if (!before) throw new UserError('Ese grupo muscular ya no existe.')
          const min = d.weeklySetsMin ?? before.weeklySetsMin
          const max = d.weeklySetsMax ?? before.weeklySetsMax
          checkRange(min, max)
          db.run('UPDATE trn_muscle_groups SET name = ?, sort_order = ?, active = ?, weekly_sets_min = ?, weekly_sets_max = ? WHERE id = ?', [
            d.name,
            d.sortOrder ?? before.sortOrder,
            d.active ? 1 : 0,
            min,
            max,
            d.id
          ])
          id = d.id
          audit(db, 'trn_muscle_groups', id, 'update', d.name, before, listMuscleGroups(db).find((g) => g.id === id))
        } else {
          const min = d.weeklySetsMin ?? DEFAULT_WEEKLY_SETS.min
          const max = d.weeklySetsMax ?? Math.max(DEFAULT_WEEKLY_SETS.max, min)
          checkRange(min, max)
          const next = db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM trn_muscle_groups')!.n
          db.run('INSERT INTO trn_muscle_groups (name, sort_order, active, weekly_sets_min, weekly_sets_max) VALUES (?, ?, ?, ?, ?)', [
            d.name,
            d.sortOrder ?? next,
            d.active ? 1 : 0,
            min,
            max
          ])
          id = lastId(db)
          audit(db, 'trn_muscle_groups', id, 'create', d.name, null, { name: d.name, weeklySetsMin: min, weeklySetsMax: max })
        }
        return listMuscleGroups(db).find((g) => g.id === id)!
      }),
    'Ya hay un grupo muscular con ese nombre.'
  )
}

/** Borra un grupo muscular que no use ningún ejercicio ni objetivo. */
export function deleteMuscleGroup(db: Db, id: number): void {
  db.tx(() => {
    const g = listMuscleGroups(db).find((x) => x.id === id)
    if (!g) throw new UserError('Ese grupo muscular ya no existe.')
    if (g.exerciseCount > 0)
      throw new UserError(
        `No se puede borrar «${g.name}»: lo usan ${g.exerciseCount} ${g.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}. Quítaselo antes o desactívalo.`
      )
    if (db.get('SELECT 1 AS x FROM trn_goals WHERE group_id = ?', [id]))
      throw new UserError(`No se puede borrar «${g.name}»: hay objetivos que lo usan. Desactívalo en su lugar.`)
    db.run('DELETE FROM trn_muscle_groups WHERE id = ?', [id])
    audit(db, 'trn_muscle_groups', id, 'delete', g.name, g, null)
  })
}

// ---------- Reglas de tipo de sesión ----------

export function listKindRules(db: Db): KindRule[] {
  return kindRules(db)
}

function getKindRule(db: Db, id: number): KindRule | undefined {
  const r = db.get<KindRuleRow>('SELECT * FROM trn_kind_rules WHERE id = ?', [id])
  return r ? toKindRule(r) : undefined
}

export function saveKindRule(db: Db, input: KindRuleInput): KindRule {
  const d = parseInput(KindRuleSchema, input)
  return friendly(
    () =>
      db.tx(() => {
        let id: number
        if (d.id) {
          const before = getKindRule(db, d.id)
          if (!before) throw new UserError('Esa regla ya no existe.')
          db.run('UPDATE trn_kind_rules SET field = ?, contains = ?, kind = ?, priority = ?, active = ? WHERE id = ?', [
            d.field,
            d.contains,
            d.kind,
            d.priority ?? before.priority,
            d.active ? 1 : 0,
            d.id
          ])
          id = d.id
          audit(db, 'trn_kind_rules', id, 'update', d.contains, before, getKindRule(db, id))
        } else {
          db.run('INSERT INTO trn_kind_rules (field, contains, kind, priority, active) VALUES (?, ?, ?, ?, ?)', [
            d.field,
            d.contains,
            d.kind,
            d.priority ?? 0,
            d.active ? 1 : 0
          ])
          id = lastId(db)
          audit(db, 'trn_kind_rules', id, 'create', d.contains, null, getKindRule(db, id))
        }
        return getKindRule(db, id)!
      }),
    'Ya hay una regla con ese texto para ese campo.'
  )
}

export function deleteKindRule(db: Db, id: number): void {
  db.tx(() => {
    const before = getKindRule(db, id)
    if (!before) throw new UserError('Esa regla ya no existe.')
    db.run('DELETE FROM trn_kind_rules WHERE id = ?', [id])
    audit(db, 'trn_kind_rules', id, 'delete', before.contains, before, null)
  })
}

/**
 * Reordena las reglas: la primera de `ids` queda con la prioridad más alta. Tienen que venir
 * todas las reglas, cada una una vez.
 */
export function reorderKindRules(db: Db, ids: number[]): KindRule[] {
  return db.tx(() => {
    const current = kindRules(db)
    const all = new Set(current.map((r) => r.id))
    if (ids.length !== all.size || new Set(ids).size !== ids.length || !ids.every((id) => all.has(id)))
      throw new UserError('La lista de reglas ha cambiado mientras la ordenabas. Vuelve a cargarla e inténtalo de nuevo.')
    ids.forEach((id, i) => db.run('UPDATE trn_kind_rules SET priority = ? WHERE id = ?', [(ids.length - i) * 10, id]))
    audit(db, 'trn_kind_rules', '*', 'reorder', 'Orden de las reglas de tipo', current.map((r) => r.id), ids)
    return kindRules(db)
  })
}

/** Recalcula el tipo de las sesiones con tipo automático (`kind_manual = 0`). */
export function reapplyKindRules(db: Db): ReapplyResult {
  return db.tx(() => {
    const rules = kindRules(db)
    const workouts = db.all<{ id: number; title: string; kind: string }>('SELECT id, title, kind FROM trn_workouts WHERE kind_manual = 0')
    const titles = new Map<number, string[]>()
    for (const r of db.all<{ workout_id: number; t: string }>(
      'SELECT DISTINCT s.workout_id, s.exercise_title AS t FROM trn_sets s JOIN trn_workouts w ON w.id = s.workout_id WHERE w.kind_manual = 0'
    )) {
      const l = titles.get(r.workout_id) ?? []
      l.push(r.t)
      titles.set(r.workout_id, l)
    }
    let changed = 0
    for (const w of workouts) {
      const k = kindFor(rules, w.title, titles.get(w.id) ?? [])
      if (k !== w.kind) {
        db.run('UPDATE trn_workouts SET kind = ? WHERE id = ?', [k, w.id])
        changed++
      }
    }
    if (changed > 0) audit(db, 'trn_workouts', '*', 'reapplyKind', `Tipo recalculado en ${changed} sesiones`, null, { changed })
    return { checked: workouts.length, changed }
  })
}

// ---------- Ajustes ----------

/** Ajustes guardados, con los valores por defecto para lo que falte o no sea válido. */
export function getSettings(db: Db): EntrenoSettings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of db.all<{ key: string; value: string }>('SELECT key, value FROM trn_settings')) {
    if (!(r.key in DEFAULT_SETTINGS)) continue
    const one = SettingsPatchSchema.safeParse({ [r.key]: JSON.parse(r.value) })
    if (one.success) out[r.key] = (one.data as Record<string, unknown>)[r.key]
  }
  return out as unknown as EntrenoSettings
}

export function saveSettings(db: Db, patch: Partial<EntrenoSettings>): EntrenoSettings {
  const p = parseInput(SettingsPatchSchema, patch)
  return db.tx(() => {
    const before = getSettings(db)
    const merged = parseInput(SettingsSchema, { ...before, ...p })
    if (merged.e1rmMinReps > merged.e1rmMaxReps)
      throw new UserError('El mínimo de repeticiones para el e1RM no puede ser mayor que el máximo.')
    for (const [key, value] of Object.entries(p)) {
      if (value === undefined) continue
      db.run('INSERT INTO trn_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
        key,
        JSON.stringify(value)
      ])
    }
    const after = getSettings(db)
    audit(db, 'trn_settings', '*', 'update', 'Ajustes de entreno', before, after)
    return after
  })
}

// ---------- Importaciones ----------

export function listImports(db: Db): ImportRecord[] {
  return db
    .all<{
      id: number
      file_name: string
      file_hash: string
      imported_at: string
      format: ImportRecord['format']
      rows_total: number
      workouts_new: number
      workouts_duplicate: number
      workouts_changed: number
      rows_error: number
      exercises_new: number
    }>('SELECT * FROM trn_imports ORDER BY imported_at DESC, id DESC')
    .map((r) => ({
      id: r.id,
      fileName: r.file_name,
      fileHash: r.file_hash,
      importedAt: r.imported_at,
      format: r.format,
      rowsTotal: r.rows_total,
      workoutsNew: r.workouts_new,
      workoutsDuplicate: r.workouts_duplicate,
      workoutsChanged: r.workouts_changed,
      rowsError: r.rows_error,
      exercisesNew: r.exercises_new
    }))
}
