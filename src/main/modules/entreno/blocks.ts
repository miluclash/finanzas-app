// Bloques de entrenamiento y eventos. Los bloques no se solapan, así que cada sesión cae como mucho
// en uno: `trn_workouts.block_id` sale de la fecha de la sesión y se recalcula en la misma
// operación al guardar o borrar un bloque, al importar y al guardar una sesión manual. Las
// funciones que escriben se llaman dentro de una operación de la cola.
import { formatDate } from '@shared/dates'
import { BlockSchema, TrainingEventSchema } from '@shared/modules/entreno/schemas'
import type { Block, BlockInput, TrainingEvent, TrainingEventInput } from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { audit, friendly, lastId, nowIso, parseInput } from './repo'

// ---------- block_id por fecha ----------

/** Bloque que contiene la fecha de inicio de la sesión `w` (subconsulta SQL). */
const BLOCK_FOR = (w: string) => `(SELECT b.id FROM trn_blocks b
  WHERE b.start_date <= substr(${w}.start_time, 1, 10) AND (b.end_date IS NULL OR b.end_date >= substr(${w}.start_time, 1, 10))
  ORDER BY b.start_date DESC, b.id LIMIT 1)`

/** Bloque que contiene una fecha (o null). */
export function blockForDate(db: Db, date: string): number | null {
  return (
    db.get<{ id: number }>(
      `SELECT id FROM trn_blocks WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?) ORDER BY start_date DESC, id LIMIT 1`,
      [date, date]
    )?.id ?? null
  )
}

/**
 * Pone a cada sesión el bloque que le toca por fecha (o ninguno). Con `workoutIds`, solo a esas.
 * Solo escribe las que cambian. Devuelve cuántas han cambiado.
 */
export function recalcBlockIds(db: Db, workoutIds?: readonly number[]): number {
  if (workoutIds && workoutIds.length === 0) return 0
  const only = workoutIds ? ` AND id IN (${workoutIds.map(() => '?').join(', ')})` : ''
  db.run(
    `UPDATE trn_workouts SET block_id = ${BLOCK_FOR('trn_workouts')} WHERE block_id IS NOT ${BLOCK_FOR('trn_workouts')}${only}`,
    workoutIds ? [...workoutIds] : undefined
  )
  return db.changes()
}

// ---------- Bloques ----------

interface BlockRow {
  id: number
  name: string
  start_date: string
  end_date: string | null
  main_goal: string | null
  planned_gym: number
  planned_swim: number
  planned_hyrox: number
  planned_run: number
  planned_other: number
  notes: string | null
  event_id: number | null
  is_deload: number
  created_at: string
  updated_at: string
  workout_count: number
}

function toBlock(r: BlockRow): Block {
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    mainGoal: r.main_goal,
    plannedGym: r.planned_gym,
    plannedSwim: r.planned_swim,
    plannedHyrox: r.planned_hyrox,
    plannedRun: r.planned_run,
    plannedOther: r.planned_other,
    notes: r.notes,
    eventId: r.event_id,
    isDeload: r.is_deload === 1,
    workoutCount: r.workout_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** Bloques por fecha de inicio. */
export function listBlocks(db: Db): Block[] {
  return db
    .all<BlockRow>(
      `SELECT b.*, (SELECT COUNT(*) FROM trn_workouts w WHERE w.block_id = b.id) AS workout_count
       FROM trn_blocks b ORDER BY b.start_date, b.id`
    )
    .map(toBlock)
}

function getBlock(db: Db, id: number): Block {
  const b = listBlocks(db).find((x) => x.id === id)
  if (!b) throw new UserError('Ese bloque ya no existe.')
  return b
}

const rango = (start: string, end: string | null) => (end ? `del ${formatDate(start)} al ${formatDate(end)}` : `desde el ${formatDate(start)}, sin fecha de fin`)

/** Un bloque no puede solaparse con otro (un bloque sin fecha de fin llega hasta siempre). */
function checkNoOverlap(db: Db, ownId: number | null, start: string, end: string | null): void {
  const clash = db.get<{ name: string; start_date: string; end_date: string | null }>(
    `SELECT name, start_date, end_date FROM trn_blocks
     WHERE id IS NOT ? AND start_date <= COALESCE(?, '9999-12-31') AND COALESCE(end_date, '9999-12-31') >= ?
     ORDER BY start_date LIMIT 1`,
    [ownId, end, start]
  )
  if (clash)
    throw new UserError(
      `Este bloque se solapa con «${clash.name}» (${rango(clash.start_date, clash.end_date)}). Cambia las fechas para que no coincidan.`
    )
}

/** Crea o edita un bloque y recalcula el bloque de las sesiones. */
export function saveBlock(db: Db, input: BlockInput): Block {
  const d = parseInput(BlockSchema, input)
  return friendly(() =>
    db.tx(() => {
      if (d.eventId !== null && !db.get('SELECT 1 AS x FROM trn_events WHERE id = ?', [d.eventId]))
        throw new UserError('Ese evento no existe.')
      checkNoOverlap(db, d.id, d.startDate, d.endDate)
      const now = nowIso()
      const vals = [
        d.name,
        d.startDate,
        d.endDate,
        d.mainGoal,
        d.plannedGym,
        d.plannedSwim,
        d.plannedHyrox,
        d.plannedRun,
        d.plannedOther,
        d.notes,
        d.eventId,
        d.isDeload ? 1 : 0
      ]
      let id: number
      let before: Block | null = null
      if (d.id) {
        before = getBlock(db, d.id)
        db.run(
          `UPDATE trn_blocks SET name = ?, start_date = ?, end_date = ?, main_goal = ?, planned_gym = ?, planned_swim = ?,
             planned_hyrox = ?, planned_run = ?, planned_other = ?, notes = ?, event_id = ?, is_deload = ?, updated_at = ?
           WHERE id = ?`,
          [...vals, now, d.id]
        )
        id = d.id
      } else {
        db.run(
          `INSERT INTO trn_blocks (name, start_date, end_date, main_goal, planned_gym, planned_swim, planned_hyrox, planned_run,
             planned_other, notes, event_id, is_deload, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...vals, now, now]
        )
        id = lastId(db)
      }
      recalcBlockIds(db)
      const after = getBlock(db, id)
      audit(db, 'trn_blocks', id, before ? 'update' : 'create', d.name, before, after)
      return after
    })
  )
}

/** Borra un bloque; sus sesiones se quedan sin bloque. */
export function deleteBlock(db: Db, id: number): void {
  db.tx(() => {
    const before = getBlock(db, id)
    db.run('DELETE FROM trn_blocks WHERE id = ?', [id])
    recalcBlockIds(db)
    audit(db, 'trn_blocks', id, 'delete', before.name, before, null)
  })
}

// ---------- Eventos ----------

interface EventRow {
  id: number
  name: string
  date: string
  notes: string | null
  created_at: string
  updated_at: string
}

const toEvent = (r: EventRow): TrainingEvent => ({
  id: r.id,
  name: r.name,
  date: r.date,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

/** Eventos por fecha. */
export function listEvents(db: Db): TrainingEvent[] {
  return db.all<EventRow>('SELECT * FROM trn_events ORDER BY date, id').map(toEvent)
}

function getEvent(db: Db, id: number): TrainingEvent {
  const r = db.get<EventRow>('SELECT * FROM trn_events WHERE id = ?', [id])
  if (!r) throw new UserError('Ese evento ya no existe.')
  return toEvent(r)
}

export function saveEvent(db: Db, input: TrainingEventInput): TrainingEvent {
  const d = parseInput(TrainingEventSchema, input)
  return friendly(() =>
    db.tx(() => {
      const now = nowIso()
      let id: number
      let before: TrainingEvent | null = null
      if (d.id) {
        before = getEvent(db, d.id)
        db.run('UPDATE trn_events SET name = ?, date = ?, notes = ?, updated_at = ? WHERE id = ?', [d.name, d.date, d.notes, now, d.id])
        id = d.id
      } else {
        db.run('INSERT INTO trn_events (name, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [d.name, d.date, d.notes, now, now])
        id = lastId(db)
      }
      const after = getEvent(db, id)
      audit(db, 'trn_events', id, before ? 'update' : 'create', d.name, before, after)
      return after
    })
  )
}

/**
 * Borra un evento. Los bloques que eran fases suyas se quedan sin evento. Si un objetivo de tipo
 * Evento lo usa, no se borra (el objetivo se quedaría sin sentido).
 */
export function deleteEvent(db: Db, id: number): void {
  db.tx(() => {
    const before = getEvent(db, id)
    const n = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM trn_goals WHERE event_id = ? AND type = 'EVENT'", [id])!.n
    if (n > 0)
      throw new UserError(
        `No se puede borrar «${before.name}»: lo usa${n === 1 ? ' un objetivo' : `n ${n} objetivos`}. Borra o cambia ${n === 1 ? 'ese objetivo' : 'esos objetivos'} antes.`
      )
    db.run('DELETE FROM trn_events WHERE id = ?', [id])
    audit(db, 'trn_events', id, 'delete', before.name, before, null)
  })
}
