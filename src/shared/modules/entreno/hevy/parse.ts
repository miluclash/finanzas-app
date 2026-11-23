/**
 * Lectura de exportaciones de Hevy: texto CSV/TSV o filas ya leídas (XLSX) → filas validadas.
 * Los mensajes de error nunca incluyen el contenido de la celda (pueden acabar en un log).
 */
import { readCsv, type CsvDelimiter, type CsvRecord } from '../../../csv'
import { parseHevyDate } from './dates'
import { hevyKey } from './key'
import {
  HEVY_COLUMNS,
  SET_TYPES,
  type HevyColumn,
  type HevyRow,
  type HevySetType,
  type RowError
} from './types'

/** Una fila leída: la fila válida o sus errores, y la sesión a la que pertenece si se pudo identificar. */
export interface ParsedItem {
  line: number
  row: HevyRow | null
  errors: RowError[]
  /** hevy_key de la sesión si título y fecha de inicio eran legibles. */
  sessionKey: string | null
}

export interface HevyParseResult {
  /** Error que impide leer el archivo entero (cabecera, comillas sin cerrar, vacío). */
  fatal: string | null
  warnings: string[]
  delimiter: CsvDelimiter | null
  items: ParsedItem[]
}

export interface ParseTableOptions {
  /** Acepta `82,5` como decimal. Por defecto false (con separador coma sería ambiguo). */
  allowDecimalComma?: boolean
}

type NumKind = 'int' | 'dec'

/** Devuelve el número, null si está vacío, o undefined si no es válido. */
export function parseNumberCell(text: string, kind: NumKind, allowComma: boolean): number | null | undefined {
  const s = text.trim()
  if (s === '') return null
  const re = allowComma ? /^-?\d+(?:[.,]\d+)?$/ : /^-?\d+(?:\.\d+)?$/
  if (!re.test(s)) return undefined
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return undefined
  if (kind === 'int' && !Number.isInteger(n)) return undefined
  return n
}

export function parseHevyText(text: string): HevyParseResult {
  if (text.trim() === '') {
    return { fatal: 'El archivo está vacío.', warnings: [], delimiter: null, items: [] }
  }
  const csv = readCsv(text)
  if (csv.unterminatedQuoteLine !== null) {
    return {
      fatal: `Hay una comilla sin cerrar que empieza en la línea ${csv.unterminatedQuoteLine}.`,
      warnings: [],
      delimiter: csv.delimiter,
      items: []
    }
  }
  const res = parseHevyTable(csv.records, { allowDecimalComma: csv.delimiter !== ',' })
  return { ...res, delimiter: csv.delimiter }
}

/** Primer registro = cabecera. Sirve también para las filas que salen de un XLSX. */
export function parseHevyTable(records: CsvRecord[], opts: ParseTableOptions = {}): HevyParseResult {
  const allowComma = opts.allowDecimalComma ?? false
  const warnings: string[] = []
  if (records.length === 0) {
    return { fatal: 'El archivo está vacío.', warnings, delimiter: null, items: [] }
  }
  const header = records[0].fields.map((h) => h.replace(/^﻿/, '').trim().toLowerCase())
  const seen = new Set<string>()
  for (const h of header) {
    if (seen.has(h) && h !== '') {
      return { fatal: `La cabecera repite la columna "${h}".`, warnings, delimiter: null, items: [] }
    }
    seen.add(h)
  }
  const missing = HEVY_COLUMNS.filter((c) => !seen.has(c))
  if (missing.length > 0) {
    return {
      fatal: `Faltan columnas en la cabecera: ${missing.join(', ')}. No parece una exportación de Hevy.`,
      warnings,
      delimiter: null,
      items: []
    }
  }
  const extras = header.filter((h) => h !== '' && !(HEVY_COLUMNS as readonly string[]).includes(h))
  if (extras.length > 0) warnings.push(`Columnas no reconocidas que se ignoran: ${extras.join(', ')}.`)

  const idx = {} as Record<HevyColumn, number>
  for (const c of HEVY_COLUMNS) idx[c] = header.indexOf(c)

  const items: ParsedItem[] = []
  for (const rec of records.slice(1)) {
    items.push(parseRecord(rec, idx, allowComma))
  }
  return { fatal: null, warnings, delimiter: null, items }
}

function parseRecord(rec: CsvRecord, idx: Record<HevyColumn, number>, allowComma: boolean): ParsedItem {
  const line = rec.line
  const errors: RowError[] = []
  const get = (c: HevyColumn): string => rec.fields[idx[c]] ?? ''
  const err = (column: HevyColumn | null, message: string): void => {
    errors.push({ line, column, message })
  }

  if (rec.fields.length < Math.max(...Object.values(idx)) + 1) {
    err(null, `fila incompleta en la línea ${line}: faltan columnas`)
  }

  // Sesión
  const title = get('title')
  if (title.trim() === '') err('title', `título vacío en title, línea ${line}`)
  const startRaw = get('start_time')
  const start = parseHevyDate(startRaw)
  if (start === null) err('start_time', `fecha ilegible en start_time, línea ${line}`)
  const endRaw = get('end_time')
  let end: string | null = null
  if (endRaw.trim() !== '') {
    end = parseHevyDate(endRaw)
    if (end === null) err('end_time', `fecha ilegible en end_time, línea ${line}`)
  }
  if (start !== null && end !== null && end < start) {
    err('end_time', `end_time anterior a start_time, línea ${line}`)
  }
  const sessionKey = title.trim() !== '' && start !== null ? hevyKey(title, start) : null

  // Serie
  const exerciseTitle = get('exercise_title')
  if (exerciseTitle.trim() === '') err('exercise_title', `ejercicio vacío en exercise_title, línea ${line}`)

  const setType = get('set_type').trim().toLowerCase()
  if (!(SET_TYPES as readonly string[]).includes(setType)) {
    err('set_type', `tipo de serie desconocido en set_type, línea ${line}`)
  }

  // weight_kg puede ser negativo (ejercicios asistidos); el resto no.
  const num = (c: HevyColumn, kind: NumKind): number | null => {
    const v = parseNumberCell(get(c), kind, allowComma)
    if (v === undefined) {
      err(c, `número no válido en ${c}, línea ${line}`)
      return null
    }
    if (v !== null && v < 0 && c !== 'weight_kg') {
      err(c, `valor negativo en ${c}, línea ${line}`)
      return null
    }
    return v
  }
  const setIndex = num('set_index', 'int')
  if (setIndex === null && get('set_index').trim() === '') err('set_index', `set_index vacío, línea ${line}`)
  const weightKg = num('weight_kg', 'dec')
  const reps = num('reps', 'int')
  const distanceKm = num('distance_km', 'dec')
  const durationSeconds = num('duration_seconds', 'int')
  const rpe = num('rpe', 'dec')
  if (rpe !== null && (rpe < 1 || rpe > 10)) err('rpe', `rpe fuera de 1 a 10 en rpe, línea ${line}`)

  const sup = get('superset_id').trim()
  const nonEmpty = (s: string): string | null => (s === '' ? null : s)

  if (errors.length > 0 || start === null) {
    return { line, row: null, errors, sessionKey }
  }
  const row: HevyRow = {
    line,
    title,
    startTime: start,
    endTime: end,
    description: nonEmpty(get('description')),
    exerciseTitle,
    supersetId: nonEmpty(sup),
    exerciseNotes: nonEmpty(get('exercise_notes')),
    setIndex: setIndex as number,
    setType: setType as HevySetType,
    weightKg,
    reps,
    distanceKm,
    durationSeconds,
    rpe
  }
  return { line, row, errors: [], sessionKey }
}
