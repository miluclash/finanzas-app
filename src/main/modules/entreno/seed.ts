// Semilla de Entreno: los ajustes de métricas por defecto (docs/EVOLUCION.md §6).
//
// La llama el núcleo en cada arranque, después de migrar (`entreno:semilla`). Solo añade las
// claves que faltan (INSERT OR IGNORE): no pisa lo que Michael haya cambiado, no escribe nada si
// ya están todas (abrir una base al día no toca el archivo) y, si una versión futura añade un
// ajuste nuevo, lo rellena en las bases existentes.
//
// Los grupos musculares y las reglas de tipo iniciales van en la migración 2005: así se crean una
// sola vez por base (también al restaurar una copia de antes de Entreno, que migra pero no siembra)
// y no reaparecen si Michael los borra.
import { REVIEW_DEFAULTS } from '@shared/modules/entreno/metrics/review'
import type { EntrenoSettings } from '@shared/modules/entreno/types'
import type { Db } from '../../core/db'

export const DEFAULT_SETTINGS: EntrenoSettings = {
  e1rmFormula: 'EPLEY',
  e1rmMinReps: 1,
  e1rmMaxReps: 12,
  countedSetTypes: ['normal', 'dropset', 'failure'],
  weekStartsOn: 1,
  secondaryMuscleFactor: 0.5,
  trendWeeks: 6,
  timeZone: 'Europe/Madrid',
  // Umbrales de la revisión semanal (los mismos valores que REVIEW_DEFAULTS).
  reviewStallWeeks: REVIEW_DEFAULTS.stallWeeks,
  reviewStallMinSessions: REVIEW_DEFAULTS.stallMinSessions,
  reviewAdherenceMin: REVIEW_DEFAULTS.adherenceMin,
  reviewMuscleWeeks: REVIEW_DEFAULTS.muscleWeeks,
  reviewHyroxStationWeeks: REVIEW_DEFAULTS.hyroxStationWeeks
}

/** Añade los ajustes por defecto que falten. Idempotente. */
export function seedEntreno(db: Db): void {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.run('INSERT OR IGNORE INTO trn_settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
  }
}
