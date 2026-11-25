// Handlers IPC de Entreno (se publican como `entreno:<nombre>`). Los de lectura son síncronos y
// leen de la base en memoria; los que escriben llaman al servicio dentro de una operación de la
// cola de escritura (`entreno:<nombre>`) y devuelven su promesa. Los servicios apuntan sus cambios
// en `audit_log` dentro de esa misma operación.
import type { MetricQuery, SummaryQuery } from '@shared/modules/entreno/metrics'
import { WeekStartSchema } from '@shared/modules/entreno/schemas'
import type {
  BaseWeekSlotInput,
  BlockInput,
  EntrenoRestoreResult,
  EntrenoSettings,
  ExerciseInput,
  GoalInput,
  GoalStatus,
  ISODate,
  KindRuleInput,
  ManualWorkoutInput,
  MuscleGroupInput,
  RoutineInput,
  TrainingEventInput,
  WeekPlan,
  WeekPlanMoveInput,
  WeekPlanSlotInput,
  WeekPlanSlotRef,
  WorkoutExtrasInput,
  WorkoutFilter
} from '@shared/modules/entreno/types'
import type { CoreContext } from '../../core/context'
import type { DialogProvider } from '../../core/handlers'
import * as blocks from './blocks'
import * as catalog from './catalog'
import * as exercises from './exercises'
import { exportEntrenoJson, restoreEntrenoFile, exportEntrenoXlsx, exportHevyCsv } from './exports'
import * as goals from './goals'
import { createMetricsService } from './metrics'
import { createHevyImporter } from './hevyImport'
import * as planning from './planning'
import { parseInput } from './repo'
import * as routines from './routines'
import * as workouts from './workouts'

/** Entreno no tiene datos del usuario (ninguna sesión). */
export function isEmpty(ctx: CoreContext): boolean {
  const db = ctx.db
  if (!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'trn_workouts'")) return true
  return !db.get('SELECT 1 AS x FROM trn_workouts LIMIT 1')
}

export function createEntrenoHandlers(ctx: CoreContext, dialogs: DialogProvider) {
  const importer = createHevyImporter(ctx, dialogs)
  const metrics = createMetricsService(ctx)
  const write = <T>(name: string, fn: () => T): Promise<T> => ctx.queue.enqueue(`entreno:${name}`, fn)
  return {
    // Sesiones
    'workouts.list': (filter: WorkoutFilter = {}) => workouts.listWorkouts(ctx.db, filter),
    'workouts.get': (id: number) => workouts.getWorkout(ctx.db, id),
    'workouts.updateExtras': (input: WorkoutExtrasInput) =>
      write('workouts.updateExtras', () => workouts.updateWorkoutExtras(ctx.db, input)),
    'workouts.saveManual': (input: ManualWorkoutInput) => write('workouts.saveManual', () => workouts.saveManualWorkout(ctx.db, input)),
    'workouts.delete': (id: number) => write('workouts.delete', () => workouts.deleteWorkout(ctx.db, id)),

    // Ejercicios
    'exercises.list': () => exercises.listExercises(ctx.db),
    'exercises.save': (input: ExerciseInput) => write('exercises.save', () => exercises.saveExercise(ctx.db, input)),
    'exercises.addAlias': (exerciseId: number, alias: string) =>
      write('exercises.addAlias', () => exercises.addAlias(ctx.db, exerciseId, alias)),
    'exercises.removeAlias': (aliasId: number) => write('exercises.removeAlias', () => exercises.removeAlias(ctx.db, aliasId)),
    'exercises.merge': (fromId: number, intoId: number) =>
      write('exercises.merge', () => exercises.mergeExercises(ctx.db, fromId, intoId)),

    // Grupos musculares
    'muscleGroups.list': () => catalog.listMuscleGroups(ctx.db),
    'muscleGroups.save': (input: MuscleGroupInput) => write('muscleGroups.save', () => catalog.saveMuscleGroup(ctx.db, input)),
    'muscleGroups.delete': (id: number) => write('muscleGroups.delete', () => catalog.deleteMuscleGroup(ctx.db, id)),

    // Reglas de tipo de sesión
    'kindRules.list': () => catalog.listKindRules(ctx.db),
    'kindRules.save': (input: KindRuleInput) => write('kindRules.save', () => catalog.saveKindRule(ctx.db, input)),
    'kindRules.delete': (id: number) => write('kindRules.delete', () => catalog.deleteKindRule(ctx.db, id)),
    'kindRules.reorder': (ids: number[]) => write('kindRules.reorder', () => catalog.reorderKindRules(ctx.db, ids)),
    'kindRules.reapply': () => write('kindRules.reapply', () => catalog.reapplyKindRules(ctx.db)),

    // Tipos de entreno
    'routines.list': () => routines.listRoutines(ctx.db),
    'routines.save': (input: RoutineInput) => write('routines.save', () => routines.saveRoutine(ctx.db, input)),
    'routines.delete': (id: number) => write('routines.delete', () => routines.deleteRoutine(ctx.db, id)),
    'routines.reorder': (ids: number[]) => write('routines.reorder', () => routines.reorderRoutines(ctx.db, ids)),
    'routines.reapply': () => write('routines.reapply', () => routines.reapplyRoutines(ctx.db)),

    // Semana base (boceto)
    'baseWeek.get': () => planning.getBaseWeek(ctx.db),
    'baseWeek.save': (slots: BaseWeekSlotInput[]) => write('baseWeek.save', () => planning.saveBaseWeek(ctx.db, slots, ctx.today())),

    // Semana concreta. `get` no escribe: si la semana ya ha empezado y está sin guardar, antes
    // encola el guardado automático (copia del boceto) y después la lee.
    'weekPlan.get': async (weekStart: ISODate): Promise<WeekPlan> => {
      const today = ctx.today()
      const ws = parseInput(WeekStartSchema, weekStart)
      if (planning.weeksPendingAutosave(ctx.db, today, ws).includes(ws))
        await write('weekPlan.autosave', () => planning.autosaveWeeks(ctx.db, ctx.today()))
      return planning.getWeekPlan(ctx.db, ws)
    },
    'weekPlan.save': (weekStart: ISODate, slots: WeekPlanSlotInput[]) =>
      write('weekPlan.save', () => planning.saveWeekPlan(ctx.db, weekStart, slots)),
    'weekPlan.move': (input: WeekPlanMoveInput) => write('weekPlan.move', () => planning.moveWeekSlot(ctx.db, input)),
    'weekPlan.remove': (ref: WeekPlanSlotRef) => write('weekPlan.remove', () => planning.removeWeekSlot(ctx.db, ref)),
    'weekPlan.resetToBase': (weekStart: ISODate) => write('weekPlan.resetToBase', () => planning.resetWeekToBase(ctx.db, weekStart)),

    // Bloques y eventos
    'blocks.list': () => blocks.listBlocks(ctx.db),
    'blocks.save': (input: BlockInput) => write('blocks.save', () => blocks.saveBlock(ctx.db, input)),
    'blocks.delete': (id: number) => write('blocks.delete', () => blocks.deleteBlock(ctx.db, id)),
    'events.list': () => blocks.listEvents(ctx.db),
    'events.save': (input: TrainingEventInput) => write('events.save', () => blocks.saveEvent(ctx.db, input)),
    'events.delete': (id: number) => write('events.delete', () => blocks.deleteEvent(ctx.db, id)),

    // Objetivos
    'goals.list': () => goals.listGoals(ctx.db),
    'goals.save': (input: GoalInput) => write('goals.save', () => goals.saveGoal(ctx.db, input)),
    'goals.setStatus': (id: number, status: GoalStatus) => write('goals.setStatus', () => goals.setGoalStatus(ctx.db, id, status)),
    'goals.delete': (id: number) => write('goals.delete', () => goals.deleteGoal(ctx.db, id)),

    // Métricas (solo leen; ver metrics.ts)
    'metrics.summary': (q?: SummaryQuery) => metrics.summary(q),
    'metrics.week': (date: ISODate) => metrics.week(date),
    'metrics.next': (date?: ISODate | null) => metrics.next(date),
    'metrics.records': (exerciseId?: number | null) => metrics.records(exerciseId),
    'metrics.workoutRecords': (workoutId: number) => metrics.workoutRecords(workoutId),
    'metrics.goals': () => metrics.goals(),
    'metrics.goal': (goalId: number) => metrics.goal(goalId),
    'metrics.hyrox': (eventId: number) => metrics.hyrox(eventId),
    'metrics.compute': (metricId: string, query: MetricQuery) => metrics.compute(metricId, query),
    'metrics.inicio': () => metrics.inicio(),

    // Ajustes e importaciones
    'settings.get': () => catalog.getSettings(ctx.db),
    'settings.save': (patch: Partial<EntrenoSettings>) => write('settings.save', () => catalog.saveSettings(ctx.db, patch)),
    'imports.list': () => catalog.listImports(ctx.db),

    // Importar Hevy: vista previa (no escribe), aplicar (una sola operación de la cola) y cancelar
    'import.preview': () => importer.preview(),
    'import.apply': (token: string) => importer.apply(token),
    'import.cancel': (token: string) => importer.cancel(token),

    // Exportar y restaurar
    'export.csv': async () => {
      const f = await dialogs.saveFile('Exportar entreno (CSV de Hevy)', `entreno-hevy-${ctx.today()}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
      if (!f) return null
      exportHevyCsv(ctx.db, f)
      dialogs.showItem(f)
      return f
    },
    'export.xlsx': async () => {
      const f = await dialogs.saveFile('Exportar entreno a Excel', `entreno-${ctx.today()}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }])
      if (!f) return null
      await exportEntrenoXlsx(ctx.db, f)
      dialogs.showItem(f)
      return f
    },
    'export.json': async () => {
      const f = await dialogs.saveFile('Exportar entreno (JSON)', `entreno-${ctx.today()}.json`, [{ name: 'JSON', extensions: ['json'] }])
      if (!f) return null
      exportEntrenoJson(ctx.db, f)
      dialogs.showItem(f)
      return f
    },
    // Solo acepta exportaciones de Entreno; copia previa y sustitución de los datos trn_ en una sola operación.
    'restore.json': async (): Promise<EntrenoRestoreResult | null> => {
      const f = await dialogs.openFile('Elige un JSON exportado de Entreno', [{ name: 'JSON', extensions: ['json'] }])
      if (!f) return null
      return restoreEntrenoFile(ctx, f)
    }
  }
}

export type EntrenoHandlers = ReturnType<typeof createEntrenoHandlers>
