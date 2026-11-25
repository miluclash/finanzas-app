// Récords personales: se calculan (no se guardan) recorriendo el historial en orden cronológico por
// ejercicio. De ahí salen a la vez los récords vigentes y la marca "Récord" de cada sesión, así que
// borrar, renombrar (alias) o unir ejercicios nunca deja récords huérfanos.
//
// Decisiones:
// - La primera sesión de un ejercicio NO se marca como récord (sería ruido: todo lo nuevo lo
//   sería), pero sus marcas sí aparecen como récords vigentes. Igual con "más reps con un peso":
//   la primera vez con un peso concreto no es récord; lo es cuando se superan las reps de una vez
//   anterior con ese mismo peso exacto (82,5 kg y 82,4 kg son pesos distintos).
// - Hay récord solo si se supera estrictamente la marca anterior; igualarla no cuenta.
// - Ejercicios de carga: peso máximo, mejor e1RM, más reps con un peso dado y mayor volumen en una
//   sesión. Ejercicios de peso corporal: más reps en una serie y más lastre (peso añadido).
// - Solo series que cuentan (sin calentamientos por defecto).
import { type CountedSet, type MetricsContext, isBodyweight, setE1rm, setLoadKg } from './context'
import type { ISODate } from './types'

export const RECORD_TYPES = ['peso-maximo', 'mejor-e1rm', 'volumen-sesion', 'reps-con-peso', 'reps-peso-corporal', 'lastre-maximo'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export const RECORD_NAMES: Record<RecordType, string> = {
  'peso-maximo': 'Peso máximo',
  'mejor-e1rm': 'Mejor e1RM',
  'reps-con-peso': 'Más repeticiones con este peso',
  'volumen-sesion': 'Mayor volumen en una sesión',
  'reps-peso-corporal': 'Más repeticiones',
  'lastre-maximo': 'Más lastre'
}

export interface RecordMark {
  exerciseId: number
  type: RecordType
  /** kg (peso, e1RM, volumen, lastre) o repeticiones (reps-con-peso, reps-peso-corporal). */
  value: number
  /** Peso exacto de un récord `reps-con-peso`; null en los demás. */
  weightKg: number | null
  workoutId: number
  date: ISODate
}

/** Récord batido en una sesión: la marca nueva y la que tenía antes. */
export interface RecordHit extends RecordMark {
  previous: number
}

export interface ExerciseRecords {
  exerciseId: number
  /** Récords vigentes. Los de `reps-con-peso` van uno por peso, de menor a mayor peso. */
  records: RecordMark[]
}

export interface WorkoutRecords {
  workoutId: number
  date: ISODate
  hits: RecordHit[]
}

export interface RecordsResult {
  /** Por ejercicio (orden de id). */
  current: ExerciseRecords[]
  /** Solo sesiones con algún récord, en orden cronológico. */
  byWorkout: WorkoutRecords[]
}

interface SessionMarks {
  single: Partial<Record<Exclude<RecordType, 'reps-con-peso'>, number>>
  repsAtWeight: Map<number, number>
}

function sessionMarks(sets: CountedSet[], ctx: MetricsContext): SessionMarks {
  const single: SessionMarks['single'] = {}
  const repsAtWeight = new Map<number, number>()
  const max = (k: keyof SessionMarks['single'], v: number | null) => {
    if (v == null || !(v > 0)) return
    if (single[k] === undefined || v > single[k]!) single[k] = v
  }
  let volume = 0
  for (const s of sets) {
    if (isBodyweight(s)) {
      max('reps-peso-corporal', s.reps)
      max('lastre-maximo', s.weightKg)
      continue
    }
    max('peso-maximo', s.weightKg)
    max('mejor-e1rm', setE1rm(s, ctx.settings))
    volume += setLoadKg(s)
    if (s.weightKg != null && s.weightKg > 0 && s.reps != null && s.reps > 0) {
      const prev = repsAtWeight.get(s.weightKg)
      if (prev === undefined || s.reps > prev) repsAtWeight.set(s.weightKg, s.reps)
    }
  }
  max('volumen-sesion', volume)
  return { single, repsAtWeight }
}

export function computeRecords(ctx: MetricsContext): RecordsResult {
  // Series por ejercicio y sesión, en orden cronológico (ctx.counted ya viene ordenado).
  const byExercise = new Map<number, Map<number, CountedSet[]>>()
  for (const s of ctx.counted) {
    let perWorkout = byExercise.get(s.exerciseId)
    if (!perWorkout) byExercise.set(s.exerciseId, (perWorkout = new Map()))
    const l = perWorkout.get(s.workoutId)
    if (l) l.push(s)
    else perWorkout.set(s.workoutId, [s])
  }

  const hitsByWorkout = new Map<number, RecordHit[]>()
  const current: ExerciseRecords[] = []
  for (const exerciseId of [...byExercise.keys()].sort((a, b) => a - b)) {
    const best = new Map<Exclude<RecordType, 'reps-con-peso'>, RecordMark>()
    const bestReps = new Map<number, RecordMark>()
    let first = true
    for (const [workoutId, sets] of byExercise.get(exerciseId)!) {
      const date = sets[0].date
      const marks = sessionMarks(sets, ctx)
      const hits: RecordHit[] = []
      for (const [type, value] of Object.entries(marks.single) as [Exclude<RecordType, 'reps-con-peso'>, number][]) {
        const prev = best.get(type)
        if (prev && value <= prev.value) continue
        const mark: RecordMark = { exerciseId, type, value, weightKg: null, workoutId, date }
        if (prev && !first) hits.push({ ...mark, previous: prev.value })
        best.set(type, mark)
      }
      for (const [weightKg, reps] of marks.repsAtWeight) {
        const prev = bestReps.get(weightKg)
        if (prev && reps <= prev.value) continue
        const mark: RecordMark = { exerciseId, type: 'reps-con-peso', value: reps, weightKg, workoutId, date }
        if (prev) hits.push({ ...mark, previous: prev.value })
        bestReps.set(weightKg, mark)
      }
      first = false
      if (hits.length) {
        hits.sort((a, b) => RECORD_TYPES.indexOf(a.type) - RECORD_TYPES.indexOf(b.type) || (a.weightKg ?? 0) - (b.weightKg ?? 0))
        hitsByWorkout.set(workoutId, [...(hitsByWorkout.get(workoutId) ?? []), ...hits])
      }
    }
    const records = [
      ...RECORD_TYPES.filter((t) => t !== 'reps-con-peso' && best.has(t)).map((t) => best.get(t as Exclude<RecordType, 'reps-con-peso'>)!),
      ...[...bestReps.values()].sort((a, b) => a.weightKg! - b.weightKg!)
    ]
    current.push({ exerciseId, records })
  }

  const byWorkout: WorkoutRecords[] = ctx.workouts
    .filter((w) => hitsByWorkout.has(w.id))
    .map((w) => ({ workoutId: w.id, date: w.startTime.slice(0, 10), hits: hitsByWorkout.get(w.id)! }))
  return { current, byWorkout }
}

/** Récords batidos en una sesión (vacío si ninguno). */
export function workoutRecordHits(result: RecordsResult, workoutId: number): RecordHit[] {
  return result.byWorkout.find((w) => w.workoutId === workoutId)?.hits ?? []
}

/** Últimos récords batidos, del más reciente al más antiguo. */
export function recentRecords(result: RecordsResult, limit = 5): RecordHit[] {
  const all: RecordHit[] = []
  for (let i = result.byWorkout.length - 1; i >= 0 && all.length < limit; i--) all.push(...result.byWorkout[i].hits)
  return all.slice(0, limit)
}
