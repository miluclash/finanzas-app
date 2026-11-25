// Cuenta atrás de un evento y seguimiento de HYROX (fases = bloques del evento, estaciones y carrera).
import { type CountedSet, type MetricsContext } from './context'
import type { BlockFact, EventFact, ISODate } from './types'
import { dateOf, diffDays, inRange } from './weeks'

export interface EventCountdown {
  date: ISODate
  /** Días hasta el evento (0 = es hoy; negativo = ya pasó). */
  daysLeft: number
  /** Semanas de entrenamiento restantes = días / 7 redondeado hacia arriba (0 si es hoy o ya pasó). */
  weeksLeft: number
  isPast: boolean
}

export function eventCountdown(date: ISODate, today: ISODate): EventCountdown {
  const daysLeft = diffDays(date, today)
  return { date, daysLeft, weeksLeft: daysLeft > 0 ? Math.ceil(daysLeft / 7) : 0, isPast: daysLeft < 0 }
}

export interface EventPhase {
  blockId: number
  name: string
  startDate: ISODate
  /** Fin del bloque (o la fecha del evento si el bloque está abierto). */
  endDate: ISODate
  /** Duración en semanas, redondeada hacia arriba. */
  weeks: number
  isDeload: boolean
  isCurrent: boolean
}

export interface StationBest {
  value: number
  workoutId: number
  date: ISODate
}

export interface StationStats {
  station: string
  exerciseIds: number[]
  /** Sesiones distintas en las que se hizo alguna serie que cuenta de la estación. */
  timesDone: number
  lastDate: ISODate | null
  /** Mejores marcas según lo que haya: mayor peso, mayor distancia, menor duración y más reps. */
  bestWeightKg: StationBest | null
  bestDistanceKm: StationBest | null
  /** La duración más corta (las estaciones se cronometran sobre una distancia o reps fijas). */
  bestDurationSeconds: StationBest | null
  bestReps: StationBest | null
}

export interface RunStats {
  sessions: number
  /** Σ distancia de las series que cuentan de sesiones RUN; null si ninguna tiene distancia. */
  distanceKm: number | null
  /** Mejor ritmo (segundos por km) de una serie con distancia y duración; null si no hay. */
  bestPaceSecPerKm: StationBest | null
}

export interface HyroxStatus {
  event: EventFact
  countdown: EventCountdown
  /**
   * Tiempo transcurrido desde el inicio del primer bloque del evento hasta el evento (se rotula
   * así, no como "preparación"). null si el evento no tiene bloques.
   */
  elapsed: { start: ISODate; daysElapsed: number; daysTotal: number; pct: number } | null
  phases: EventPhase[]
  currentPhase: { blockId: number; name: string; week: number; weeks: number } | null
  stations: StationStats[]
  run: RunStats
  /** Periodo que cubren estaciones y carrera: desde el inicio del primer bloque (o todo el historial) hasta hoy. */
  from: ISODate | null
  to: ISODate
}

function phaseEnd(b: BlockFact, event: EventFact): ISODate {
  return b.endDate ?? event.date
}

function better(prev: StationBest | null, value: number, s: CountedSet, lower = false): StationBest | null {
  if (!(value > 0)) return prev
  if (prev && (lower ? value >= prev.value : value <= prev.value)) return prev
  return { value, workoutId: s.workoutId, date: s.date }
}

/**
 * Estado HYROX de un evento. `stations` da el orden y las estaciones que salen aunque no se hayan
 * hecho (el diccionario de `hyrox.ts`); las estaciones de ejercicios que no estén en la lista
 * salen después. Estaciones y carrera cuentan desde el inicio del primer bloque del evento (si no
 * tiene bloques, todo el historial) hasta `today`.
 */
export function hyroxStatus(ctx: MetricsContext, eventId: number, today: ISODate, stations: readonly string[] = []): HyroxStatus | null {
  const event = ctx.eventById.get(eventId)
  if (!event) return null
  const blocks = ctx.facts.blocks.filter((b) => b.eventId === eventId).sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id - b.id))
  const start = blocks[0]?.startDate ?? null

  let elapsed: HyroxStatus['elapsed'] = null
  if (start) {
    const daysTotal = Math.max(0, diffDays(event.date, start))
    const daysElapsed = Math.min(daysTotal, Math.max(0, diffDays(today, start)))
    elapsed = { start, daysElapsed, daysTotal, pct: daysTotal > 0 ? daysElapsed / daysTotal : 1 }
  }

  const phases: EventPhase[] = blocks.map((b) => {
    const end = phaseEnd(b, event)
    return {
      blockId: b.id,
      name: b.name,
      startDate: b.startDate,
      endDate: end,
      weeks: Math.max(1, Math.ceil((diffDays(end, b.startDate) + 1) / 7)),
      isDeload: b.isDeload,
      isCurrent: b.startDate <= today && today <= end
    }
  })
  const cur = phases.find((p) => p.isCurrent)
  const currentPhase = cur ? { blockId: cur.blockId, name: cur.name, week: Math.floor(diffDays(today, cur.startDate) / 7) + 1, weeks: cur.weeks } : null

  const sets = ctx.counted.filter((s) => inRange(s.date, start, today))
  const names = [...stations]
  for (const ex of ctx.facts.exercises) if (ex.hyroxStation && !names.includes(ex.hyroxStation)) names.push(ex.hyroxStation)
  const stationStats: StationStats[] = names.map((station) => {
    const exerciseIds = ctx.facts.exercises.filter((e) => e.hyroxStation === station).map((e) => e.id).sort((a, b) => a - b)
    const own = sets.filter((s) => exerciseIds.includes(s.exerciseId))
    let bestWeightKg: StationBest | null = null
    let bestDistanceKm: StationBest | null = null
    let bestDurationSeconds: StationBest | null = null
    let bestReps: StationBest | null = null
    for (const s of own) {
      bestWeightKg = better(bestWeightKg, s.weightKg ?? 0, s)
      bestDistanceKm = better(bestDistanceKm, s.distanceKm ?? 0, s)
      bestDurationSeconds = better(bestDurationSeconds, s.durationSeconds ?? 0, s, true)
      bestReps = better(bestReps, s.reps ?? 0, s)
    }
    return {
      station,
      exerciseIds,
      timesDone: new Set(own.map((s) => s.workoutId)).size,
      lastDate: own.length ? own[own.length - 1].date : null,
      bestWeightKg,
      bestDistanceKm,
      bestDurationSeconds,
      bestReps
    }
  })

  const runWorkouts = ctx.workouts.filter((w) => w.kind === 'RUN' && inRange(dateOf(w.startTime), start, today))
  const runSets = sets.filter((s) => s.workout.kind === 'RUN')
  const withDist = runSets.filter((s) => s.distanceKm != null && s.distanceKm > 0)
  let bestPace: StationBest | null = null
  for (const s of withDist) if (s.durationSeconds != null && s.durationSeconds > 0) bestPace = better(bestPace, s.durationSeconds / s.distanceKm!, s, true)

  return {
    event,
    countdown: eventCountdown(event.date, today),
    elapsed,
    phases,
    currentPhase,
    stations: stationStats,
    run: {
      sessions: runWorkouts.length,
      distanceKm: withDist.length ? withDist.reduce((a, s) => a + s.distanceKm!, 0) : null,
      bestPaceSecPerKm: bestPace
    },
    from: start,
    to: today
  }
}
