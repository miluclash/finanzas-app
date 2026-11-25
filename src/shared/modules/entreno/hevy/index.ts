import type { HevyGrouping } from './group'
import { groupHevySessions } from './group'
import { parseHevyText, parseHevyTable, type HevyParseResult } from './parse'
import type { CsvRecord } from '../../../csv'

export * from './types'
export * from './dates'
export * from './key'
export * from './parse'
export * from './group'
export * from './kind'
export * from './format'

export interface HevyReadResult {
  fatal: string | null
  parse: HevyParseResult
  grouping: HevyGrouping
}

function finish(parse: HevyParseResult): HevyReadResult {
  return { fatal: parse.fatal, parse, grouping: groupHevySessions(parse) }
}

/** Texto CSV/TSV → sesiones agrupadas. */
export function readHevyText(text: string): HevyReadResult {
  return finish(parseHevyText(text))
}

/** Filas de texto de un XLSX (ver src/main/modules/entreno/hevyXlsx.ts) → sesiones agrupadas. */
export function readHevyRecords(records: CsvRecord[]): HevyReadResult {
  return finish(parseHevyTable(records, { allowDecimalComma: true }))
}
