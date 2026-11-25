// Plan de la semana, adherencia, constancia y semana resuelta (estado de cada día y próxima sesión).
//
// - Plan de una semana: el guardado (`savedWeeks`, aunque esté vacío) si lo hay; si no, el boceto
//   (`baseWeek`) puesto en las fechas de esa semana, salvo semanas anteriores al primer boceto.
// - Hecha ↔ planificada: una sesión con tipo de entreno (`routineId`) cumple un hueco de ese tipo de
//   entreno en la semana (primero el del mismo día; si no, el primero libre). Una sesión sin tipo de
//   entreno cumple un hueco del mismo día cuyo tipo de entreno es del mismo tipo de sesión. Cada
//   sesión cumple un hueco como mucho y cada hueco se cumple con una sesión como mucho. La sesión
//   aparece siempre en el día en que se hizo.
// - Adherencia: sale del MISMO emparejamiento (`weekResolution`, uno por semana) que la semana
//   resuelta, la próxima sesión, el Inicio y el Resumen: hechas = huecos cumplidos, previstas =
//   huecos del plan, por tipo de sesión del hueco y en total. Las sesiones que no cumplen ningún
//   hueco van a `extra` (no suman ni restan). Cada semana va aparte, nunca pasa del 100 % y lo que
//   sobra no compensa a otra semana. Solo si la semana no tiene plan (ni guardado ni boceto) se usan
//   las sesiones previstas por tipo del bloque, contando `min(hechas del tipo, previstas)`.
import type { WorkoutKind } from '../types'
import { type MetricsContext, blockAt } from './context'
import type { ISODate, TimeOfDay, WorkoutFact } from './types'
import { addDays, dateOf, isoWeekday, weekEndOf, weekStartOf } from './weeks'

export interface PlanSlot {
  date: ISODate
  order: number
  routineId: number
  /** Nombre del tipo de entreno (vacío si la rutina ya no existe). */
  routineName: string
  /** Tipo de sesión del tipo de entreno (null si la rutina ya no existe). */
  kind: WorkoutKind | null
  time: TimeOfDay | null
}

export type PlanSource = 'semana' | 'boceto' | 'ninguno'

export interface WeekPlan {
  weekStart: ISODate
  source: PlanSource
  /** Huecos en orden de fecha, orden y hora. */
  slots: PlanSlot[]
}

function slotOf(ctx: MetricsContext, date: ISODate, order: number, routineId: number, time: TimeOfDay | null): PlanSlot {
  const r = ctx.routineById.get(routineId)
  return { date, order, routineId, routineName: r?.name ?? '', kind: r?.kind ?? null, time }
}

function sortSlots(slots: PlanSlot[]): PlanSlot[] {
  return slots.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.order - b.order || (a.time ?? '').localeCompare(b.time ?? '') || a.routineId - b.routineId
  )
}

/** Plan de la semana que contiene `date`: guardado, o el boceto si no está guardada. */
export function planForWeek(ctx: MetricsContext, date: ISODate): WeekPlan {
  const weekStart = weekStartOf(date, ctx.settings.weekStartsOn)
  const weekEnd = weekEndOf(weekStart)
  // Semanas guardadas que tocan esta (con inicio de semana en lunes, solo la misma).
  const savedWeeks = ctx.facts.savedWeeks.filter((w) => w.weekStart <= weekEnd && addDays(w.weekStart, 6) >= weekStart)
  if (savedWeeks.length) {
    const saved = savedWeeks.flatMap((w) => w.slots).filter((p) => p.date >= weekStart && p.date <= weekEnd)
    return { weekStart, source: 'semana', slots: sortSlots(saved.map((p) => slotOf(ctx, p.date, p.order, p.routineId, p.time))) }
  }
  const base = ctx.facts.baseWeek
  const first = ctx.facts.baseFirstSavedOn
  // Una semana anterior a la del primer boceto no tuvo plan.
  if (!base.length || (first && weekEnd < weekStartOf(first, ctx.settings.weekStartsOn))) return { weekStart, source: 'ninguno', slots: [] }
  const slots = base.map((b) => {
    // Fecha del día `weekday` (1–7, lunes–domingo) dentro de esta semana.
    const offset = (b.weekday - isoWeekday(weekStart) + 7) % 7
    return slotOf(ctx, addDays(weekStart, offset), b.order, b.routineId, b.time)
  })
  return { weekStart, source: 'boceto', slots: sortSlots(slots) }
}

function workoutsInWeek(ctx: MetricsContext, weekStart: ISODate): WorkoutFact[] {
  const end = weekEndOf(weekStart)
  return ctx.workouts.filter((w) => {
    const d = dateOf(w.startTime)
    return d >= weekStart && d <= end
  })
}

/** Empareja sesiones hechas con huecos del plan. Devuelve, por índice de hueco, la sesión que lo cumple. */
export function matchSlots(slots: PlanSlot[], workouts: WorkoutFact[]): (WorkoutFact | null)[] {
  const match: (WorkoutFact | null)[] = slots.map(() => null)
  const take = (pred: (s: PlanSlot) => boolean): number => slots.findIndex((s, i) => match[i] === null && pred(s))
  // Primero las sesiones con tipo de entreno (es el emparejamiento más fiable), luego las demás.
  for (const w of workouts.filter((x) => x.routineId != null)) {
    const day = dateOf(w.startTime)
    let i = take((s) => s.routineId === w.routineId && s.date === day)
    if (i < 0) i = take((s) => s.routineId === w.routineId)
    if (i >= 0) match[i] = w
  }
  for (const w of workouts.filter((x) => x.routineId == null)) {
    const day = dateOf(w.startTime)
    const i = take((s) => s.date === day && s.kind === w.kind)
    if (i >= 0) match[i] = w
  }
  return match
}

export interface ResolvedSlot extends PlanSlot {
  /** Sesión que cumple el hueco (puede ser de otro día de la semana). */
  doneWorkoutId: number | null
  doneDate: ISODate | null
}

/** Emparejamiento de una semana: el plan, sus huecos con la sesión que los cumple y lo que sobra. */
export interface WeekResolution {
  plan: WeekPlan
  slots: ResolvedSlot[]
  /** Sesiones de la semana, en orden. */
  workouts: WorkoutFact[]
  /** Sesiones de la semana que no cumplen ningún hueco. */
  unmatched: WorkoutFact[]
}

const resolutions = new WeakMap<MetricsContext, Map<ISODate, WeekResolution>>()

/** Plan y emparejamiento de la semana que contiene `date` (se calcula una vez por contexto y semana). */
export function weekResolution(ctx: MetricsContext, date: ISODate): WeekResolution {
  const ws = weekStartOf(date, ctx.settings.weekStartsOn)
  let byWeek = resolutions.get(ctx)
  if (!byWeek) resolutions.set(ctx, (byWeek = new Map()))
  const hit = byWeek.get(ws)
  if (hit) return hit
  const plan = planForWeek(ctx, ws)
  const workouts = workoutsInWeek(ctx, ws)
  const match = matchSlots(plan.slots, workouts)
  const used = new Set(match.filter((w): w is WorkoutFact => w != null).map((w) => w.id))
  const r: WeekResolution = {
    plan,
    slots: plan.slots.map((sl, i) => ({ ...sl, doneWorkoutId: match[i]?.id ?? null, doneDate: match[i] ? dateOf(match[i]!.startTime) : null })),
    workouts,
    unmatched: workouts.filter((w) => !used.has(w.id))
  }
  byWeek.set(ws, r)
  return r
}

// ---------- Adherencia ----------

export type PlannedSource = 'semana' | 'boceto' | 'bloque' | 'ninguno'

/**
 * Sesiones previstas por tipo en una semana: las del plan de la semana (guardado o boceto) y, si no
 * hay ninguno, las `plannedByKind` del bloque que contiene el primer día de la semana (o, si no, el
 * primer bloque que toca la semana).
 */
export function plannedForWeek(ctx: MetricsContext, weekStart: ISODate): { source: PlannedSource; byKind: Partial<Record<WorkoutKind, number>> } {
  const plan = planForWeek(ctx, weekStart)
  if (plan.source !== 'ninguno') {
    const byKind: Partial<Record<WorkoutKind, number>> = {}
    for (const s of plan.slots) if (s.kind) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1
    return { source: plan.source, byKind }
  }
  const end = weekEndOf(weekStart)
  const block =
    blockAt(ctx.facts.blocks, weekStart) ??
    [...ctx.facts.blocks].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).find((b) => b.startDate <= end && (b.endDate == null || b.endDate >= weekStart))
  if (block && Object.values(block.plannedByKind).some((n) => (n ?? 0) > 0)) {
    const byKind: Partial<Record<WorkoutKind, number>> = {}
    for (const [k, n] of Object.entries(block.plannedByKind)) if ((n ?? 0) > 0) byKind[k as WorkoutKind] = n!
    return { source: 'bloque', byKind }
  }
  return { source: 'ninguno', byKind: {} }
}

export interface KindAdherence {
  kind: WorkoutKind
  planned: number
  /** Huecos de ese tipo cumplidos (con bloque: min(sesiones del tipo, previstas)). Nunca pasa de `planned`. */
  done: number
  /** done / planned, entre 0 y 1. */
  pct: number
}

export interface WeekAdherence {
  weekStart: ISODate
  source: PlannedSource
  byKind: KindAdherence[]
  planned: number
  /** Previstas cumplidas (Σ de `byKind.done`). */
  done: number
  /** done / planned, entre 0 y 1; null si no había nada previsto. */
  pct: number | null
  /** Sesiones que no cumplen ningún hueco (o, con bloque, que pasan de lo previsto o no estaban previstas). */
  extra: number
}

export function weekAdherence(ctx: MetricsContext, weekStart: ISODate): WeekAdherence {
  const r = weekResolution(ctx, weekStart)
  const ws = r.plan.weekStart
  const make = (source: PlannedSource, rows: { kind: WorkoutKind; planned: number; done: number }[], extra: number): WeekAdherence => {
    const byKind = rows.filter((k) => k.planned > 0).map((k) => ({ ...k, pct: k.done / k.planned }))
    const planned = byKind.reduce((a, k) => a + k.planned, 0)
    const done = byKind.reduce((a, k) => a + k.done, 0)
    return { weekStart: ws, source, byKind, planned, done, pct: planned > 0 ? done / planned : null, extra }
  }
  if (r.plan.source !== 'ninguno') {
    // Huecos por tipo de sesión, en orden de aparición. Un hueco de una rutina borrada no tiene tipo: no cuenta.
    const rows = new Map<WorkoutKind, { kind: WorkoutKind; planned: number; done: number }>()
    for (const sl of r.slots) {
      if (!sl.kind) continue
      const row = rows.get(sl.kind) ?? { kind: sl.kind, planned: 0, done: 0 }
      row.planned++
      if (sl.doneWorkoutId != null) row.done++
      rows.set(sl.kind, row)
    }
    return make(r.plan.source, [...rows.values()], r.unmatched.length)
  }
  // Sin plan de días: lo previsto del bloque, por tipo de sesión.
  const { source, byKind: planned } = plannedForWeek(ctx, ws)
  const doneBy = new Map<WorkoutKind, number>()
  for (const w of r.workouts) doneBy.set(w.kind, (doneBy.get(w.kind) ?? 0) + 1)
  const rows = (Object.entries(planned) as [WorkoutKind, number][]).map(([kind, n]) => ({ kind, planned: n, done: Math.min(doneBy.get(kind) ?? 0, n) }))
  const extra = r.workouts.length - rows.reduce((a, k) => a + k.done, 0)
  return make(source, rows, extra)
}

export function adherenceWeekly(ctx: MetricsContext, weekStarts: ISODate[]): WeekAdherence[] {
  return weekStarts.map((w) => weekAdherence(ctx, w))
}

// ---------- Constancia (mapa de calor) ----------

export interface ConsistencyMap {
  /** Primer día del mapa (inicio de semana). */
  start: ISODate
  weeks: number
  /**
   * Un valor por día, semana a semana: 0 = sin entreno, 1–3 = carga baja, media o alta; null =
   * día futuro. La carga es el número de series que cuentan del día, en tercios del día más cargado
   * del mapa (relativa, para no fijar umbrales en el código). Un día con sesión pero sin series que
   * cuenten vale 1.
   */
  days: (0 | 1 | 2 | 3 | null)[]
}

export function consistencyMap(ctx: MetricsContext, today: ISODate, weeks = 12): ConsistencyMap {
  const start = addDays(weekStartOf(today, ctx.settings.weekStartsOn), -7 * (weeks - 1))
  const end = addDays(start, 7 * weeks - 1)
  const setsBy = new Map<ISODate, number>()
  for (const s of ctx.counted) if (s.date >= start && s.date <= end) setsBy.set(s.date, (setsBy.get(s.date) ?? 0) + 1)
  const sessionDays = new Set(ctx.workouts.map((w) => dateOf(w.startTime)))
  const max = Math.max(0, ...setsBy.values())
  const days: ConsistencyMap['days'] = []
  for (let i = 0; i < 7 * weeks; i++) {
    const d = addDays(start, i)
    if (d > today) {
      days.push(null)
      continue
    }
    const n = setsBy.get(d) ?? 0
    if (n === 0) days.push(sessionDays.has(d) ? 1 : 0)
    else days.push(Math.max(1, Math.ceil((3 * n) / max)) as 1 | 2 | 3)
  }
  return { start, weeks, days }
}

// ---------- Semana resuelta ----------

export type DayStatus = 'hecha' | 'hoy' | 'planificada' | 'descanso' | 'sin-hacer'

export interface ResolvedDay {
  date: ISODate
  /** 1 = lunes … 7 = domingo. */
  weekday: number
  isToday: boolean
  /**
   * `hecha` si hay alguna sesión ese día; si no, `hoy` para hoy; en días futuros `planificada` si
   * queda algún hueco sin cumplir y `descanso` si no; en días pasados `sin-hacer` si quedó algún
   * hueco sin cumplir y `descanso` si no (un hueco cumplido otro día no deja el suyo sin hacer).
   */
  status: DayStatus
  slots: ResolvedSlot[]
  /** Sesiones hechas ese día, en orden. */
  workouts: WorkoutFact[]
}

export interface ResolvedWeek {
  weekStart: ISODate
  weekEnd: ISODate
  source: PlanSource
  days: ResolvedDay[]
  /** Huecos de la semana en orden, con su emparejamiento. */
  slots: ResolvedSlot[]
  /** Siguiente hueco sin hacer desde `today` (puede ser de una semana posterior). */
  next: NextSession | null
}

/** Semana que contiene `date`, con el estado de cada día respecto a `today`. */
export function resolveWeek(ctx: MetricsContext, date: ISODate, today: ISODate): ResolvedWeek {
  const { plan, slots, workouts } = weekResolution(ctx, date)
  const days: ResolvedDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(plan.weekStart, i)
    const daySlots = slots.filter((s) => s.date === d)
    const dayWorkouts = workouts.filter((w) => dateOf(w.startTime) === d)
    const pending = daySlots.some((s) => s.doneWorkoutId == null)
    const status: DayStatus = dayWorkouts.length
      ? 'hecha'
      : d === today
        ? 'hoy'
        : d > today
          ? pending
            ? 'planificada'
            : 'descanso'
          : pending
            ? 'sin-hacer'
            : 'descanso'
    days.push({ date: d, weekday: isoWeekday(d), isToday: d === today, status, slots: daySlots, workouts: dayWorkouts })
  }
  return { weekStart: plan.weekStart, weekEnd: weekEndOf(plan.weekStart), source: plan.source, days, slots, next: nextSession(ctx, today) }
}

export interface NextSession extends PlanSlot {
  isToday: boolean
}

/** Semanas hacia delante en las que se busca la próxima sesión (límite de búsqueda, no un parámetro de métrica). */
const NEXT_SESSION_LOOKAHEAD_WEEKS = 8

/**
 * Próxima sesión desde `from` (incluido si aún no está hecha): el primer hueco sin cumplir con
 * fecha ≥ `from`. También es la respuesta a "¿qué me toca?" para una fecha. null si no hay nada
 * planificado en las próximas semanas.
 */
export function nextSession(ctx: MetricsContext, from: ISODate): NextSession | null {
  let ws = weekStartOf(from, ctx.settings.weekStartsOn)
  for (let i = 0; i < NEXT_SESSION_LOOKAHEAD_WEEKS; i++, ws = addDays(ws, 7)) {
    const slot = weekResolution(ctx, ws).slots.find((s) => s.date >= from && s.doneWorkoutId == null)
    if (slot) {
      const { doneWorkoutId: _a, doneDate: _b, ...rest } = slot
      return { ...rest, isToday: slot.date === from }
    }
  }
  return null
}

/** Lo planificado para una fecha concreta, con si ya está hecho ("¿qué me toca el jueves?"). */
export function slotsForDate(ctx: MetricsContext, date: ISODate): ResolvedSlot[] {
  return weekResolution(ctx, date).slots.filter((s) => s.date === date)
}
