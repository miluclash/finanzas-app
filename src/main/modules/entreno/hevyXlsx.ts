/**
 * Lectura de un .xlsx de Hevy con ExcelJS → registros de texto (misma forma que el lector CSV).
 * Vive en main porque ExcelJS no es apta para src/shared (renderer). La lógica de validación
 * está en src/shared/modules/entreno/hevy.
 */
import ExcelJS from 'exceljs'
import type { CsvRecord } from '../../../shared/csv'
import { dateToIsoLocal, formatHevyDate } from '../../../shared/modules/entreno/hevy/dates'

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  // ExcelJS entrega las fechas como Date con los campos UTC = lo que muestra la celda.
  if (v instanceof Date) return formatHevyDate(dateToIsoLocal(v, true))
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join('')
    }
    if ('result' in o) return cellText(o.result as ExcelJS.CellValue)
    if ('text' in o && typeof o.text === 'string') return o.text
  }
  return ''
}

/** Primera hoja del libro. `line` = número de fila de Excel (base 1). */
export async function readXlsxRecords(data: ArrayBuffer | Uint8Array): Promise<CsvRecord[]> {
  const wb = new ExcelJS.Workbook()
  const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(new Uint8Array(data))
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const cols = ws.columnCount
  const records: CsvRecord[] = []
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const fields: string[] = []
    for (let c = 1; c <= cols; c++) fields.push(cellText(row.getCell(c).value))
    if (fields.every((f) => f === '')) return
    records.push({ line: n, fields })
  })
  return records
}
