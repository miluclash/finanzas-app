// Revisión semanal de Entreno (sugerencias de F6, §8 de docs/EVOLUCION.md). La calcula la app y se
// ve aunque Ollama esté apagado; la IA solo la explica. Pura: "hoy" entra como parámetro.
//
// Semana revisada: la ÚLTIMA SEMANA COMPLETA, es decir, la anterior a la que contiene `today` (de
// lunes a domingo). Es la opción más simple y estable: una semana en curso siempre parecería a
// medias (pocas series, sesiones por hacer) y daría avisos falsos. Lo que mira hacia delante
// (ritmo de los objetivos y HYROX) se calcula con `today`, como en la página de Objetivos.
//
// Hallazgos (cada tipo, como mucho `maxPerKind`, para no saturar):
// - `adherence`: sesiones hechas frente a previstas de la semana revisada, con el mismo
//   emparejamiento que la semana del plan (`weekAdherence` y `resolveWeek`). Por debajo de
//   `adherenceMin` es un aviso; al 100 %, un acierto; en medio, información. Sin nada previsto
//   (ni plan, ni boceto, ni bloque) no hay hallazgo.
// - `stagnation`: ejercicios de fuerza (categoría fuerza o sin categoría; los de natación, cardio,
//   HYROX y movilidad no se juzgan así) cuya mejor marca de las últimas `stallWeeks` semanas (las
//   que terminan en la revisada) no supera la mejor de antes. Marca = mejor e1RM; en ejercicios de
//   peso corporal, más repeticiones en una serie. Hace falta historial anterior (un ejercicio nuevo
//   no está estancado) y al menos `stallMinSessions` sesiones en esas semanas. Igualar la marca no
//   es mejorar (como en los récords). Series sin peso o fuera del rango de reps del e1RM no dan marca.
//   Orden: más sesiones primero, luego más lejos de la marca, luego por nombre.
// - `muscle`: grupos activos con mínimo semanal (`weeklySetsMin` del catálogo, que es "lo previsto")
//   cuyas series efectivas de la semana revisada quedan por debajo. Solo se miran los grupos que
//   entrenas: los que tienen alguna serie efectiva en las últimas `muscleWeeks` semanas que terminan
//   en la revisada (así un grupo del catálogo inicial que no trabajas, con su mínimo por defecto de
//   10, no avisa cada semana; uno que sueles hacer y esta semana no, sí). No se mira en semanas de
//   descarga ni en semanas sin ninguna serie (eso ya lo dice la adherencia). Si todos llegan, sale un
//   único acierto `muscles-ok`. Orden: mayor déficit relativo primero.
// - `pace`: objetivos activos medibles (no de tipo evento) con fecha límite (la suya o, si no tiene,
//   la del evento al que van unidos) que no haya pasado. Conseguido (la mejor semana llega) es un
//   acierto; si no, con la proyección de `goalProgress`: llega a la meta en la fecha → acierto (vas a
//   ritmo); no llega → aviso. Sin proyección (pocas semanas con datos) no hay hallazgo. Orden: los
//   que no llegan primero, luego por fecha límite.
// - `hyrox`: evento futuro más cercano con bloques (el mismo que la tarjeta HYROX del resumen):
//   cuenta atrás y fase actual (información).
// - `stations`: de ese evento, estaciones (`stations`, en orden de carrera) sin ninguna serie en las
//   últimas `hyroxStationWeeks` semanas que terminan en la revisada (o después). Solo si algún
//   ejercicio del catálogo tiene estación; si todas están al día, un acierto.
// - `record`: récords batidos en la semana revisada, uno por ejercicio (el de más peso en el orden
//   de `RECORD_TYPES`; a igualdad, el más reciente), con cuántos récords hubo en total.
import type { GoalType, WorkoutKind } from '../types'
import { type MetricsContext, blockOverlapsWeek, setE1rm } from './context'
import { hyroxStatus } from './event'
import type { GoalUnit } from './goals'
import { type PlannedSource, resolveWeek, weekAdherence } from './plan'
import { RECORD_TYPES, type RecordType, type RecordsResult, computeRecords } from './records'
import type { EntrenoSettings, ISODate } from './types'
import { goalView, nearestEvent } from './views'
import { effectiveSetsByGroup, effectiveSetsMap, filterSets } from './volume'
import { addDays, weekEndOf, weekStartOf } from './weeks'

export interface ReviewParams {
  /** Semanas (terminando en la revisada) en las que se busca una mejora de la mejor marca. */
  stallWeeks: number
  /** Sesiones mínimas del ejercicio en esas semanas para juzgarlo. */
  stallMinSessions: number
  /** Adherencia (0–1) por debajo de la cual se avisa. */
  adherenceMin: number
  /** Semanas hacia atrás (terminando en la revisada) para saber qué grupos musculares entrenas. */
  muscleWeeks: number
  /** Semanas sin practicar una estación de HYROX para avisar. */
  hyroxStationWeeks: number
  /** Máximo de hallazgos de cada tipo (límite de presentación, no un umbral de métrica). */
  maxPerKind: number
}

/** Valores por defecto. Los cinco umbrales se guardan en los ajustes de Entreno (`review*`). */
export const REVIEW_DEFAULTS: ReviewParams = {
  stallWeeks: 4,
  stallMinSessions: 3,
  adherenceMin: 0.8,
  muscleWeeks: 4,
  hyroxStationWeeks: 3,
  maxPerKind: 3
}

/** Parámetros a partir de los ajustes de Entreno (lo que falte, por defecto). */
export function reviewParamsFrom(settings: Partial<EntrenoSettings>, over: Partial<ReviewParams> = {}): ReviewParams {
  return {
    stallWeeks: settings.reviewStallWeeks ?? REVIEW_DEFAULTS.stallWeeks,
    stallMinSessions: settings.reviewStallMinSessions ?? REVIEW_DEFAULTS.stallMinSessions,
    adherenceMin: settings.reviewAdherenceMin ?? REVIEW_DEFAULTS.adherenceMin,
    muscleWeeks: settings.reviewMuscleWeeks ?? REVIEW_DEFAULTS.muscleWeeks,
    hyroxStationWeeks: settings.reviewHyroxStationWeeks ?? REVIEW_DEFAULTS.hyroxStationWeeks,
    maxPerKind: REVIEW_DEFAULTS.maxPerKind,
    ...over
  }
}

export type ReviewSeverity = 'info' | 'warning' | 'success'

export interface AdherenceMiss {
  /** Día del hueco sin cumplir (null si lo previsto sale del bloque, que no tiene días). */
  date: ISODate | null
  /** Tipo de entreno del hueco (null con lo previsto del bloque). */
  routineName: string | null
  kind: WorkoutKind | null
  /** Sesiones que faltaron (1 por hueco; con bloque, las que faltan de ese tipo). */
  count: number
}

export interface AdherenceFinding {
  kind: 'adherence'
  severity: ReviewSeverity
  source: PlannedSource
  planned: number
  done: number
  pct: number
  /** Sesiones que no cumplían nada previsto. */
  extra: number
  missed: AdherenceMiss[]
}

export interface StagnationFinding {
  kind: 'stagnation'
  severity: 'warning'
  exerciseId: number
  exerciseTitle: string
  /** `e1rm` (kg) o `reps` (peso corporal: más repeticiones en una serie). */
  measure: 'e1rm' | 'reps'
  /** Mejor marca de antes de las semanas revisadas, y cuándo fue. */
  best: number
  bestDate: ISODate
  /** Mejor marca dentro de las semanas revisadas (≤ `best`). */
  windowBest: number
  /** Sesiones con el ejercicio en esas semanas. */
  sessions: number
  weeks: number
}

export interface MuscleFinding {
  kind: 'muscle'
  severity: 'warning'
  groupId: number
  groupName: string
  /** Series efectivas de la semana. */
  sets: number
  min: number
  max: number
}

export interface MusclesOkFinding {
  kind: 'muscles-ok'
  severity: 'success'
  /** Grupos con mínimo que llegaron. */
  groups: number
}

export type PaceStatus = 'achieved' | 'on-track' | 'behind'

export interface PaceFinding {
  kind: 'pace'
  severity: ReviewSeverity
  status: PaceStatus
  goalId: number
  /** Nombre del objetivo o, si no tiene, del ejercicio o grupo. */
  goalName: string
  goalType: GoalType
  unit: GoalUnit | null
  target: number
  current: number | null
  best: number | null
  /** Valor proyectado en la fecha límite (null si ya está conseguido). */
  projected: number | null
  deadline: ISODate
  eventName: string | null
}

export interface HyroxFinding {
  kind: 'hyrox'
  severity: 'info'
  eventId: number
  eventName: string
  date: ISODate
  daysLeft: number
  weeksLeft: number
  phase: { name: string; week: number; weeks: number } | null
}

export interface StationsFinding {
  kind: 'stations'
  severity: 'warning' | 'success'
  eventId: number
  eventName: string
  weeks: number
  /** Estaciones sin practicar en esas semanas (vacío = todas al día). */
  stale: { station: string; lastDate: ISODate | null }[]
  /** Estaciones que se miran. */
  total: number
}

export interface RecordFinding {
  kind: 'record'
  severity: 'success'
  exerciseId: number
  exerciseTitle: string
  workoutId: number
  date: ISODate
  type: RecordType
  value: number
  weightKg: number | null
  previous: number
  /** Récords del ejercicio en la semana (este incluido). */
  count: number
}

export type ReviewFinding =
  | AdherenceFinding
  | StagnationFinding
  | MuscleFinding
  | MusclesOkFinding
  | PaceFinding
  | HyroxFinding
  | StationsFinding
  | RecordFinding

export type ReviewFindingKind = ReviewFinding['kind']

export interface WeeklyReview {
  today: ISODate
  /** Semana revisada (la última completa). */
  weekStart: ISODate
  weekEnd: ISODate
  /** Algún día de la semana cae en un bloque de descarga. */
  isDeload: boolean
  /** Sesiones de la semana revisada. */
  sessions: number
  /** En este orden: adherencia, estancamientos, grupos, ritmo, estaciones, HYROX, récords y grupos al día. */
  findings: ReviewFinding[]
}

export interface WeeklyReviewInput {
  ctx: MetricsContext
  today: ISODate
  /** Récords ya calculados (si no, se calculan). */
  records?: RecordsResult
  /** Estaciones de HYROX en orden de carrera (`HYROX_STATION_KEYS`). */
  stations?: readonly string[]
}

const byText = (a: string, b: string) => a.localeCompare(b, 'es')

function adherenceFinding(ctx: MetricsContext, weekStart: ISODate, today: ISODate, p: ReviewParams): AdherenceFinding | null {
  const adh = weekAdherence(ctx, weekStart)
  if (adh.planned === 0 || adh.pct == null) return null
  const missed: AdherenceMiss[] = []
  if (adh.source === 'semana' || adh.source === 'boceto') {
    for (const s of resolveWeek(ctx, weekStart, today).slots)
      if (s.doneWorkoutId == null && s.kind) missed.push({ date: s.date, routineName: s.routineName || null, kind: s.kind, count: 1 })
  } else {
    for (const k of adh.byKind) if (k.done < k.planned) missed.push({ date: null, routineName: null, kind: k.kind, count: k.planned - k.done })
  }
  const severity: ReviewSeverity = adh.pct >= 1 ? 'success' : adh.pct < p.adherenceMin ? 'warning' : 'info'
  return { kind: 'adherence', severity, source: adh.source, planned: adh.planned, done: adh.done, pct: adh.pct, extra: adh.extra, missed }
}

function stagnationFindings(ctx: MetricsContext, weekEnd: ISODate, p: ReviewParams): StagnationFinding[] {
  const weeks = Math.max(1, p.stallWeeks)
  const from = addDays(weekStartOf(weekEnd, ctx.settings.weekStartsOn), -7 * (weeks - 1))
  interface Acc {
    best: number | null
    bestDate: ISODate | null
    windowBest: number | null
    sessions: Set<number>
  }
  const acc = new Map<number, Acc>()
  for (const s of ctx.counted) {
    if (s.date > weekEnd) break // ctx.counted va en orden cronológico
    const ex = s.exercise
    if (!ex || (ex.category != null && ex.category !== 'STRENGTH')) continue
    const v = ex.isBodyweight ? (s.reps != null && s.reps > 0 ? s.reps : null) : setE1rm(s, ctx.settings)
    let a = acc.get(s.exerciseId)
    if (!a) acc.set(s.exerciseId, (a = { best: null, bestDate: null, windowBest: null, sessions: new Set() }))
    if (s.date < from) {
      if (v != null && (a.best == null || v > a.best)) {
        a.best = v
        a.bestDate = s.date
      }
    } else {
      a.sessions.add(s.workoutId)
      if (v != null && (a.windowBest == null || v > a.windowBest)) a.windowBest = v
    }
  }
  const out: StagnationFinding[] = []
  for (const [exerciseId, a] of acc) {
    if (a.best == null || a.windowBest == null || a.sessions.size < p.stallMinSessions) continue
    if (a.windowBest > a.best) continue
    const ex = ctx.exerciseById.get(exerciseId)!
    out.push({
      kind: 'stagnation',
      severity: 'warning',
      exerciseId,
      exerciseTitle: ex.title,
      measure: ex.isBodyweight ? 'reps' : 'e1rm',
      best: a.best,
      bestDate: a.bestDate!,
      windowBest: a.windowBest,
      sessions: a.sessions.size,
      weeks
    })
  }
  const gap = (f: StagnationFinding) => (f.best - f.windowBest) / f.best
  return out
    .sort((a, b) => b.sessions - a.sessions || gap(b) - gap(a) || byText(a.exerciseTitle, b.exerciseTitle) || a.exerciseId - b.exerciseId)
    .slice(0, p.maxPerKind)
}

function muscleFindings(ctx: MetricsContext, weekStart: ISODate, isDeload: boolean, p: ReviewParams): (MuscleFinding | MusclesOkFinding)[] {
  if (isDeload || !ctx.counted.some((s) => s.weekKey === weekStart)) return []
  const from = addDays(weekStart, -7 * (Math.max(1, p.muscleWeeks) - 1))
  const trained = effectiveSetsMap(ctx, filterSets(ctx, { from, to: weekEndOf(weekStart) }))
  const groups = effectiveSetsByGroup(ctx, weekStart).filter((g) => g.min > 0 && (trained.get(g.groupId) ?? 0) > 0)
  if (!groups.length) return []
  const low = groups.filter((g) => g.status === 'bajo')
  if (!low.length) return [{ kind: 'muscles-ok', severity: 'success', groups: groups.length }]
  const deficit = (g: { sets: number; min: number }) => (g.min - g.sets) / g.min
  return low
    .sort((a, b) => deficit(b) - deficit(a) || byText(a.name, b.name) || a.groupId - b.groupId)
    .slice(0, p.maxPerKind)
    .map((g) => ({ kind: 'muscle', severity: 'warning', groupId: g.groupId, groupName: g.name, sets: g.sets, min: g.min, max: g.max }))
}

function paceFindings(ctx: MetricsContext, today: ISODate, p: ReviewParams): PaceFinding[] {
  const out: PaceFinding[] = []
  for (const g of ctx.facts.goals) {
    if (g.status !== 'ACTIVE' || g.type === 'EVENT' || g.targetValue == null || !(g.targetValue > 0)) continue
    const event = g.eventId != null ? ctx.eventById.get(g.eventId) : undefined
    const deadline = g.deadline ?? event?.date ?? null
    if (!deadline || deadline < today) continue
    // Sin fecha propia se proyecta a la del evento (goalProgress solo mira la del objetivo).
    const v = goalView(ctx, { ...g, deadline }, today)
    let status: PaceStatus
    if (v.achieved) status = 'achieved'
    else if (!v.projection) continue
    else status = v.projection.value >= g.targetValue ? 'on-track' : 'behind'
    out.push({
      kind: 'pace',
      severity: status === 'behind' ? 'warning' : 'success',
      status,
      goalId: g.id,
      goalName: v.name || v.exerciseTitle || v.groupName || '',
      goalType: g.type,
      unit: v.unit,
      target: g.targetValue,
      current: v.current,
      best: v.best,
      projected: status === 'achieved' ? null : v.projection!.value,
      deadline,
      eventName: event?.name ?? null
    })
  }
  const rank: Record<PaceStatus, number> = { behind: 0, 'on-track': 1, achieved: 2 }
  return out
    .sort((a, b) => rank[a.status] - rank[b.status] || byText(a.deadline, b.deadline) || a.goalId - b.goalId)
    .slice(0, p.maxPerKind)
}

function hyroxFindings(ctx: MetricsContext, weekEnd: ISODate, today: ISODate, stations: readonly string[], p: ReviewParams): (HyroxFinding | StationsFinding)[] {
  const event = nearestEvent(ctx, today, true)
  if (!event) return []
  const hs = hyroxStatus(ctx, event.id, today, stations)
  if (!hs) return []
  const out: (HyroxFinding | StationsFinding)[] = []
  if (ctx.facts.exercises.some((e) => e.hyroxStation)) {
    const weeks = Math.max(1, p.hyroxStationWeeks)
    const from = addDays(weekEnd, -7 * weeks + 1)
    const stale = hs.stations.filter((s) => s.lastDate == null || s.lastDate < from).map((s) => ({ station: s.station, lastDate: s.lastDate }))
    out.push({
      kind: 'stations',
      severity: stale.length ? 'warning' : 'success',
      eventId: event.id,
      eventName: event.name,
      weeks,
      stale,
      total: hs.stations.length
    })
  }
  out.push({
    kind: 'hyrox',
    severity: 'info',
    eventId: event.id,
    eventName: event.name,
    date: event.date,
    daysLeft: hs.countdown.daysLeft,
    weeksLeft: hs.countdown.weeksLeft,
    phase: hs.currentPhase ? { name: hs.currentPhase.name, week: hs.currentPhase.week, weeks: hs.currentPhase.weeks } : null
  })
  return out
}

function recordFindings(ctx: MetricsContext, records: RecordsResult, weekStart: ISODate, weekEnd: ISODate, p: ReviewParams): RecordFinding[] {
  const byExercise = new Map<number, RecordFinding>()
  for (const w of records.byWorkout) {
    if (w.date < weekStart || w.date > weekEnd) continue
    for (const h of w.hits) {
      const prev = byExercise.get(h.exerciseId)
      const count = (prev?.count ?? 0) + 1
      // byWorkout va en orden cronológico: a igualdad de tipo gana el más reciente.
      const better = !prev || RECORD_TYPES.indexOf(h.type) <= RECORD_TYPES.indexOf(prev.type)
      const base = better ? h : prev
      byExercise.set(h.exerciseId, {
        kind: 'record',
        severity: 'success',
        exerciseId: h.exerciseId,
        exerciseTitle: ctx.exerciseById.get(h.exerciseId)?.title ?? '',
        workoutId: base.workoutId,
        date: base.date,
        type: base.type,
        value: base.value,
        weightKg: base.weightKg,
        previous: base.previous,
        count
      })
    }
  }
  return [...byExercise.values()]
    .sort((a, b) => RECORD_TYPES.indexOf(a.type) - RECORD_TYPES.indexOf(b.type) || byText(b.date, a.date) || byText(a.exerciseTitle, b.exerciseTitle) || a.exerciseId - b.exerciseId)
    .slice(0, p.maxPerKind)
}

/** Revisión de la última semana completa (la anterior a la de `today`). */
export function weeklyReview(input: WeeklyReviewInput, params: ReviewParams = reviewParamsFrom(input.ctx.settings)): WeeklyReview {
  const { ctx, today } = input
  const weekStart = addDays(weekStartOf(today, ctx.settings.weekStartsOn), -7)
  const weekEnd = weekEndOf(weekStart)
  const isDeload = ctx.facts.blocks.some((b) => b.isDeload && blockOverlapsWeek(b, weekStart, weekEnd))
  const records = input.records ?? computeRecords(ctx)
  const muscles = muscleFindings(ctx, weekStart, isDeload, params)
  const adherence = adherenceFinding(ctx, weekStart, today, params)
  const findings: ReviewFinding[] = [
    ...(adherence ? [adherence] : []),
    ...stagnationFindings(ctx, weekEnd, params),
    ...muscles.filter((f) => f.kind === 'muscle'),
    ...paceFindings(ctx, today, params),
    ...hyroxFindings(ctx, weekEnd, today, input.stations ?? [], params),
    ...recordFindings(ctx, records, weekStart, weekEnd, params),
    ...muscles.filter((f) => f.kind === 'muscles-ok')
  ]
  const sessions = ctx.workouts.filter((w) => {
    const d = w.startTime.slice(0, 10)
    return d >= weekStart && d <= weekEnd
  }).length
  return { today, weekStart, weekEnd, isDeload, sessions, findings }
}
