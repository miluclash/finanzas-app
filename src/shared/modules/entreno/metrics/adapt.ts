// Adaptador de los hechos que lee el proceso principal (`EntrenoFacts`, de `facts.ts`) a la entrada
// de las métricas (`MetricsFacts`). Es el único sitio donde se juntan los dos juegos de tipos.
import type { EntrenoFacts as DbFacts } from '../types'
import type { BlockFact, MetricsFacts } from './types'

export function toMetricsFacts(f: DbFacts): MetricsFacts {
  return {
    workouts: f.workouts,
    sets: f.sets,
    exercises: f.exercises,
    groups: f.muscleGroups,
    routines: f.routines,
    blocks: f.blocks.map(
      (b): BlockFact => ({
        id: b.id,
        name: b.name,
        startDate: b.startDate,
        endDate: b.endDate,
        eventId: b.eventId,
        isDeload: b.isDeload,
        plannedByKind: { GYM: b.plannedGym, SWIM: b.plannedSwim, HYROX: b.plannedHyrox, RUN: b.plannedRun, OTHER: b.plannedOther }
      })
    ),
    events: f.events,
    goals: f.goals,
    savedWeeks: f.savedWeeks,
    baseWeek: f.baseWeek,
    baseFirstSavedOn: f.baseFirstSavedOn
  }
}
