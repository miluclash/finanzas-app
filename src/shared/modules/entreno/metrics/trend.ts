// Volumen semanal con tendencia: N semanas terminando en la actual, semana actual frente a la
// anterior y semanas de descarga (bloques `isDeload`) para anotarlas en el gráfico.
//
// Comparación: si la última semana de la serie está en curso (contiene `today`), se compara con
// los mismos días de la semana anterior (del primer día hasta el mismo día de la semana que hoy,
// incluido); si ya terminó, semana entera con semana entera. Las columnas son siempre semanas enteras.
import { type MetricsContext, blockOverlapsWeek, setBodyweightReps, setLoadKg } from './context'
import type { ISODate } from './types'
import { addDays, diffDays, lastWeekKeys, weekEndOf, weekLabelNumber } from './weeks'

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
  /** La semana contiene `today` (está en curso). */
  isCurrent: boolean
}

export type VolumeComparison = 'same-days' | 'full-week'

export interface VolumeTrend {
  weeks: VolumeWeek[]
  /** Última semana de la serie (la de hoy, o la última del periodo). */
  current: VolumeWeek
  /** Semana anterior entera (null si la serie tiene una sola semana). */
  previous: VolumeWeek | null
  /** `same-days`: la última semana está en curso y se compara con los mismos días de la anterior. */
  comparison: VolumeComparison
  /** kg de la semana anterior con los que se compara (mismos días o semana entera). */
  previousLoadKg: number
  /** Último día de la semana anterior que entra en la comparación (su domingo si es semana entera). */
  previousToDate: ISODate
  /** Cambio de kg de `current` frente a `previousLoadKg`, en tanto por uno (0,1 = +10 %); null si este es 0. */
  changePct: number | null
}

/**
 * `end`: fecha cuya semana cierra la serie. `today`: hoy (por defecto, `end`); decide si esa última
 * semana está en curso.
 */
export function weeklyVolumeTrend(ctx: MetricsContext, end: ISODate, weeks: number, today: ISODate = end): VolumeTrend {
  const keys = lastWeekKeys(end, Math.max(1, weeks), ctx.settings.weekStartsOn)
  const rows: VolumeWeek[] = keys.map((k) => {
    const sets = ctx.counted.filter((s) => s.weekKey === k)
    const wEnd = weekEndOf(k)
    return {
      weekKey: k,
      weekEnd: wEnd,
      isoWeek: weekLabelNumber(k),
      loadKg: sets.reduce((a, s) => a + setLoadKg(s), 0),
      bodyweightReps: sets.reduce((a, s) => a + setBodyweightReps(s), 0),
      sets: sets.length,
      sessions: ctx.workouts.filter((w) => w.startTime.slice(0, 10) >= k && w.startTime.slice(0, 10) <= wEnd).length,
      isDeload: ctx.facts.blocks.some((b) => b.isDeload && blockOverlapsWeek(b, k, wEnd)),
      isCurrent: k <= today && today <= wEnd
    }
  })
  const current = rows[rows.length - 1]
  const previous = rows.length > 1 ? rows[rows.length - 2] : null
  const prevStart = addDays(current.weekKey, -7)
  const comparison: VolumeComparison = current.isCurrent ? 'same-days' : 'full-week'
  const previousToDate = comparison === 'same-days' ? addDays(prevStart, diffDays(today, current.weekKey)) : weekEndOf(prevStart)
  const previousLoadKg = ctx.counted.filter((s) => s.date >= prevStart && s.date <= previousToDate).reduce((a, s) => a + setLoadKg(s), 0)
  const changePct = previousLoadKg > 0 ? (current.loadKg - previousLoadKg) / previousLoadKg : null
  return { weeks: rows, current, previous, comparison, previousLoadKg, previousToDate, changePct }
}
