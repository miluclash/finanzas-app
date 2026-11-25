// Vistas para la interfaz (DTO de los métodos `entreno:metrics.*`): juntan varias métricas con los
// nombres que necesita la pantalla. Puras: el proceso principal solo aporta el contexto y "hoy".
import { monthEnd } from '../../../dates'
import type { GoalStatus, WorkoutKind } from '../types'
import { type MetricsContext, blockAt, setBodyweightReps, setLoadKg } from './context'
import { type EventCountdown, type HyroxStatus, eventCountdown, hyroxStatus } from './event'
import { type GoalProgress, goalProgress } from './goals'
import {
  type ConsistencyMap,
  type NextSession,
  type ResolvedWeek,
  type WeekAdherence,
  consistencyMap,
  nextSession,
  resolveWeek,
  weekAdherence
} from './plan'
import { type RecordHit, type RecordMark, type RecordsResult, recentRecords, workoutRecordHits } from './records'
import { type VolumeTrend, weeklyVolumeTrend } from './trend'
import type { GoalFact, ISODate, LocalDateTime } from './types'
import { type GroupWeekSets, activeGroups, effectiveSetsMap, filterSets, setsStatus } from './volume'
import { addDays, dateOf, minutesBetween, weekEndOf, weekKeysBetween, weekStartOf } from './weeks'

export type SummaryPeriod = 'week' | 'month' | 'block'

export interface SummaryQuery {
  period?: SummaryPeriod
  /** Fecha que elige el periodo (por defecto, hoy). */
  date?: ISODate | null
}

export interface PeriodRange {
  /** Periodo pedido. */
  requested: SummaryPeriod
  /** Periodo usado: con `block` y sin bloque en esa fecha se usa la semana. */
  period: SummaryPeriod
  from: ISODate
  to: ISODate
  blockId: number | null
  blockName: string | null
  /** Semanas del periodo hasta hoy (las de adherencia y la media de series). */
  weeks: ISODate[]
}

export interface PeriodTotals {
  loadKg: number
  bodyweightReps: number
  /** Series que cuentan. */
  sets: number
  sessions: number
  /** Minutos de las sesiones con hora de fin. */
  minutes: number
}

export interface RecordHitView extends RecordHit {
  exerciseTitle: string
}

export interface RecordMarkView extends RecordMark {
  exerciseTitle: string
}

export interface ExerciseRecordsView {
  exerciseId: number
  exerciseTitle: string
  isBodyweight: boolean
  records: RecordMarkView[]
}

export interface RecentWorkout {
  workoutId: number
  title: string
  startTime: LocalDateTime
  kind: WorkoutKind
  routineId: number | null
  routineName: string | null
  minutes: number | null
  loadKg: number
  sets: number
  /** Récords batidos en la sesión (vacío si ninguno). */
  records: RecordHitView[]
}

export interface GoalView extends GoalProgress {
  name: string
  status: GoalStatus
  deadline: ISODate | null
  targetReps: number | null
  exerciseId: number | null
  exerciseTitle: string | null
  groupId: number | null
  groupName: string | null
  kind: WorkoutKind | null
  eventId: number | null
  eventName: string | null
}

export interface MuscleSetsView {
  /** Semanas sobre las que se reparte (1 en la vista semanal). */
  weeks: number
  /** Series efectivas por semana (media del periodo) y estado frente al rango del grupo. */
  groups: GroupWeekSets[]
}

export interface EntrenoSummary {
  today: ISODate
  range: PeriodRange
  /** Semana de hoy, con el estado de cada día. */
  week: ResolvedWeek
  next: NextSession | null
  adherence: {
    /** Semana: la actual y las 4 anteriores; mes o bloque: sus semanas. De la más antigua a la más nueva. */
    weeks: WeekAdherence[]
    /** Suma de esas semanas (cada una ya topada por separado). */
    planned: number
    done: number
    pct: number | null
  }
  /** Volumen semanal: 8 semanas hasta hoy (semana) o las semanas del periodo. */
  volume: VolumeTrend
  totals: PeriodTotals
  muscleSets: MuscleSetsView
  goals: GoalView[]
  /** HYROX del evento futuro más cercano con bloques (null si no hay). */
  hyrox: HyroxStatus | null
  recentRecords: RecordHitView[]
  recentWorkouts: RecentWorkout[]
  consistency: ConsistencyMap
}

export interface EntrenoInicio {
  today: ISODate
  week: { weekStart: ISODate; planned: number; done: number; sessions: number; pct: number | null }
  volume: { weekKey: ISODate; loadKg: number; previousLoadKg: number | null; changePct: number | null }
  nextEvent: ({ id: number; name: string } & EventCountdown) | null
  next: NextSession | null
  records: RecordHitView[]
}

const exTitle = (ctx: MetricsContext, id: number | null): string => (id == null ? '' : (ctx.exerciseById.get(id)?.title ?? ''))

export function hitView(ctx: MetricsContext, h: RecordHit): RecordHitView {
  return { ...h, exerciseTitle: exTitle(ctx, h.exerciseId) }
}

export function exerciseRecordsView(ctx: MetricsContext, r: RecordsResult, exerciseId?: number | null): ExerciseRecordsView[] {
  return r.current
    .filter((c) => exerciseId == null || c.exerciseId === exerciseId)
    .map((c) => ({
      exerciseId: c.exerciseId,
      exerciseTitle: exTitle(ctx, c.exerciseId),
      isBodyweight: ctx.exerciseById.get(c.exerciseId)?.isBodyweight === true,
      records: c.records.map((m) => ({ ...m, exerciseTitle: exTitle(ctx, m.exerciseId) }))
    }))
}

export function workoutRecordsView(ctx: MetricsContext, r: RecordsResult, workoutId: number): RecordHitView[] {
  return workoutRecordHits(r, workoutId).map((h) => hitView(ctx, h))
}

export function goalView(ctx: MetricsContext, g: GoalFact, today: ISODate): GoalView {
  return {
    ...goalProgress(ctx, g, today),
    name: g.name ?? '',
    status: g.status,
    deadline: g.deadline,
    targetReps: g.targetReps,
    exerciseId: g.exerciseId,
    exerciseTitle: g.exerciseId == null ? null : exTitle(ctx, g.exerciseId),
    groupId: g.groupId,
    groupName: g.groupId == null ? null : (ctx.groupById.get(g.groupId)?.name ?? ''),
    kind: g.kind,
    eventId: g.eventId,
    eventName: g.eventId == null ? null : (ctx.eventById.get(g.eventId)?.name ?? '')
  }
}

/** Todos los objetivos: activos primero, luego conseguidos y abandonados (cada grupo en su orden). */
export function goalViews(ctx: MetricsContext, today: ISODate, onlyActive = false): GoalView[] {
  const rank: Record<GoalStatus, number> = { ACTIVE: 0, ACHIEVED: 1, ABANDONED: 2 }
  return ctx.facts.goals
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => !onlyActive || g.status === 'ACTIVE')
    .sort((a, b) => rank[a.g.status] - rank[b.g.status] || a.i - b.i)
    .map(({ g }) => goalView(ctx, g, today))
}

/** Evento futuro (o de hoy) más cercano; con `withBlocks`, solo los que tienen bloques. */
export function nearestEvent(ctx: MetricsContext, today: ISODate, withBlocks = false) {
  return [...ctx.facts.events]
    .filter((e) => e.date >= today && (!withBlocks || ctx.facts.blocks.some((b) => b.eventId === e.id)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))[0]
}

/**
 * Rango del periodo que contiene `date`. Bloque: el que contiene la fecha o, si no hay, el último
 * que empezó antes; un bloque abierto llega hasta hoy (o hasta la fecha, si es posterior). Sin
 * ningún bloque se usa la semana.
 */
export function periodRange(ctx: MetricsContext, requested: SummaryPeriod, date: ISODate, today: ISODate): PeriodRange {
  const ws = ctx.settings.weekStartsOn
  let period = requested
  let from: ISODate
  let to: ISODate
  let blockId: number | null = null
  let blockName: string | null = null
  const block =
    requested === 'block'
      ? (blockAt(ctx.facts.blocks, date) ??
        [...ctx.facts.blocks].filter((b) => b.startDate <= date).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0])
      : undefined
  if (requested === 'block' && block) {
    from = block.startDate
    to = block.endDate ?? (date > today ? date : today)
    blockId = block.id
    blockName = block.name
  } else if (requested === 'month') {
    from = `${date.slice(0, 7)}-01`
    to = monthEnd(date.slice(0, 7))
  } else {
    period = 'week'
    from = weekStartOf(date, ws)
    to = weekEndOf(from)
  }
  const last = to < today ? to : today
  const weeks = last < from ? [weekStartOf(from, ws)] : weekKeysBetween(from, last, ws)
  return { requested, period, from, to, blockId, blockName, weeks }
}

export function periodTotals(ctx: MetricsContext, from: ISODate, to: ISODate): PeriodTotals {
  const sets = filterSets(ctx, { from, to })
  const ws = ctx.workouts.filter((w) => {
    const d = dateOf(w.startTime)
    return d >= from && d <= to
  })
  return {
    loadKg: sets.reduce((a, s) => a + setLoadKg(s), 0),
    bodyweightReps: sets.reduce((a, s) => a + setBodyweightReps(s), 0),
    sets: sets.length,
    sessions: ws.length,
    minutes: ws.reduce((a, w) => a + (minutesBetween(w.startTime, w.endTime) ?? 0), 0)
  }
}

/** Series efectivas por grupo en el periodo, como media por semana (con el estado de esa media). */
export function muscleSetsView(ctx: MetricsContext, from: ISODate, to: ISODate, weeks: number): MuscleSetsView {
  const n = Math.max(1, weeks)
  const map = effectiveSetsMap(ctx, filterSets(ctx, { from, to }))
  return {
    weeks: n,
    groups: activeGroups(ctx).map((g) => {
      const sets = (map.get(g.id) ?? 0) / n
      return { groupId: g.id, name: g.name, sets, min: g.weeklySetsMin, max: g.weeklySetsMax, status: setsStatus(sets, g.weeklySetsMin, g.weeklySetsMax) }
    })
  }
}

export function recentWorkouts(ctx: MetricsContext, r: RecordsResult, limit = 5): RecentWorkout[] {
  return ctx.workouts
    .slice(-limit)
    .reverse()
    .map((w) => {
      const sets = ctx.counted.filter((s) => s.workoutId === w.id)
      const routine = w.routineId == null ? undefined : ctx.routineById.get(w.routineId)
      return {
        workoutId: w.id,
        title: w.title ?? '',
        startTime: w.startTime,
        kind: w.kind,
        routineId: w.routineId,
        routineName: routine?.name ?? null,
        minutes: minutesBetween(w.startTime, w.endTime),
        loadKg: sets.reduce((a, s) => a + setLoadKg(s), 0),
        sets: sets.length,
        records: workoutRecordsView(ctx, r, w.id)
      }
    })
}

export function buildSummary(ctx: MetricsContext, records: RecordsResult, today: ISODate, q: SummaryQuery = {}, stations: readonly string[] = []): EntrenoSummary {
  const range = periodRange(ctx, q.period ?? 'week', q.date ?? today, today)
  const week = resolveWeek(ctx, today, today)
  const adherenceWeeks = range.period === 'week' ? [4, 3, 2, 1, 0].map((i) => addDays(range.weeks[range.weeks.length - 1], -7 * i)) : range.weeks
  const adh = adherenceWeeks.map((w) => weekAdherence(ctx, w))
  const planned = adh.reduce((a, w) => a + w.planned, 0)
  const done = adh.reduce((a, w) => a + w.done, 0)
  const volume =
    range.period === 'week' ? weeklyVolumeTrend(ctx, range.weeks[range.weeks.length - 1], 8) : weeklyVolumeTrend(ctx, range.weeks[range.weeks.length - 1], range.weeks.length)
  const event = nearestEvent(ctx, today, true)
  return {
    today,
    range,
    week,
    next: week.next,
    adherence: { weeks: adh, planned, done, pct: planned > 0 ? done / planned : null },
    volume,
    totals: periodTotals(ctx, range.from, range.to),
    muscleSets: muscleSetsView(ctx, range.from, range.to, range.weeks.length),
    goals: goalViews(ctx, today, true),
    hyrox: event ? hyroxStatus(ctx, event.id, today, stations) : null,
    recentRecords: recentRecords(records, 5).map((h) => hitView(ctx, h)),
    recentWorkouts: recentWorkouts(ctx, records, 5),
    consistency: consistencyMap(ctx, today, 12)
  }
}

export function buildInicio(ctx: MetricsContext, records: RecordsResult, today: ISODate): EntrenoInicio {
  const ws = weekStartOf(today, ctx.settings.weekStartsOn)
  const adh = weekAdherence(ctx, ws)
  const trend = weeklyVolumeTrend(ctx, today, 2)
  const event = nearestEvent(ctx, today)
  const end = weekEndOf(ws)
  return {
    today,
    week: {
      weekStart: ws,
      planned: adh.planned,
      done: adh.done,
      sessions: ctx.workouts.filter((w) => dateOf(w.startTime) >= ws && dateOf(w.startTime) <= end).length,
      pct: adh.pct
    },
    volume: { weekKey: trend.current.weekKey, loadKg: trend.current.loadKg, previousLoadKg: trend.previous?.loadKg ?? null, changePct: trend.changePct },
    nextEvent: event ? { id: event.id, name: event.name, ...eventCountdown(event.date, today) } : null,
    next: nextSession(ctx, today),
    records: recentRecords(records, 3).map((h) => hitView(ctx, h))
  }
}
