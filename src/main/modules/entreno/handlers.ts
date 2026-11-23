// Handlers IPC de Entreno (se publican como `entreno:<nombre>`). Los de lectura son síncronos y
// leen de la base en memoria; los que escriben llaman al servicio dentro de una operación de la
// cola de escritura (`entreno:<nombre>`) y devuelven su promesa. Los servicios apuntan sus cambios
// en `audit_log` dentro de esa misma operación.
import type {
  EntrenoSettings,
  ExerciseInput,
  KindRuleInput,
  ManualWorkoutInput,
  MuscleGroupInput,
  WorkoutExtrasInput,
  WorkoutFilter
} from '@shared/modules/entreno/types'
import type { CoreContext } from '../../core/context'
import * as catalog from './catalog'
import * as exercises from './exercises'
import * as workouts from './workouts'

/** Entreno no tiene datos del usuario (ninguna sesión). */
export function isEmpty(ctx: CoreContext): boolean {
  const db = ctx.db
  if (!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'trn_workouts'")) return true
  return !db.get('SELECT 1 AS x FROM trn_workouts LIMIT 1')
}

export function createEntrenoHandlers(ctx: CoreContext) {
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

    // Ajustes e importaciones
    'settings.get': () => catalog.getSettings(ctx.db),
    'settings.save': (patch: Partial<EntrenoSettings>) => write('settings.save', () => catalog.saveSettings(ctx.db, patch)),
    'imports.list': () => catalog.listImports(ctx.db)
  }
}

export type EntrenoHandlers = ReturnType<typeof createEntrenoHandlers>
