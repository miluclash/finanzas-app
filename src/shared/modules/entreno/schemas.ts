// Esquemas de entrada de Entreno (validados en el proceso principal; la interfaz puede reutilizarlos).
// Las mismas reglas están también en SQL (CHECK, UNIQUE, FOREIGN KEY).
import { z } from 'zod'
import { isISODate } from '../../dates'
import { isHyroxStation, type HyroxStation } from './hyrox'
import { isMonday } from './plan'
import {
  E1RM_FORMULAS,
  EXERCISE_CATEGORIES,
  GOAL_STATUSES,
  GOAL_TYPES,
  IMPORT_FORMATS,
  KIND_RULE_FIELDS,
  MEASURE_TYPES,
  SET_TYPES,
  WORKOUT_KINDS,
  WORKOUT_SOURCES
} from './types'

const LOCAL_DT_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d$/

/** ISO local `YYYY-MM-DDTHH:mm` con fecha y hora válidas. */
export function isLocalDateTime(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = LOCAL_DT_RE.exec(v)
  return !!m && isISODate(m[1])
}

const localDateTime = z.string().refine(isLocalDateTime, 'Fecha y hora no válidas')
const optText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null))
const name = z.string().trim().min(1, 'Obligatorio').max(200)
const id = z.number().int().positive()
const optId = id.nullable().optional().transform((v) => v ?? null)
const nonNegInt = z.number().int('Tiene que ser un número entero').min(0, 'No puede ser negativo')
const optNonNegInt = nonNegInt.nullable().optional().transform((v) => v ?? null)
const optNonNeg = z.number().min(0, 'No puede ser negativo').nullable().optional().transform((v) => v ?? null)
const optNumber = z.number().nullable().optional().transform((v) => v ?? null)
const rpe = z.number().min(1, 'El RPE va de 1 a 10').max(10, 'El RPE va de 1 a 10')
export const HyroxStationSchema = z.custom<HyroxStation>(isHyroxStation, 'Estación HYROX no válida')
const effort = z.number().int().min(1, 'El esfuerzo va de 1 a 10').max(10, 'El esfuerzo va de 1 a 10')

export const WorkoutFilterInput = z
  .object({
    kind: z.enum(WORKOUT_KINDS).nullable().optional(),
    from: z.string().refine(isISODate, 'Fecha no válida').nullable().optional(),
    to: z.string().refine(isISODate, 'Fecha no válida').nullable().optional(),
    search: optText,
    source: z.enum(WORKOUT_SOURCES).nullable().optional(),
    limit: z.number().int().positive().max(100000).nullable().optional(),
    offset: z.number().int().min(0).nullable().optional()
  })

export const WorkoutExtrasSchema = z.object({
  id,
  kind: z.enum(WORKOUT_KINDS).nullable().optional(),
  perceivedEffort: effort.nullable().optional(),
  notes: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null)),
  blockId: id.nullable().optional(),
  routineId: id.nullable().optional()
})

const ManualSetSchema = z.object({
  setType: z.enum(SET_TYPES).default('normal'),
  weightKg: optNumber,
  reps: optNonNegInt,
  distanceKm: optNonNeg,
  durationSeconds: optNonNegInt,
  rpe: rpe.nullable().optional().transform((v) => v ?? null),
  notes: optText
})

const ManualExerciseSchema = z.object({
  exerciseId: id,
  supersetId: optText,
  exerciseNotes: optText,
  sets: z.array(ManualSetSchema).min(1, 'Cada ejercicio necesita al menos una serie')
})

export const ManualWorkoutSchema = z
  .object({
    id: optId,
    title: name,
    startTime: localDateTime,
    endTime: localDateTime.nullable().optional().transform((v) => v ?? null),
    description: optText,
    kind: z.enum(WORKOUT_KINDS).nullable().optional().transform((v) => v ?? null),
    perceivedEffort: effort.nullable().optional().transform((v) => v ?? null),
    notes: optText,
    blockId: optId,
    routineId: optId,
    exercises: z.array(ManualExerciseSchema)
  })
  .refine((w) => w.endTime === null || w.endTime >= w.startTime, {
    message: 'La hora de fin no puede ser anterior a la de inicio',
    path: ['endTime']
  })

export const ExerciseSchema = z
  .object({
    id: optId,
    title: name,
    category: z.enum(EXERCISE_CATEGORIES).nullable().optional().transform((v) => v ?? null),
    measure: z.enum(MEASURE_TYPES).default('WEIGHT_REPS'),
    isBodyweight: z.boolean().default(false),
    active: z.boolean().default(true),
    notes: optText,
    primaryGroupId: optId,
    secondaryGroupIds: z.array(id).default([]),
    // Sin `.transform`: sin poner (undefined) y null significan cosas distintas al editar.
    hyroxStation: HyroxStationSchema.nullable().optional()
  })
  .refine((e) => e.primaryGroupId === null || !e.secondaryGroupIds.includes(e.primaryGroupId), {
    message: 'Un grupo muscular no puede ser principal y secundario a la vez',
    path: ['secondaryGroupIds']
  })

export const AliasSchema = z.string().trim().min(1, 'El alias no puede estar vacío').max(200)

export const MuscleGroupSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, 'Ponle un nombre al grupo muscular').max(100),
  sortOrder: z.number().int().optional(),
  active: z.boolean().default(true),
  weeklySetsMin: z.number().int('Las series son un número entero').min(0, 'No puede ser negativo').max(200).optional(),
  weeklySetsMax: z.number().int('Las series son un número entero').min(0, 'No puede ser negativo').max(200).optional()
}).refine((g) => g.weeklySetsMin === undefined || g.weeklySetsMax === undefined || g.weeklySetsMin <= g.weeklySetsMax, {
  message: 'El mínimo de series semanales no puede ser mayor que el máximo',
  path: ['weeklySetsMin']
})

export const KindRuleSchema = z.object({
  id: optId,
  field: z.enum(KIND_RULE_FIELDS),
  contains: z.string().trim().min(1, 'Escribe el texto que tiene que contener').max(200),
  kind: z.enum(WORKOUT_KINDS),
  priority: z.number().int().optional(),
  active: z.boolean().default(true)
})

export const SettingsSchema = z
  .object({
    e1rmFormula: z.enum(E1RM_FORMULAS),
    e1rmMinReps: z.number().int().min(1).max(100),
    e1rmMaxReps: z.number().int().min(1).max(100),
    countedSetTypes: z.array(z.enum(SET_TYPES)).min(1, 'Tiene que contar al menos un tipo de serie'),
    // Fijo: las semanas van siempre de lunes a domingo (decisión de Michael, F4).
    weekStartsOn: z.number().refine((v) => v === 1, 'La semana empieza siempre en lunes: no se puede cambiar.'),
    secondaryMuscleFactor: z.number().min(0).max(1),
    trendWeeks: z.number().int().min(1).max(104),
    timeZone: z.string().trim().min(1)
  })
  .strict()

export const SettingsPatchSchema = SettingsSchema.partial()

const HevySetSchema = z.object({
  exerciseTitle: z.string().trim().min(1, 'Falta el nombre del ejercicio'),
  exerciseOrder: nonNegInt,
  supersetId: z.string().nullable(),
  exerciseNotes: z.string().nullable(),
  setIndex: nonNegInt,
  setType: z.enum(SET_TYPES),
  weightKg: z.number().nullable(),
  reps: nonNegInt.nullable(),
  distanceKm: z.number().min(0).nullable(),
  durationSeconds: nonNegInt.nullable(),
  rpe: rpe.nullable()
})

export const HevyWorkoutSchema = z.object({
  hevyKey: z.string().min(1),
  title: z.string().min(1),
  startTime: localDateTime,
  endTime: localDateTime.nullable(),
  description: z.string().nullable(),
  sets: z.array(HevySetSchema)
})

export const ApplyHevySchema = z.object({
  meta: z.object({
    fileName: z.string().min(1),
    fileHash: z.string().min(1),
    format: z.enum(IMPORT_FORMATS),
    rowsTotal: nonNegInt,
    rowsError: nonNegInt,
    workoutsDuplicate: nonNegInt
  }),
  newWorkouts: z.array(HevyWorkoutSchema),
  changedWorkouts: z.array(HevyWorkoutSchema),
  kinds: z.record(z.string(), z.enum(WORKOUT_KINDS)).optional()
})

// ---------- Planificación, bloques, eventos y objetivos (F4) ----------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const isoDate = z.string().refine(isISODate, 'Fecha no válida')
const optTime = z
  .string()
  .regex(TIME_RE, 'La hora tiene que ser HH:mm (de 00:00 a 23:59)')
  .nullable()
  .optional()
  .transform((v) => v ?? null)
const posNumber = z.number().positive('Tiene que ser mayor que cero')

/** Lunes de una semana (las semanas del plan van de lunes a domingo). */
export const WeekStartSchema = z.string().refine(isMonday, 'La semana tiene que empezar en lunes (fecha YYYY-MM-DD)')

const RoutineItemSchema = z
  .object({
    exerciseId: id,
    targetSets: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
    repsMin: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
    repsMax: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
    targetRpe: rpe.nullable().optional().transform((v) => v ?? null),
    notes: optText
  })
  .refine((i) => i.repsMin === null || i.repsMax === null || i.repsMin <= i.repsMax, {
    message: 'El mínimo de repeticiones no puede ser mayor que el máximo',
    path: ['repsMin']
  })

export const RoutineSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, 'Ponle un nombre al tipo de entreno').max(100),
  kind: z.enum(WORKOUT_KINDS),
  description: optText,
  active: z.boolean().default(true),
  aliases: z.array(z.string().trim().min(1, 'El alias no puede estar vacío').max(200)).optional(),
  items: z.array(RoutineItemSchema).optional()
})

export const BaseWeekSlotsSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(1, 'El día va de 1 (lunes) a 7 (domingo)').max(7, 'El día va de 1 (lunes) a 7 (domingo)'),
      routineId: id,
      time: optTime
    })
  )
  .max(70, 'Demasiadas sesiones en la semana')

export const WeekPlanSlotsSchema = z
  .array(z.object({ date: isoDate, routineId: id, time: optTime, note: optText }))
  .max(70, 'Demasiadas sesiones en la semana')

export const WeekPlanSlotRefSchema = z.object({ date: isoDate, order: nonNegInt })

export const WeekPlanMoveSchema = z.object({
  from: WeekPlanSlotRefSchema,
  to: z.object({ date: isoDate, order: nonNegInt.nullable().optional().transform((v) => v ?? null) })
})

const plannedCount = z.number().int('Tiene que ser un número entero').min(0, 'No puede ser negativo').max(50)

export const BlockSchema = z
  .object({
    id: optId,
    name: z.string().trim().min(1, 'Ponle un nombre al bloque').max(200),
    startDate: isoDate,
    endDate: isoDate.nullable().optional().transform((v) => v ?? null),
    mainGoal: optText,
    plannedGym: plannedCount.default(4),
    plannedSwim: plannedCount.default(2),
    plannedHyrox: plannedCount.default(0),
    plannedRun: plannedCount.default(0),
    plannedOther: plannedCount.default(0),
    notes: optText,
    eventId: optId,
    isDeload: z.boolean().default(false)
  })
  .refine((b) => b.endDate === null || b.endDate >= b.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate']
  })

export const TrainingEventSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, 'Ponle un nombre al evento').max(200),
  date: isoDate,
  notes: optText
})

export const GoalStatusSchema = z.enum(GOAL_STATUSES)

export const GoalSchema = z
  .object({
    id: optId,
    name: z.string().trim().min(1, 'Ponle un nombre al objetivo').max(200),
    type: z.enum(GOAL_TYPES),
    targetValue: posNumber.nullable().optional().transform((v) => v ?? null),
    targetReps: z.number().int('Las repeticiones son un número entero').positive('Tiene que ser mayor que cero').nullable().optional().transform((v) => v ?? null),
    deadline: isoDate.nullable().optional().transform((v) => v ?? null),
    exerciseId: optId,
    groupId: optId,
    eventId: optId,
    kind: z.enum(WORKOUT_KINDS).nullable().optional().transform((v) => v ?? null),
    status: GoalStatusSchema.default('ACTIVE'),
    notes: optText
  })
  .superRefine((g, ctx) => {
    const need = (ok: boolean, message: string, path: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message, path: [path] })
    }
    switch (g.type) {
      case 'E1RM':
        need(g.exerciseId !== null, 'Elige el ejercicio del objetivo de e1RM', 'exerciseId')
        need(g.targetValue !== null, 'Pon el e1RM que quieres alcanzar (kg)', 'targetValue')
        break
      case 'WEIGHT_REPS':
        need(g.exerciseId !== null, 'Elige el ejercicio del objetivo de peso × repeticiones', 'exerciseId')
        need(g.targetValue !== null, 'Pon el peso que quieres mover (kg)', 'targetValue')
        need(g.targetReps !== null, 'Pon las repeticiones que quieres hacer con ese peso', 'targetReps')
        break
      case 'WEEKLY_VOLUME':
        need((g.groupId !== null) !== (g.exerciseId !== null), 'Elige un grupo muscular o un ejercicio (uno de los dos)', 'groupId')
        need(g.targetValue !== null, 'Pon el volumen semanal que quieres alcanzar', 'targetValue')
        break
      case 'FREQUENCY':
        need((g.kind !== null) !== (g.groupId !== null), 'Elige un tipo de sesión o un grupo muscular (uno de los dos)', 'kind')
        need(g.targetValue !== null, 'Pon cuántas veces por semana', 'targetValue')
        break
      case 'EVENT':
        need(g.eventId !== null, 'Elige el evento del objetivo', 'eventId')
        break
    }
  })

/** Primer mensaje de error de una validación, en español. */
export function firstError(e: unknown): string {
  if (e instanceof z.ZodError) {
    const i = e.issues[0]
    return i ? `${i.message}${i.path.length ? ` (${i.path.join('.')})` : ''}` : 'Datos no válidos'
  }
  return e instanceof Error ? e.message : String(e)
}
