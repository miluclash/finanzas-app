// Exportaciones de Entreno (CSV con forma Hevy, Excel, JSON completo) y restauración desde el JSON.
// Solo toca tablas `trn_`: ninguna tabla de finanzas.
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import { z } from 'zod'
import { hevyTableToCsv } from '@shared/modules/entreno/hevy/format'
import { HEVY_VIEW_COLUMNS, type EntrenoRestoreResult, type HevyViewRow } from '@shared/modules/entreno/types'
import { createBackup } from '../../core/backup'
import type { CoreContext } from '../../core/context'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { MIGRATION_RANGES, schemaVersion } from '../../core/migrations'
import { proposeHyroxStations } from './migrations'
import { audit } from './repo'

/** Marca del JSON de Entreno (el de finanzas lleva `finanzas-app`). */
export const ENTRENO_JSON_APP = 'finanzas-entreno'
export const ENTRENO_JSON_FORMAT = 1

/** Tablas de Entreno en orden de inserción (los padres primero); para borrar, al revés. */
export const TRN_TABLES = [
  'trn_imports',
  'trn_muscle_groups',
  'trn_exercises',
  'trn_exercise_muscles',
  'trn_exercise_aliases',
  'trn_events',
  'trn_blocks',
  'trn_routines',
  'trn_routine_items',
  'trn_routine_aliases',
  'trn_goals',
  'trn_workouts',
  'trn_sets',
  'trn_settings',
  'trn_kind_rules',
  'trn_base_week',
  'trn_base_week_meta',
  'trn_week_plan_weeks',
  'trn_week_plan'
] as const

type TrnTable = (typeof TRN_TABLES)[number]

/**
 * Tablas que llegaron con la migración 2006 (F4). Un JSON exportado antes no las trae: al
 * restaurarlo quedan vacías.
 */
const TABLES_SINCE_2006: ReadonlySet<TrnTable> = new Set([
  'trn_routine_aliases',
  'trn_base_week',
  'trn_base_week_meta',
  'trn_week_plan_weeks',
  'trn_week_plan'
])

type Cell = string | number | null

function rawTable(db: Db, t: string): Record<string, Cell>[] {
  return db.all<Record<string, Cell>>(`SELECT * FROM ${t} ORDER BY rowid`)
}

// ---------- CSV de Hevy ----------

const cell = (v: string | number | null): string => (v === null || v === undefined ? '' : String(v))

/** Filas de `trn_v_hevy` como tabla de texto (con cabecera). */
export function hevyViewTable(db: Db): string[][] {
  const rows = db.all<HevyViewRow>('SELECT * FROM trn_v_hevy')
  return [[...HEVY_VIEW_COLUMNS], ...rows.map((r) => HEVY_VIEW_COLUMNS.map((c) => cell(r[c])))]
}

export function exportHevyCsv(db: Db, file: string): string {
  fs.writeFileSync(file, hevyTableToCsv(hevyViewTable(db)), 'utf8')
  return file
}

// ---------- Excel ----------

export async function exportEntrenoXlsx(db: Db, file: string): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const sheet = (name: string, cols: string[], rows: Cell[][]): void => {
    const ws = wb.addWorksheet(name)
    ws.addRow(cols).font = { bold: true }
    for (const r of rows) ws.addRow(r)
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const view = db.all<HevyViewRow>('SELECT * FROM trn_v_hevy')
  sheet('Hevy', [...HEVY_VIEW_COLUMNS], view.map((r) => HEVY_VIEW_COLUMNS.map((c) => r[c])))
  for (const t of TRN_TABLES) {
    const rows = rawTable(db, t)
    const cols = db.all<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name)
    sheet(t, cols, rows.map((r) => cols.map((c) => r[c] ?? null)))
  }
  await wb.xlsx.writeFile(file)
  return file
}

// ---------- JSON ----------

export function exportJsonObject(db: Db) {
  const tables: Record<string, Record<string, Cell>[]> = {}
  for (const t of TRN_TABLES) tables[t] = rawTable(db, t)
  return {
    app: ENTRENO_JSON_APP,
    format: ENTRENO_JSON_FORMAT,
    schemaVersion: schemaVersion(db, MIGRATION_RANGES.entreno),
    exportedAt: new Date().toISOString(),
    tables
  }
}

export function exportEntrenoJson(db: Db, file: string): string {
  fs.writeFileSync(file, JSON.stringify(exportJsonObject(db), null, 2), 'utf8')
  return file
}

const CellSchema = z.union([z.string(), z.number().finite(), z.null()])
const RowSchema = z.record(z.string(), CellSchema)
const RestoreSchema = z.object({
  app: z.literal(ENTRENO_JSON_APP),
  format: z.literal(ENTRENO_JSON_FORMAT),
  schemaVersion: z.number().int().nonnegative(),
  exportedAt: z.string().optional(),
  tables: z.object(
    Object.fromEntries(TRN_TABLES.map((t) => [t, TABLES_SINCE_2006.has(t) ? z.array(RowSchema).default([]) : z.array(RowSchema)])) as Record<
      TrnTable,
      z.ZodArray<typeof RowSchema>
    >
  )
})

type RestoreData = z.infer<typeof RestoreSchema>

/** Valida el JSON de Entreno contra el esquema y la base actual. Lanza UserError si no sirve; no escribe. */
export function validateEntrenoJson(db: Db, obj: unknown): RestoreData {
  if ((obj as { app?: unknown } | null)?.app !== ENTRENO_JSON_APP) throw new UserError('Este archivo no es una exportación de Entreno.')
  const parsed = RestoreSchema.safeParse(obj)
  if (!parsed.success) throw new UserError('El JSON de Entreno no es válido o está incompleto.')
  const o = parsed.data
  const current = schemaVersion(db, MIGRATION_RANGES.entreno)
  if (o.schemaVersion > current) throw new UserError('Ese JSON es de una versión más nueva de la app. Actualiza la app e inténtalo otra vez.')
  const columns = new Map<string, Set<string>>()
  for (const t of TRN_TABLES) columns.set(t, new Set(db.all<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name)))
  for (const t of TRN_TABLES)
    for (const r of o.tables[t])
      for (const k of Object.keys(r)) if (!columns.get(t)!.has(k)) throw new UserError(`El JSON tiene una columna desconocida en ${t}.`)
  return o
}

/** Sustituye todos los datos `trn_` por los del JSON ya validado. Dentro de una operación de la cola. */
function writeEntrenoData(db: Db, o: RestoreData): void {
  try {
    db.tx(() => {
      for (const t of [...TRN_TABLES].reverse()) db.run(`DELETE FROM ${t}`)
      for (const t of TRN_TABLES)
        for (const r of o.tables[t]) {
          const cols = Object.keys(r)
          if (cols.length === 0) continue
          db.run(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => r[c]))
        }
      // Un JSON de antes de la 2006 no trae la estación HYROX: se propone como hizo la migración.
      if (o.schemaVersion < 2006) proposeHyroxStations(db)
      const counts = Object.fromEntries(TRN_TABLES.map((t) => [t, o.tables[t].length]))
      audit(db, 'entreno', 'all', 'restore', 'Entreno restaurado desde un JSON', null, counts)
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/FOREIGN KEY|CHECK constraint|UNIQUE constraint|NOT NULL constraint/.test(msg))
      throw new UserError('El archivo tiene datos que no cuadran entre sí (referencias rotas o valores no válidos). No se ha cambiado nada.')
    throw e
  }
}

/**
 * Gancho `restoreJson` del módulo (lo llama `core:backup.restore`). Devuelve `false` si el JSON no
 * es de Entreno y no toca nada. Dentro de una operación de la cola.
 */
export function restoreEntrenoJson(ctx: CoreContext, obj: unknown): boolean {
  if ((obj as { app?: unknown } | null)?.app !== ENTRENO_JSON_APP) return false
  writeEntrenoData(ctx.db, validateEntrenoJson(ctx.db, obj))
  return true
}

/**
 * `entreno:restore.json`: lee el archivo, rechaza todo lo que no sea una exportación de Entreno
 * (sin copia ni escritura) y, si vale, hace la copia `antes-de-restaurar` y sustituye los datos
 * `trn_` en una sola operación. No puede tocar finanzas.
 */
export function restoreEntrenoFile(ctx: CoreContext, file: string): Promise<EntrenoRestoreResult> {
  return ctx.queue.enqueueTask('entreno:restore.json', async ({ runOp }) => {
    let obj: unknown
    try {
      obj = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      throw new UserError('Este archivo no es una exportación de Entreno.')
    }
    const data = validateEntrenoJson(ctx.db, obj)
    const safetyBackup = ctx.paths.backupsDir ? createBackup(ctx, 'antes-de-restaurar').path : null
    runOp('entreno:restore.json', () => writeEntrenoData(ctx.db, data))
    return { safetyBackup }
  })
}
