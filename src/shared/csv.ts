/**
 * Lector y escritor CSV/TSV genérico (RFC 4180). Puro: sin Node ni Electron.
 * - Comillas dobles, comillas dobladas, saltos de línea dentro de comillas.
 * - Fin de línea CRLF, LF o CR suelto. BOM opcional.
 * - Cada registro lleva la línea física donde empieza (base 1), para dar errores con su línea.
 */

export type CsvDelimiter = ',' | ';' | '\t'

export interface CsvRecord {
  /** Línea física (base 1) donde empieza el registro. */
  line: number
  fields: string[]
}

export interface CsvReadResult {
  delimiter: CsvDelimiter
  records: CsvRecord[]
  /** Comilla sin cerrar: línea donde se abrió. Los registros anteriores son válidos. */
  unterminatedQuoteLine: number | null
}

const CANDIDATES: CsvDelimiter[] = [',', ';', '\t']

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Detecta el separador contando candidatos fuera de comillas en el primer registro. Empate: coma. */
export function detectDelimiter(text: string): CsvDelimiter {
  const src = stripBom(text)
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break
      if (ch in counts) counts[ch]++
    }
  }
  let best: CsvDelimiter = ','
  for (const c of CANDIDATES) if (counts[c] > counts[best]) best = c
  return best
}

export function readCsv(text: string, delimiter?: CsvDelimiter): CsvReadResult {
  const src = stripBom(text)
  const delim = delimiter ?? detectDelimiter(src)
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let quoteOpenLine = 0
  let line = 1
  let recordLine = 1
  let touched = false // el registro actual tiene algún contenido o separador

  const endField = (): void => {
    fields.push(field)
    field = ''
  }
  const endRecord = (): void => {
    endField()
    const blank = fields.length === 1 && fields[0] === '' && !touched
    if (!blank) records.push({ line: recordLine, fields })
    fields = []
    touched = false
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      quoteOpenLine = line
      touched = true
    } else if (ch === delim) {
      endField()
      touched = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      field += ch
      touched = true
    }
  }
  if (inQuotes) {
    return { delimiter: delim, records, unterminatedQuoteLine: quoteOpenLine }
  }
  if (touched || field !== '' || fields.length > 0) endRecord()
  return { delimiter: delim, records, unterminatedQuoteLine: null }
}

export interface CsvWriteOptions {
  delimiter?: CsvDelimiter
  /** Por defecto CRLF. */
  eol?: '\r\n' | '\n'
  /** Por defecto true: todos los campos entre comillas (como Hevy). */
  quoteAll?: boolean
  /** Por defecto true: el último registro también termina en fin de línea. */
  trailingEol?: boolean
  /** Decide si un campo va entre comillas (fila 0 = cabecera). Sustituye a quoteAll; los campos con comillas, separador o saltos de línea siempre se entrecomillan. */
  quote?: (value: string, col: number, row: number) => boolean
}

export function writeCsv(rows: string[][], opts: CsvWriteOptions = {}): string {
  const delim = opts.delimiter ?? ','
  const eol = opts.eol ?? '\r\n'
  const quoteAll = opts.quoteAll ?? true
  const trailing = opts.trailingEol ?? true
  const enc = (v: string, col: number, row: number): string => {
    const needs = (opts.quote ? opts.quote(v, col, row) : quoteAll) || /["\r\n]/.test(v) || v.includes(delim)
    return needs ? `"${v.replace(/"/g, '""')}"` : v
  }
  const out = rows.map((r, ri) => r.map((v, ci) => enc(v, ci, ri)).join(delim)).join(eol)
  return rows.length > 0 && trailing ? out + eol : out
}
