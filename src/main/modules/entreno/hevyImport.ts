// Importador de Hevy contra la base: vista previa (solo lee) y aplicar (una sola operación de la
// cola). La lógica de lectura, validación, agrupado y firmas es pura y vive en
// src/shared/modules/entreno/hevy; aquí solo se junta con la base, el sistema de archivos y los diálogos.
//
// Seguridad: ningún mensaje ni auditoría lleva contenido del archivo (solo recuentos y líneas).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createBackup } from '../../core/backup'
import type { CoreContext } from '../../core/context'
import { UserError } from '../../core/errors'
import type { DialogProvider } from '../../core/handlers'
import { deduceKind } from '@shared/modules/entreno/hevy/kind'
import { readHevyRecords, readHevyText, sessionSignature, type HevyReadResult, type HevySession } from '@shared/modules/entreno/hevy'
import { formatHevyDate } from '@shared/modules/entreno/hevy/dates'
import type {
  HevyImportError,
  HevyImportPreview,
  HevyImportResult,
  HevyWorkoutBrief,
  HevyWorkoutInput,
  ImportFormat,
  StoredHevyWorkout,
  WorkoutKind
} from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'
import { applyHevyWorkouts, loadHevyWorkouts } from './hevyApply'
import { readXlsxRecords } from './hevyXlsx'
import { audit, findExerciseByName, kindRules } from './repo'

/** Los tokens de vista previa caducan a los 30 minutos. */
export const TOKEN_TTL_MS = 30 * 60 * 1000

interface ReadFile {
  format: ImportFormat
  hash: string
  read: HevyReadResult
}

/** Lee un archivo de Hevy (CSV, TSV o XLSX, detectado por el contenido). Lanza UserError si no sirve. */
export async function readHevyFile(file: string): Promise<ReadFile> {
  let buf: Buffer
  try {
    buf = fs.readFileSync(file)
  } catch {
    throw new UserError('No se puede leer el archivo (¿lo has movido o está abierto en otro programa?).')
  }
  const hash = crypto.createHash('sha256').update(buf).digest('hex')
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b
  let format: ImportFormat
  let read: HevyReadResult
  if (isZip) {
    format = 'XLSX'
    let records
    try {
      records = await readXlsxRecords(buf)
    } catch {
      throw new UserError('No se puede leer el Excel: no parece un archivo .xlsx válido.')
    }
    read = readHevyRecords(records)
  } else {
    read = readHevyText(buf.toString('utf8'))
    format = read.parse.delimiter === '\t' ? 'TSV' : 'CSV'
  }
  if (read.fatal) throw new UserError(read.fatal)
  return { format, hash, read }
}

type Status = 'new' | 'changed' | 'duplicate'

interface Analysis {
  newWorkouts: HevySession[]
  changedWorkouts: HevySession[]
  duplicateCount: number
  withErrors: HevySession[]
  stored: Map<string, StoredHevyWorkout>
}

/** Compara las sesiones del archivo con las guardadas (por `hevy_key` y firma). Solo lee. */
export function analyze(db: Db, read: HevyReadResult): Analysis {
  const sessions = read.grouping.sessions
  const ok = sessions.filter((s) => !s.hasErrors)
  const stored = loadHevyWorkouts(db, ok.map((s) => s.hevyKey))
  const out: Analysis = { newWorkouts: [], changedWorkouts: [], duplicateCount: 0, withErrors: sessions.filter((s) => s.hasErrors), stored }
  for (const s of ok) {
    const st = stored.get(s.hevyKey)
    const status: Status = !st ? 'new' : sessionSignature(st) === s.signature ? 'duplicate' : 'changed'
    if (status === 'new') out.newWorkouts.push(s)
    else if (status === 'changed') out.changedWorkouts.push(s)
    else out.duplicateCount++
  }
  return out
}

function toInput(s: HevySession): HevyWorkoutInput {
  return { hevyKey: s.hevyKey, title: s.title, startTime: s.startTime, endTime: s.endTime, description: s.description, sets: s.sets }
}

function brief(s: HevySession, stored: StoredHevyWorkout | undefined, rules: ReturnType<typeof kindRules>): HevyWorkoutBrief {
  const kind: WorkoutKind = stored?.kindManual ? stored.kind : deduceKind(s, rules)
  return {
    hevyKey: s.hevyKey,
    title: s.title,
    startTime: s.startTime,
    kind,
    exerciseCount: new Set(s.sets.map((x) => x.exerciseOrder)).size,
    setCount: s.sets.length
  }
}

function newExerciseTitles(db: Db, sessions: HevySession[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of sessions)
    for (const x of s.sets) {
      const k = x.exerciseTitle.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      if (!findExerciseByName(db, x.exerciseTitle)) out.push(x.exerciseTitle)
    }
  return out
}

function errorsOf(read: HevyReadResult): HevyImportError[] {
  return read.grouping.errors.map((e) => ({ line: e.line, column: e.column, message: e.message }))
}

interface Pending {
  token: string
  file: string
  fileName: string
  hash: string
  createdAt: number
}

export function createHevyImporter(ctx: CoreContext, dialogs: DialogProvider) {
  /** Solo hay una importación pendiente a la vez. */
  let pending: Pending | null = null

  const take = (token: string): Pending => {
    if (!pending || pending.token !== token) throw new UserError('La vista previa ya no es válida: vuelve a elegir el archivo.')
    if (Date.now() - pending.createdAt > TOKEN_TTL_MS) {
      pending = null
      throw new UserError('La vista previa ha caducado: vuelve a elegir el archivo.')
    }
    return pending
  }

  async function preview(): Promise<HevyImportPreview | null> {
    const file = await dialogs.openFile('Elige el archivo exportado de Hevy', [
      { name: 'Exportación de Hevy', extensions: ['csv', 'tsv', 'xlsx'] }
    ])
    if (!file) return null
    return previewFile(file)
  }

  async function previewFile(file: string): Promise<HevyImportPreview> {
    const { format, hash, read } = await readHevyFile(file)
    const db = ctx.db
    const a = analyze(db, read)
    const rules = kindRules(db)
    const warnings = [...read.grouping.warnings]
    if (a.withErrors.length > 0)
      warnings.push(
        `${a.withErrors.length} ${a.withErrors.length === 1 ? 'sesión tiene' : 'sesiones tienen'} filas con error y no se importará${a.withErrors.length === 1 ? '' : 'n'}.`
      )
    // Misma hora que una sesión guardada con otro título: probablemente renombrada en Hevy.
    for (const s of a.newWorkouts) {
      const clash = db.get<{ x: number }>(
        "SELECT 1 AS x FROM trn_workouts WHERE source = 'HEVY' AND start_time = ? AND hevy_key <> ?",
        [s.startTime, s.hevyKey]
      )
      if (clash)
        warnings.push(
          `La sesión del ${formatHevyDate(s.startTime)} tiene la misma hora que una sesión que ya tienes con otro título: ¿la renombraste en Hevy? Se importará como una sesión nueva.`
        )
    }
    const alreadyImported = !!db.get('SELECT 1 AS x FROM trn_imports WHERE file_hash = ?', [hash])
    if (alreadyImported) warnings.push('Este mismo archivo ya se importó antes.')

    const token = crypto.randomUUID()
    pending = { token, file, fileName: path.basename(file), hash, createdAt: Date.now() }
    return {
      token,
      fileName: path.basename(file),
      format,
      rowsTotal: read.grouping.rowCount,
      rowsValid: read.grouping.validRowCount,
      newWorkouts: a.newWorkouts.map((s) => brief(s, undefined, rules)),
      changedWorkouts: a.changedWorkouts.map((s) => brief(s, a.stored.get(s.hevyKey), rules)),
      duplicateCount: a.duplicateCount,
      sessionsWithErrors: a.withErrors.length,
      errors: errorsOf(read),
      newExercises: newExerciseTitles(db, [...a.newWorkouts, ...a.changedWorkouts]),
      warnings,
      alreadyImported
    }
  }

  async function apply(token: string): Promise<HevyImportResult> {
    const p = take(token)
    let current: ReadFile | null = null
    let backup: string | null = null
    return await ctx.queue.enqueue(
      'entreno:import.apply',
      () => {
        const { read, format, hash } = current!
        // Se recalcula contra la base tal como está ahora, dentro de la operación.
        const a = analyze(ctx.db, read)
        const rowsError = new Set(read.grouping.errors.map((e) => e.line)).size
        const res = applyHevyWorkouts(ctx.db, {
          meta: {
            fileName: p.fileName,
            fileHash: hash,
            format,
            rowsTotal: read.grouping.rowCount,
            rowsError,
            workoutsDuplicate: a.duplicateCount
          },
          newWorkouts: a.newWorkouts.map(toInput),
          changedWorkouts: a.changedWorkouts.map(toInput)
        })
        const result: HevyImportResult = {
          importId: res.importId,
          workoutsNew: res.workoutsNew,
          workoutsChanged: res.workoutsChanged,
          workoutsDuplicate: res.workoutsDuplicate,
          sessionsWithErrors: a.withErrors.length,
          rowsError,
          exercisesNew: res.exercisesNew,
          setsWritten: res.setsWritten,
          backup
        }
        audit(
          ctx.db,
          'trn_imports',
          res.importId,
          'import',
          `Importación de Hevy: ${res.workoutsNew} nuevas, ${res.workoutsChanged} cambiadas, ${res.workoutsDuplicate} duplicadas, ${rowsError} filas con error`,
          null,
          { workoutsNew: res.workoutsNew, workoutsChanged: res.workoutsChanged, workoutsDuplicate: res.workoutsDuplicate, rowsError, exercisesNew: res.exercisesNew, setsWritten: res.setsWritten, format }
        )
        pending = null
        return result
      },
      {
        // En su turno y fuera de la transacción: comprobar el archivo y, si hay carpeta, la copia.
        before: async () => {
          const again = await readHevyFile(p.file)
          if (again.hash !== p.hash) {
            pending = null
            throw new UserError('El archivo ha cambiado desde la vista previa: vuelve a elegirlo.')
          }
          current = again
          backup = ctx.paths.backupsDir ? createBackup(ctx, 'antes-de-importar').path : null
        }
      }
    )
  }

  function cancel(token: string): void {
    if (pending && pending.token === token) pending = null
  }

  return { preview, previewFile, apply, cancel }
}
