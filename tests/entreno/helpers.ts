// Ayudas para los tests de Entreno: una app con el registro completo (finanzas + entreno) y una
// forma corta de escribir por la cola.
import { createAppHandlers, createAppRegistry, type Handlers } from '../../src/main/app'
import { createCoreContext, initCore, type CoreContext, type CorePaths } from '../../src/main/core/context'
import { Db } from '../../src/main/core/db'
import type { DialogProvider } from '../../src/main/core/handlers'
import type { HevySetInput, HevyWorkoutInput } from '../../src/shared/modules/entreno/types'

export const noDialogs: DialogProvider = {
  openFile: async () => null,
  saveFile: async () => null,
  openDir: async () => null,
  showItem: () => undefined,
  openPath: () => undefined
}

export interface EntrenoApp {
  ctx: CoreContext
  db: Db
  h: Handlers
}

/** App con todos los módulos, migrada y sembrada. Sin archivo salvo que se pase `paths`. */
export async function entrenoApp(paths: CorePaths = { dbPath: null, backupsDir: null }, dialogs: DialogProvider = noDialogs): Promise<EntrenoApp> {
  const ctx = createCoreContext(await Db.open(paths.dbPath), paths, createAppRegistry())
  initCore(ctx)
  return { ctx, get db() { return ctx.db }, h: createAppHandlers(ctx, dialogs, '0.0.0') }
}

/** Ejecuta `fn` como una operación de la cola (síncrona, con la cola libre). */
export function escribir<T>(ctx: CoreContext, fn: () => T): T {
  return ctx.queue.runNow('test:escribir', fn)
}

export function serie(exerciseTitle: string, exerciseOrder: number, setIndex: number, extra: Partial<HevySetInput> = {}): HevySetInput {
  return {
    exerciseTitle,
    exerciseOrder,
    supersetId: null,
    exerciseNotes: null,
    setIndex,
    setType: 'normal',
    weightKg: 60,
    reps: 8,
    distanceKm: null,
    durationSeconds: null,
    rpe: null,
    ...extra
  }
}

export function sesion(title: string, startTime: string, sets: HevySetInput[], extra: Partial<HevyWorkoutInput> = {}): HevyWorkoutInput {
  return { hevyKey: `${title}|${startTime}`, title, startTime, endTime: null, description: null, sets, ...extra }
}

export const META = {
  fileName: 'hevy-ficticio.csv',
  fileHash: 'abc123',
  format: 'CSV' as const,
  rowsTotal: 0,
  rowsError: 0,
  workoutsDuplicate: 0
}
