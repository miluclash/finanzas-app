// Volumen semanal con tendencia: N semanas terminando en la actual, semana actual frente a la
// anterior y semanas de descarga (bloques `isDeload`) para anotarlas en el gráfico.
import { type MetricsContext, blockOverlapsWeek, setBodyweightReps, setLoadKg } from './context'
import type { ISODate } from './types'
import { lastWeekKeys, weekEndOf, weekLabelNumber } from './weeks'

export interface VolumeWeek {
  weekKey: ISODate
  weekEnd: ISODate
  /** Número de semana ISO para el rótulo. */
  isoWeek: number
  loadKg: number
  bodyweightReps: number
  sets: number
  sessions: number
  /** Algún día de la semana cae en un bloque de descarga. */
  isDeload: boolean
  isCurrent: boolean
}

export interface VolumeTrend {
  weeks: VolumeWeek[]
  current: VolumeWeek
  previous: VolumeWeek | null
  /**
   * Cambio de kg de la semana actual (en curso) frente a la anterior, en tanto por uno
   * (0,1 = +10 %). null si la anterior no tiene volumen.
   */
  changePct: number | null
}

export function weeklyVolumeTrend(ctx: MetricsContext, today: ISODate, weeks: number): VolumeTrend {
  const keys = lastWeekKeys(today, Math.max(1, weeks), ctx.settings.weekStartsOn)
  const rows: VolumeWeek[] = keys.map((k, i) => {
    const sets = ctx.counted.filter((s) => s.weekKey === k)
    const end = weekEndOf(k)
    return {
      weekKey: k,
      weekEnd: end,
      isoWeek: weekLabelNumber(k),
      loadKg: sets.reduce((a, s) => a + setLoadKg(s), 0),
      bodyweightReps: sets.reduce((a, s) => a + setBodyweightReps(s), 0),
      sets: sets.length,
      sessions: ctx.workouts.filter((w) => w.startTime.slice(0, 10) >= k && w.startTime.slice(0, 10) <= end).length,
      isDeload: ctx.facts.blocks.some((b) => b.isDeload && blockOverlapsWeek(b, k, end)),
      isCurrent: i === keys.length - 1
    }
  })
  const current = rows[rows.length - 1]
  const previous = rows.length > 1 ? rows[rows.length - 2] : null
  const changePct = previous && previous.loadKg > 0 ? (current.loadKg - previous.loadKg) / previous.loadKg : null
  return { weeks: rows, current, previous, changePct }
}
