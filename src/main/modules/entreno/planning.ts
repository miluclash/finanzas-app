// Planificación de la semana: semana base (boceto, `trn_base_week`) y plan de cada semana concreta
// (`trn_week_plan_weeks` + `trn_week_plan`). Las semanas van de lunes a domingo.
//
// Guardado automático: toda semana que ya ha empezado y no tiene plan guardado se guarda copiando el
// boceto vigente (`autosaveWeeks`). Corre al arrancar la app (paso de arranque del módulo) y al leer
// por primera vez una semana empezada sin guardar (el handler lo encola antes de leer). Límite hacia
// atrás: la semana en que se guardó el boceto por primera vez (`trn_base_week_meta`); las semanas
// anteriores no tuvieron plan y no se rellenan. Así, editar el boceto después nunca cambia semanas
// ya guardadas, y antes de sustituirlo se guardan con el boceto anterior las semanas ya terminadas
// que se hubieran quedado sin guardar (app abierta de una semana a otra).
//
// Las lecturas no escriben. Las funciones que escriben se llaman dentro de una operación de la cola.
import { addDays, formatDate } from '@shared/dates'
import { mondayOf, mondaysBetween, projectBaseWeek, weekdayOf, weekEndOf } from '@shared/modules/entreno/plan'
import {
  BaseWeekSlotsSchema,
  WeekPlanMoveSchema,
  WeekPlanSlotRefSchema,
  WeekPlanSlotsSchema,
  WeekStartSchema
} from '@shared/modules/entreno/schemas'
import type {
  BaseWeek,
  BaseWeekSlotFact,
  BaseWeekSlotInput,
  ISODate,
  PlannedSlotFact,
  SavedWeekFact,
  TimeHM,
  WeekPlan,
  WeekPlanMoveInput,
  WeekPlanOrigin,
  WeekPlanSlot,
  WeekPlanSlotInput,
  WeekPlanSlotRef,
  Weekday,
  WorkoutKind
} from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { audit, friendly, nowIso, parseInput } from './repo'

// ---------- Lecturas ----------

/** Huecos del boceto, por día y orden. */
export function baseWeekSlots(db: Db): BaseWeekSlotFact[] {
  return db
    .all<{ weekday: Weekday; slot_order: number; routine_id: number; time: TimeHM | null }>(
      'SELECT weekday, slot_order, routine_id, time FROM trn_base_week ORDER BY weekday, slot_order'
    )
    .map((r) => ({ weekday: r.weekday, order: r.slot_order, routineId: r.routine_id, time: r.time }))
}

export function baseWeekMeta(db: Db): { firstSavedOn: ISODate; updatedAt: string } | null {
  const r = db.get<{ first_saved_on: string; updated_at: string }>('SELECT first_saved_on, updated_at FROM trn_base_week_meta WHERE id = 1')
  return r ? { firstSavedOn: r.first_saved_on, updatedAt: r.updated_at } : null
}

/** Semanas guardadas (con o sin huecos), por fecha. Con `from`/`to` (lunes), solo esas. */
export function savedWeeks(db: Db, from?: ISODate | null, to?: ISODate | null): SavedWeekFact[] {
  const where: string[] = []
  const params: string[] = []
  if (from) {
    where.push('week_start >= ?')
    params.push(from)
  }
  if (to) {
    where.push('week_start <= ?')
    params.push(to)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const weeks = db.all<{ week_start: string; origin: WeekPlanOrigin; saved_at: string }>(
    `SELECT week_start, origin, saved_at FROM trn_week_plan_weeks ${w} ORDER BY week_start`,
    params
  )
  const byWeek = new Map<string, SavedWeekFact>(weeks.map((x) => [x.week_start, { weekStart: x.week_start, origin: x.origin, savedAt: x.saved_at, slots: [] }]))
  for (const s of db.all<{ week_start: string; date: string; slot_order: number; routine_id: number; time: string | null; note: string | null }>(
    `SELECT week_start, date, slot_order, routine_id, time, note FROM trn_week_plan ${w} ORDER BY date, slot_order`,
    params
  ))
    byWeek.get(s.week_start)?.slots.push({ date: s.date, order: s.slot_order, routineId: s.routine_id, time: s.time, note: s.note })
  return [...byWeek.values()]
}

function routineInfo(db: Db): Map<number, { name: string; kind: WorkoutKind }> {
  return new Map(db.all<{ id: number; name: string; kind: WorkoutKind }>('SELECT id, name, kind FROM trn_routines').map((r) => [r.id, r]))
}

export function getBaseWeek(db: Db): BaseWeek {
  const info = routineInfo(db)
  const meta = baseWeekMeta(db)
  return {
    slots: baseWeekSlots(db).map((s) => ({
      ...s,
      routineName: info.get(s.routineId)?.name ?? '',
      routineKind: info.get(s.routineId)?.kind ?? 'OTHER'
    })),
    firstSavedOn: meta?.firstSavedOn ?? null,
    updatedAt: meta?.updatedAt ?? null
  }
}

function checkWeekStart(weekStart: unknown): ISODate {
  return parseInput(WeekStartSchema, weekStart)
}

/** Huecos de una semana: los guardados o, si no está guardada, el boceto proyectado. */
function weekSlots(db: Db, weekStart: ISODate): { saved: SavedWeekFact | null; slots: PlannedSlotFact[] } {
  const saved = savedWeeks(db, weekStart, weekStart)[0] ?? null
  return { saved, slots: saved ? saved.slots : projectBaseWeek(weekStart, baseWeekSlots(db)) }
}

/** La semana es anterior a la del primer boceto (o no hay boceto). */
function predatesBase(db: Db, weekStart: ISODate): boolean {
  const meta = baseWeekMeta(db)
  return !meta || weekStart < mondayOf(meta.firstSavedOn)
}

/**
 * Plan de la semana que empieza en `weekStart` (lunes): el guardado o, si no lo hay, el boceto
 * actual proyectado (`saved: false`). Solo lee.
 */
export function getWeekPlan(db: Db, weekStart: ISODate): WeekPlan {
  const ws = checkWeekStart(weekStart)
  const { saved, slots } = weekSlots(db, ws)
  const info = routineInfo(db)
  return {
    weekStart: ws,
    weekEnd: weekEndOf(ws),
    saved: !!saved,
    origin: saved?.origin ?? null,
    savedAt: saved?.savedAt ?? null,
    predatesBase: predatesBase(db, ws),
    slots: slots.map(
      (s): WeekPlanSlot => ({
        date: s.date,
        weekday: weekdayOf(s.date),
        order: s.order,
        routineId: s.routineId,
        routineName: info.get(s.routineId)?.name ?? '',
        routineKind: info.get(s.routineId)?.kind ?? 'OTHER',
        time: s.time,
        note: s.note
      })
    )
  }
}

/** Semanas que el guardado automático guardaría ahora (empezadas, sin guardar y desde el primer boceto). Solo lee. */
export function weeksPendingAutosave(db: Db, today: ISODate, upTo: ISODate = mondayOf(today)): ISODate[] {
  const meta = baseWeekMeta(db)
  if (!meta) return []
  const last = upTo < mondayOf(today) ? upTo : mondayOf(today)
  const from = mondayOf(meta.firstSavedOn)
  if (from > last) return []
  const done = new Set(savedWeeks(db, from, last).map((w) => w.weekStart))
  return mondaysBetween(from, last).filter((w) => !done.has(w))
}

// ---------- Escrituras ----------

interface SlotToWrite {
  date: ISODate
  routineId: number
  time: TimeHM | null
  note: string | null
}

function checkRoutines(db: Db, ids: number[]): void {
  const known = new Set(db.all<{ id: number }>('SELECT id FROM trn_routines').map((r) => r.id))
  if (ids.some((id) => !known.has(id))) throw new UserError('Ese tipo de entreno ya no existe.')
}

/**
 * Guarda una semana entera (sustituye sus huecos). El orden de cada día es el de `slots`.
 * Lanza si alguna fecha no es de la semana.
 */
function writeWeek(db: Db, weekStart: ISODate, slots: readonly SlotToWrite[], origin: WeekPlanOrigin): void {
  const end = weekEndOf(weekStart)
  if (slots.some((s) => s.date < weekStart || s.date > end))
    throw new UserError(`Todas las sesiones tienen que ser de la semana del ${formatDate(weekStart)}.`)
  checkRoutines(db, slots.map((s) => s.routineId))
  db.run(
    `INSERT INTO trn_week_plan_weeks (week_start, origin, saved_at) VALUES (?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET origin = excluded.origin, saved_at = excluded.saved_at`,
    [weekStart, origin, nowIso()]
  )
  db.run('DELETE FROM trn_week_plan WHERE week_start = ?', [weekStart])
  const next = new Map<string, number>()
  for (const s of [...slots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const order = next.get(s.date) ?? 0
    next.set(s.date, order + 1)
    db.run('INSERT INTO trn_week_plan (week_start, date, slot_order, routine_id, time, note) VALUES (?, ?, ?, ?, ?, ?)', [
      weekStart,
      s.date,
      order,
      s.routineId,
      s.time,
      s.note
    ])
  }
}

const fromFacts = (slots: readonly PlannedSlotFact[]): SlotToWrite[] =>
  [...slots]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))
    .map((s) => ({ date: s.date, routineId: s.routineId, time: s.time, note: s.note }))

/**
 * Guarda con el boceto vigente las semanas empezadas sin plan, desde la del primer boceto hasta la
 * actual (o hasta `upTo`, un lunes). No escribe nada si no falta ninguna. Devuelve cuántas ha guardado.
 */
export function autosaveWeeks(db: Db, today: ISODate, upTo?: ISODate): number {
  const pending = weeksPendingAutosave(db, today, upTo)
  if (pending.length === 0) return 0
  return db.tx(() => {
    const base = baseWeekSlots(db)
    for (const w of pending) writeWeek(db, w, fromFacts(projectBaseWeek(w, base)), 'BASE')
    audit(db, 'trn_week_plan', pending[0], 'autosave', `Plan guardado desde el boceto: ${pending.length} ${pending.length === 1 ? 'semana' : 'semanas'}`, null, {
      weeks: pending
    })
    return pending.length
  })
}

/**
 * Sustituye todo el boceto. Antes guarda, con el boceto anterior, las semanas ya terminadas que se
 * hubieran quedado sin guardar; la semana actual sin plan y las futuras usan el boceto nuevo. La
 * primera vez apunta la fecha (`first_saved_on`), que es el límite del guardado automático.
 */
export function saveBaseWeek(db: Db, slots: BaseWeekSlotInput[], today: ISODate): BaseWeek {
  const d = parseInput(BaseWeekSlotsSchema, slots)
  return friendly(() =>
    db.tx(() => {
      autosaveWeeks(db, today, addDays(mondayOf(today), -7))
      checkRoutines(db, d.map((s) => s.routineId))
      const before = getBaseWeek(db)
      db.run('DELETE FROM trn_base_week')
      const next = new Map<number, number>()
      for (const s of [...d].sort((a, b) => a.weekday - b.weekday)) {
        const order = next.get(s.weekday) ?? 0
        next.set(s.weekday, order + 1)
        db.run('INSERT INTO trn_base_week (weekday, slot_order, routine_id, time) VALUES (?, ?, ?, ?)', [s.weekday, order, s.routineId, s.time])
      }
      const now = nowIso()
      db.run(
        `INSERT INTO trn_base_week_meta (id, first_saved_on, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        [today, now]
      )
      const after = getBaseWeek(db)
      audit(db, 'trn_base_week', 1, 'update', 'Semana base', before.slots, after.slots)
      return after
    })
  )
}

/** Guarda el plan de una semana concreta (sustituye el que hubiera). Vale también una semana vacía (todo descanso). */
export function saveWeekPlan(db: Db, weekStart: ISODate, slots: WeekPlanSlotInput[]): WeekPlan {
  const ws = checkWeekStart(weekStart)
  const d = parseInput(WeekPlanSlotsSchema, slots)
  return friendly(() =>
    db.tx(() => {
      const before = getWeekPlan(db, ws)
      writeWeek(db, ws, d, 'EDITED')
      const after = getWeekPlan(db, ws)
      audit(db, 'trn_week_plan', ws, 'update', `Plan de la semana del ${ws}`, before, after)
      return after
    })
  )
}

/** Vuelve a poner en la semana el boceto actual (y la deja guardada). */
export function resetWeekToBase(db: Db, weekStart: ISODate): WeekPlan {
  const ws = checkWeekStart(weekStart)
  return friendly(() =>
    db.tx(() => {
      const before = getWeekPlan(db, ws)
      writeWeek(db, ws, fromFacts(projectBaseWeek(ws, baseWeekSlots(db))), 'BASE')
      const after = getWeekPlan(db, ws)
      audit(db, 'trn_week_plan', ws, 'resetToBase', `Semana del ${ws} vuelta al boceto`, before, after)
      return after
    })
  )
}

/** Huecos de la semana de `date` agrupados por fecha, en orden (guardados o del boceto). */
function dayLists(db: Db, weekStart: ISODate): Map<ISODate, SlotToWrite[]> {
  const out = new Map<ISODate, SlotToWrite[]>()
  for (const s of fromFacts(weekSlots(db, weekStart).slots)) {
    const l = out.get(s.date) ?? []
    l.push(s)
    out.set(s.date, l)
  }
  return out
}

function takeSlot(lists: Map<ISODate, SlotToWrite[]>, ref: WeekPlanSlotRef): SlotToWrite {
  const l = lists.get(ref.date) ?? []
  const s = l[ref.order]
  if (!s) throw new UserError('Esa sesión ya no está en el plan. Vuelve a cargar la semana.')
  l.splice(ref.order, 1)
  return s
}

/**
 * Mueve una sesión del plan a otro día de la misma semana o a otra posición del mismo día. Si la
 * semana no estaba guardada, se guarda partiendo del boceto.
 */
export function moveWeekSlot(db: Db, input: WeekPlanMoveInput): WeekPlan {
  const d = parseInput(WeekPlanMoveSchema, input)
  const ws = mondayOf(d.from.date)
  if (mondayOf(d.to.date) !== ws) throw new UserError('Solo se puede mover una sesión a otro día de la misma semana.')
  return friendly(() =>
    db.tx(() => {
      const before = getWeekPlan(db, ws)
      const lists = dayLists(db, ws)
      const slot = takeSlot(lists, d.from)
      const target = lists.get(d.to.date) ?? []
      const at = d.to.order === null ? target.length : Math.min(d.to.order, target.length)
      target.splice(at, 0, { ...slot, date: d.to.date })
      lists.set(d.to.date, target)
      writeWeek(db, ws, [...lists.values()].flat(), 'EDITED')
      const after = getWeekPlan(db, ws)
      audit(db, 'trn_week_plan', ws, 'move', `Sesión movida del ${d.from.date} al ${d.to.date}`, before, after)
      return after
    })
  )
}

/** Quita una sesión del plan. Si la semana no estaba guardada, se guarda partiendo del boceto. */
export function removeWeekSlot(db: Db, ref: WeekPlanSlotRef): WeekPlan {
  const d = parseInput(WeekPlanSlotRefSchema, ref)
  const ws = mondayOf(d.date)
  return friendly(() =>
    db.tx(() => {
      const before = getWeekPlan(db, ws)
      const lists = dayLists(db, ws)
      takeSlot(lists, d)
      writeWeek(db, ws, [...lists.values()].flat(), 'EDITED')
      const after = getWeekPlan(db, ws)
      audit(db, 'trn_week_plan', ws, 'remove', `Sesión quitada del ${d.date}`, before, after)
      return after
    })
  )
}
