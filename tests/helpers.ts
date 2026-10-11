import { Db } from '../src/main/db/db'
import { AppState } from '../src/main/services/state'

/** App en memoria (sin archivo) con la fecha de hoy fijada. */
export async function memoryApp(today = '2026-10-11'): Promise<AppState> {
  const db = await Db.open(null)
  const s = AppState.init(db, { dbPath: null, backupsDir: null })
  s.todayOverride = today
  return s
}
