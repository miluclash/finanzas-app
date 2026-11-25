// Acceso a las tablas de Entreno: filas tal como están en SQLite, conversión a DTOs y ayudantes
// comunes. Las lecturas son libres; las funciones que escriben solo se pueden llamar dentro de una
// operación de la cola (la `Db` lanza "Escritura fuera de la cola" si no).
import { deduceKind } from '@shared/modules/entreno/hevy/kind'
import { firstError } from '@shared/modules/entreno/schemas'
import type {
  ExerciseCategory,
  HyroxStation,
  KindRule,
  KindRuleField,
  LocalDateTime,
  MeasureType,
  SetType,
  WorkoutBase,
  WorkoutKind,
  WorkoutSource
} from '@shared/modules/entreno/types'
import { audit as coreAudit } from '../../core/audit'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'

// ---------- Filas ----------

export interface WorkoutRow {
  id: number
  title: string
  start_time: string
  end_time: string | null
  description: string | null
  kind: WorkoutKind
  kind_manual: number
  block_id: number | null
  routine_id: number | null
  perceived_effort: number | null
  notes: string | null
  source: WorkoutSource
  import_id: number | null
  hevy_key: string | null
  created_at: string
  updated_at: string
}

export interface SetRow {
  id: number
  workout_id: number
  exercise_title: string
  superset_id: string | null
  exercise_notes: string | null
  set_index: number
  set_type: SetType
  weight_kg: number | null
  reps: number | null
  distance_km: number | null
  duration_seconds: number | null
  rpe: number | null
  exercise_id: number
  exercise_order: number
  notes: string | null
}

export interface ExerciseRow {
  id: number
  title: string
  category: ExerciseCategory | null
  measure: MeasureType
  is_bodyweight: number
  active: number
  notes: string | null
  hyrox_station: HyroxStation | null
  created_at: string
  updated_at: string
}

export interface KindRuleRow {
  id: number
  field: KindRuleField
  contains: string
  kind: WorkoutKind
  priority: number
  active: number
}

export function toWorkout(r: WorkoutRow): WorkoutBase {
  return {
    id: r.id,
    title: r.title,
    startTime: r.start_time,
    endTime: r.end_time,
    description: r.description,
    kind: r.kind,
    kindManual: r.kind_manual === 1,
    source: r.source,
    perceivedEffort: r.perceived_effort,
    notes: r.notes,
    blockId: r.block_id,
    routineId: r.routine_id,
    importId: r.import_id,
    hevyKey: r.hevy_key,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function toKindRule(r: KindRuleRow): KindRule {
  return { id: r.id, field: r.field, contains: r.contains, kind: r.kind, priority: r.priority, active: r.active === 1 }
}

// ---------- Ayudantes ----------

export function nowIso(): string {
  return new Date().toISOString()
}

/** Valida con Zod y convierte el error en un mensaje para Michael. */
export function parseInput<T>(schema: { parse: (v: unknown) => T }, v: unknown): T {
  try {
    return schema.parse(v)
  } catch (e) {
    throw new UserError(firstError(e))
  }
}

/** Ejecuta `fn` y convierte los errores de restricciones de SQLite en mensajes comprensibles. */
export function friendly<T>(fn: () => T, unique = 'Ya existe un registro con ese nombre.'): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof UserError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE constraint failed')) throw new UserError(unique)
    if (msg.includes('FOREIGN KEY constraint failed'))
      throw new UserError('No se puede: hay otros datos que dependen de este (o el que eliges ya no existe).')
    if (msg.includes('CHECK constraint failed')) throw new UserError('Algún dato no cumple las reglas (fechas, números o tipos).')
    throw e
  }
}

/** Apunta un cambio en `audit_log` (dentro de la operación de la cola en curso). */
export function audit(
  db: Db,
  entity: string,
  entityId: number | string,
  action: string,
  summary: string | null,
  before: unknown = null,
  after: unknown = null
): void {
  coreAudit(db, entity, String(entityId), action, summary, before, after)
}

export function lastId(db: Db): number {
  return db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id
}

/** Duración en segundos entre dos ISO locales `YYYY-MM-DDTHH:mm` (null si falta el fin). */
export function durationSeconds(start: LocalDateTime, end: LocalDateTime | null): number | null {
  if (!end) return null
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16))
  return Math.round((t(end) - t(start)) / 1000)
}

export function getWorkoutRow(db: Db, id: number): WorkoutRow | undefined {
  return db.get<WorkoutRow>('SELECT * FROM trn_workouts WHERE id = ?', [id])
}

export function requireWorkout(db: Db, id: number): WorkoutRow {
  const w = getWorkoutRow(db, id)
  if (!w) throw new UserError('Esa sesión ya no existe.')
  return w
}

export function getExerciseRow(db: Db, id: number): ExerciseRow | undefined {
  return db.get<ExerciseRow>('SELECT * FROM trn_exercises WHERE id = ?', [id])
}

export function requireExercise(db: Db, id: number): ExerciseRow {
  const e = getExerciseRow(db, id)
  if (!e) throw new UserError('Ese ejercicio ya no existe.')
  return e
}

/** Ejercicio por título o por alias (sin distinguir mayúsculas). */
export function findExerciseByName(db: Db, name: string): ExerciseRow | undefined {
  return (
    db.get<ExerciseRow>('SELECT * FROM trn_exercises WHERE title = ? COLLATE NOCASE', [name]) ??
    db.get<ExerciseRow>(
      'SELECT e.* FROM trn_exercise_aliases a JOIN trn_exercises e ON e.id = a.exercise_id WHERE a.alias = ? COLLATE NOCASE',
      [name]
    )
  )
}

export function kindRules(db: Db): KindRule[] {
  return db.all<KindRuleRow>('SELECT * FROM trn_kind_rules ORDER BY priority DESC, id').map(toKindRule)
}

/** Tipo según las reglas para un título y sus ejercicios. */
export function kindFor(rules: KindRule[], title: string, exerciseTitles: string[]): WorkoutKind {
  return deduceKind({ title, sets: exerciseTitles.map((exerciseTitle) => ({ exerciseTitle })) }, rules)
}

/** Comprueba que el bloque y la rutina existen (mensaje claro antes de que salte la FOREIGN KEY). */
export function checkPlanRefs(db: Db, blockId: number | null | undefined, routineId: number | null | undefined): void {
  if (blockId != null && !db.get('SELECT 1 AS x FROM trn_blocks WHERE id = ?', [blockId]))
    throw new UserError('Ese bloque de entrenamiento no existe.')
  if (routineId != null && !db.get('SELECT 1 AS x FROM trn_routines WHERE id = ?', [routineId]))
    throw new UserError('Ese tipo de entreno no existe.')
}
