/** Formateo inverso: sesiones y series → filas Hevy (14 columnas) y CSV con la forma del original. */
import { writeCsv, type CsvWriteOptions } from '../../../csv'
import { formatHevyDate } from './dates'
import { HEVY_COLUMNS, type HevySessionData } from './types'

const nn = (n: number | null): string => (n === null ? '' : String(n))

/**
 * Cabecera + filas. Sesiones de la más nueva a la más antigua (empate: orden de entrada);
 * dentro de cada sesión, por exercise_order y set_index.
 */
export function formatHevyRows(sessions: HevySessionData[]): string[][] {
  const sorted = sessions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.startTime < b.s.startTime ? 1 : a.s.startTime > b.s.startTime ? -1 : a.i - b.i))
    .map((x) => x.s)
  const out: string[][] = [[...HEVY_COLUMNS]]
  for (const s of sorted) {
    const sets = [...s.sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex)
    for (const x of sets) {
      out.push([
        s.title,
        formatHevyDate(s.startTime),
        s.endTime ? formatHevyDate(s.endTime) : '',
        s.description ?? '',
        x.exerciseTitle,
        x.supersetId ?? '',
        x.exerciseNotes ?? '',
        String(x.setIndex),
        x.setType,
        nn(x.weightKg),
        nn(x.reps),
        nn(x.distanceKm),
        nn(x.durationSeconds),
        nn(x.rpe)
      ])
    }
  }
  return out
}

/** Columnas numéricas de Hevy: sin comillas (y sin nada si son null). El resto, siempre entre comillas. */
const UNQUOTED = new Set(['superset_id', 'set_index', 'weight_kg', 'reps', 'distance_km', 'duration_seconds', 'rpe'])

/**
 * Tabla de texto (cabecera + filas) → CSV con el estilo real de Hevy: cabecera y columnas de texto
 * entre comillas (también vacías), numéricas sin comillas, comas, CRLF y sin salto de línea final.
 */
export function hevyTableToCsv(table: string[][], opts: CsvWriteOptions = {}): string {
  return writeCsv(table, {
    trailingEol: false,
    quote: (_v, col, row) => row === 0 || !UNQUOTED.has(HEVY_COLUMNS[col]),
    ...opts
  })
}

export function formatHevyCsv(sessions: HevySessionData[], opts: CsvWriteOptions = {}): string {
  return hevyTableToCsv(formatHevyRows(sessions), opts)
}
