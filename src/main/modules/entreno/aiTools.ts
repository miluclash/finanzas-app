// Herramientas de Entreno para la IA local (F6).
//
// Lectura: semana, próxima sesión («¿qué me toca?»), resumen, objetivos, récords, listas para
// resolver nombres (ejercicios, grupos, rutinas, eventos, sesiones) y la revisión semanal. Todo sale
// del servicio de métricas en caché (`metricsServiceFor`) y de los listados de siempre, recortado.
//
// Acciones (solo proponen): sesiones manuales y sus datos extra, objetivos (guardar y estado),
// eventos, plan de la semana (guardar, mover, quitar) y rutinas (guardar). `plan` valida con el MISMO
// esquema que el servicio y `apply` llama a la MISMA función que el handler dentro de una operación de
// la cola con su misma etiqueta (`entreno:<handler>`). Fuera: fusionar ejercicios, reglas, ajustes e
// importaciones.
import { z } from 'zod'
import type { AiChange, AiFieldDiff } from '@shared/core/ai-types'
import { formatDate, isISODate } from '@shared/dates'
import { RECORD_NAMES } from '@shared/modules/entreno/metrics'
import { mondayOf } from '@shared/modules/entreno/plan'
import {
  GoalSchema,
  ManualWorkoutSchema,
  RoutineSchema,
  TrainingEventSchema,
  WeekPlanSlotsSchema,
  WorkoutExtrasSchema,
  isLocalDateTime
} from '@shared/modules/entreno/schemas'
import {
  GOAL_STATUSES,
  GOAL_TYPES,
  SET_TYPES,
  WORKOUT_KINDS,
  type Exercise,
  type Goal,
  type GoalInput,
  type GoalStatus,
  type ManualWorkoutInput,
  type MuscleGroup,
  type Routine,
  type RoutineInput,
  type TrainingEvent,
  type TrainingEventInput,
  type WeekPlan,
  type WeekPlanMoveInput,
  type WeekPlanSlotInput,
  type WeekPlanSlotRef,
  type WorkoutDetail,
  type WorkoutExtrasInput,
  type WorkoutKind
} from '@shared/modules/entreno/types'
import type { CoreContext } from '../../core/context'
import type { Db } from '../../core/db'
import { UserError } from '../../core/errors'
import { actionTool, fecha, fingerprintOf, limited, norm, params, pct, readTool, resolveByName } from '../../core/ai/toolkit'
import type { AiToolDef } from '../../core/registry'
import * as blocks from './blocks'
import * as catalog from './catalog'
import * as exercises from './exercises'
import * as goals from './goals'
import { metricsServiceFor } from './metrics'
import * as planning from './planning'
import * as routines from './routines'
import { entrenoSuggestions } from './suggestions'
import * as workouts from './workouts'

const isoDate = z.string().refine(isISODate, 'Fecha no válida (AAAA-MM-DD)')
const localDateTime = z.string().refine(isLocalDateTime, 'Fecha y hora no válidas (AAAA-MM-DDTHH:mm)')
const ref = z.union([z.string().trim().min(1), z.number()])
const NoArgs = z.object({}).strict()
const DateArgs = z.object({ fecha: isoDate.optional() }).strict()

const KIND_LABEL: Record<WorkoutKind, string> = { GYM: 'Gimnasio', SWIM: 'Natación', HYROX: 'HYROX', RUN: 'Carrera', OTHER: 'Otro' }
const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { ACTIVE: 'Activo', ACHIEVED: 'Conseguido', ABANDONED: 'Abandonado' }
const GOAL_TYPE_LABEL: Record<Goal['type'], string> = {
  E1RM: 'e1RM',
  WEIGHT_REPS: 'Peso × repeticiones',
  WEEKLY_VOLUME: 'Volumen semanal',
  FREQUENCY: 'Frecuencia',
  EVENT: 'Evento'
}
const WEEKDAYS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

// ---------------------------------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------------------------------

function round(n: number | null | undefined, digits = 1): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

const exercise = (db: Db, q: string | number): Exercise => resolveByName(exercises.listExercises(db), q, (e) => e.id, (e) => e.title, 'el ejercicio')
const routine = (db: Db, q: string | number): Routine => resolveByName(routines.listRoutines(db), q, (r) => r.id, (r) => r.name, 'el tipo de entreno')
const group = (db: Db, q: string | number): MuscleGroup => resolveByName(catalog.listMuscleGroups(db), q, (g) => g.id, (g) => g.name, 'el grupo muscular')
const event = (db: Db, q: string | number): TrainingEvent => resolveByName(blocks.listEvents(db), q, (e) => e.id, (e) => e.name, 'el evento')

function goalById(db: Db, id: number): Goal {
  const g = goals.listGoals(db).find((x) => x.id === id)
  if (!g) throw new UserError(`El objetivo ${id} no existe.`)
  return g
}

function workoutOrNull(db: Db, id: number): WorkoutDetail | null {
  try {
    return workouts.getWorkout(db, id)
  } catch {
    return null
  }
}

/**
 * Escribe como el handler: una operación de la cola con la misma etiqueta y la misma función. Antes,
 * en el mismo turno, `guard` comprueba que el registro sigue como al proponer el cambio.
 */
function write<T>(ctx: CoreContext, guard: () => void, name: string, fn: (db: Db) => T): Promise<T> {
  return ctx.queue.enqueue(`entreno:${name}`, () => {
    guard()
    return fn(ctx.db)
  })
}

function parseOrThrow<T>(schema: z.ZodType<T>, v: unknown, what: string): T {
  const r = schema.safeParse(v)
  if (!r.success) {
    const i = r.error.issues[0]
    throw new UserError(i ? `${i.message}${i.path.length ? ` (${i.path.join('.')})` : ''}` : `${what} no válido.`)
  }
  return r.data
}

/** Diferencias campo a campo (solo los que cambian; al crear, todos los que tienen valor). */
function diff<T>(before: T | null, after: T, rows: Array<[string, (x: T) => string | null]>): AiFieldDiff[] {
  const out: AiFieldDiff[] = []
  for (const [label, get] of rows) {
    const b = before ? get(before) : null
    const a = get(after)
    if (before && a === b) continue
    if (a === null && b === null) continue
    out.push({ label, before: b, after: a })
  }
  return out
}

const dt = (v: string | null | undefined) => (v ? `${formatDate(v.slice(0, 10))} ${v.slice(11, 16)}` : null)
const numText = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? null : `${String(v).replace('.', ',')}${unit}`)

/** Plan de una semana sin lo que cambia al guardarse solo (para la huella y para mostrarlo). */
function slotsOf(plan: WeekPlan) {
  return plan.slots.map((s) => ({ date: s.date, order: s.order, routineId: s.routineId, time: s.time, note: s.note }))
}

/** Una sesión del plan en texto: «jueves Torso A (18:00) · nota». */
const slotText = (weekday: number, name: string, time: string | null | undefined, note: string | null | undefined) =>
  `${WEEKDAYS[weekday]} ${name}${time ? ` (${time})` : ''}${note ? ` · ${note}` : ''}`

function weekText(plan: WeekPlan): string | null {
  if (!plan.slots.length) return null
  return plan.slots.map((s) => slotText(s.weekday, s.routineName, s.time, s.note)).join(', ')
}

const weekFingerprint = (db: Db, weekStart: string) => fingerprintOf(slotsOf(planning.getWeekPlan(db, weekStart)))

/** Hueco de un día por rutina (o el único del día). Devuelve su posición dentro del día. */
function findSlot(db: Db, date: string, rutina: string | number | undefined): { ref: WeekPlanSlotRef; name: string } {
  const plan = planning.getWeekPlan(db, mondayOf(date))
  const day = plan.slots.filter((s) => s.date === date)
  if (!day.length) throw new UserError(`No hay ninguna sesión prevista el ${formatDate(date)}.`)
  let idx = 0
  if (rutina !== undefined) {
    const q = norm(String(rutina))
    idx = day.findIndex((s) => String(s.routineId) === String(rutina) || norm(s.routineName) === q)
    if (idx < 0) idx = day.findIndex((s) => norm(s.routineName).includes(q))
    if (idx < 0) throw new UserError(`El ${formatDate(date)} no hay ninguna sesión de «${rutina}». Hay: ${day.map((s) => s.routineName).join(', ')}.`)
  } else if (day.length > 1) throw new UserError(`El ${formatDate(date)} hay varias sesiones (${day.map((s) => s.routineName).join(', ')}): indica cuál.`)
  return { ref: { date, order: idx }, name: day[idx].routineName }
}

// ---------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------

const readTools: AiToolDef[] = [
  readTool<CoreContext, z.infer<typeof DateArgs>>({
    name: 'entreno_semana',
    label: 'Consultando la semana de entreno',
    description:
      'Semana de entreno (de lunes a domingo) que contiene una fecha (por defecto hoy): cada día con su estado (hecha, hoy, planificada, descanso, sin-hacer), las sesiones previstas y las hechas, y la próxima sesión.',
    parameters: params({ fecha: { type: 'string', description: 'AAAA-MM-DD (opcional).' } }),
    args: DateArgs,
    run: (ctx, a) => {
      const w = metricsServiceFor(ctx).week(a.fecha ?? ctx.today())
      return {
        desde: w.weekStart,
        hasta: w.weekEnd,
        plan: w.source,
        dias: w.days.map((d) => ({
          fecha: d.date,
          dia: WEEKDAYS[d.weekday],
          estado: d.status,
          previstas: d.slots.map((s) => ({ rutina: s.routineName, tipo: s.kind ? KIND_LABEL[s.kind] : null, hora: s.time, hecha: s.doneWorkoutId != null })),
          hechas: d.workouts.map((x) => ({ id: x.id, titulo: x.title ?? null, tipo: KIND_LABEL[x.kind], hora: x.startTime.slice(11, 16) }))
        })),
        proxima: w.next ? { fecha: w.next.date, rutina: w.next.routineName, hora: w.next.time, esHoy: w.next.isToday } : null
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof DateArgs>>({
    name: 'entreno_proxima_sesion',
    label: 'Mirando qué te toca',
    description: 'Responde a «¿qué me toca?»: la próxima sesión prevista sin hacer desde una fecha (por defecto hoy), con su tipo de entreno y sus ejercicios previstos.',
    parameters: params({ fecha: { type: 'string', description: 'AAAA-MM-DD (opcional).' } }),
    args: DateArgs,
    run: (ctx, a) => {
      const n = metricsServiceFor(ctx).next(a.fecha ?? ctx.today())
      if (!n) return { proxima: null, motivo: 'No hay nada planificado en las próximas semanas.' }
      const r = routines.listRoutines(ctx.db).find((x) => x.id === n.routineId)
      const names = new Map(exercises.listExercises(ctx.db).map((e) => [e.id, e.title]))
      return {
        proxima: {
          fecha: n.date,
          dia: WEEKDAYS[new Date(`${n.date}T12:00:00Z`).getUTCDay() || 7],
          esHoy: n.isToday,
          rutina: n.routineName,
          tipo: n.kind ? KIND_LABEL[n.kind] : null,
          hora: n.time,
          ejercicios: (r?.items ?? []).slice(0, 20).map((i) => ({
            ejercicio: names.get(i.exerciseId) ?? i.exerciseId,
            series: i.targetSets,
            reps: i.repsMin && i.repsMax && i.repsMin !== i.repsMax ? `${i.repsMin}-${i.repsMax}` : (i.repsMin ?? i.repsMax),
            rpe: i.targetRpe
          }))
        }
      }
    }
  }),

  readTool<CoreContext, { periodo?: 'week' | 'month' | 'block'; fecha?: string }>({
    name: 'entreno_resumen',
    label: 'Consultando el resumen de entreno',
    description:
      'Resumen de entreno de una semana, un mes o un bloque (por defecto la semana de hoy): adherencia al plan, volumen, totales, series por grupo muscular, objetivos, HYROX, récords y sesiones recientes.',
    parameters: params({
      periodo: { type: 'string', enum: ['week', 'month', 'block'] },
      fecha: { type: 'string', description: 'AAAA-MM-DD que elige el periodo (opcional).' }
    }),
    args: z.object({ periodo: z.enum(['week', 'month', 'block']).optional(), fecha: isoDate.optional() }).strict(),
    run: (ctx, a) => {
      const s = metricsServiceFor(ctx).summary({ period: a.periodo, date: a.fecha ?? null })
      return {
        periodo: s.range.period,
        desde: s.range.from,
        hasta: s.range.to,
        bloque: s.range.blockName,
        adherencia: { previstas: s.adherence.planned, hechas: s.adherence.done, pct: pct(s.adherence.pct) },
        totales: { sesiones: s.totals.sessions, series: s.totals.sets, cargaKg: round(s.totals.loadKg, 0), minutos: s.totals.minutes },
        volumenSemanal: {
          semana: s.volume.current.weekKey,
          cargaKg: round(s.volume.current.loadKg, 0),
          anteriorKg: round(s.volume.previousLoadKg, 0),
          comparacion: s.volume.comparison,
          cambio: pct(s.volume.changePct)
        },
        seriesPorGrupo: s.muscleSets.groups.slice(0, 20).map((g) => ({ grupo: g.name, series: round(g.sets), rango: `${g.min}-${g.max}`, estado: g.status })),
        objetivos: s.goals.slice(0, 15).map((g) => ({ nombre: g.name, progreso: pct(g.pct), conseguido: g.achieved })),
        hyrox: s.hyrox
          ? { evento: s.hyrox.event.name, fecha: s.hyrox.event.date, diasQueFaltan: s.hyrox.countdown.daysLeft, fase: s.hyrox.currentPhase?.name ?? null }
          : null,
        recordsRecientes: s.recentRecords.slice(0, 10).map((r) => ({ ejercicio: r.exerciseTitle, record: RECORD_NAMES[r.type], valor: round(r.value, 2), antes: round(r.previous, 2), fecha: r.date })),
        sesionesRecientes: s.recentWorkouts.slice(0, 10).map((w) => ({
          id: w.workoutId,
          titulo: w.title,
          inicio: w.startTime,
          tipo: KIND_LABEL[w.kind],
          minutos: w.minutes,
          series: w.sets,
          cargaKg: round(w.loadKg, 0),
          records: w.records.length
        }))
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'entreno_objetivos',
    label: 'Consultando los objetivos de entreno',
    description: 'Objetivos de entreno con su progreso: valor actual, mejor marca, porcentaje, proyección por tendencia y cuenta atrás si van ligados a un evento.',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const l = limited(metricsServiceFor(ctx).goals(), 30)
      return {
        objetivos: l.items.map((g) => ({
          id: g.goalId,
          nombre: g.name,
          tipo: GOAL_TYPE_LABEL[g.type],
          estado: GOAL_STATUS_LABEL[g.status],
          unidad: g.unit,
          objetivo: g.target,
          ...(g.targetReps ? { reps: g.targetReps } : {}),
          actual: round(g.current, 2),
          mejor: round(g.best, 2),
          progreso: pct(g.pct),
          conseguido: g.achieved,
          fechaLimite: g.deadline,
          ejercicio: g.exerciseTitle,
          grupo: g.groupName,
          tipoSesion: g.kind ? KIND_LABEL[g.kind] : null,
          evento: g.eventName,
          proyeccion: g.projection ? { valor: round(g.projection.value, 2), fecha: g.projection.date, cambioPorSemana: round(g.projection.slopePerWeek, 2) } : null,
          ...(g.countdown ? { diasQueFaltan: g.countdown.daysLeft } : {})
        })),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, { ejercicio?: string | number }>({
    name: 'entreno_records',
    label: 'Consultando los récords',
    description: 'Récords vigentes (peso máximo, mejor e1RM, repeticiones, volumen en una sesión…) de un ejercicio o de todos (como mucho 40 ejercicios).',
    parameters: params({ ejercicio: { type: 'string', description: 'Id o nombre del ejercicio (opcional).' } }),
    args: z.object({ ejercicio: ref.optional() }).strict(),
    run: (ctx, a) => {
      const id = a.ejercicio === undefined ? null : exercise(ctx.db, a.ejercicio).id
      const l = limited(metricsServiceFor(ctx).records(id), 40)
      return {
        ejercicios: l.items.map((e) => ({
          ejercicio: e.exerciseTitle,
          id: e.exerciseId,
          records: e.records.slice(0, 12).map((r) => ({
            record: RECORD_NAMES[r.type],
            valor: round(r.value, 2),
            ...(r.weightKg !== null ? { pesoKg: r.weightKg } : {}),
            fecha: r.date
          }))
        })),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, { texto?: string }>({
    name: 'entreno_ejercicios',
    label: 'Consultando los ejercicios',
    description: 'Ejercicios del catálogo con su id, grupo muscular principal y cuándo se usaron por última vez (como mucho 100; filtra con texto).',
    parameters: params({ texto: { type: 'string' } }),
    args: z.object({ texto: z.string().trim().max(100).optional() }).strict(),
    run: (ctx, a) => {
      const groups = new Map(catalog.listMuscleGroups(ctx.db).map((g) => [g.id, g.name]))
      const q = a.texto ? norm(a.texto) : ''
      const list = exercises.listExercises(ctx.db).filter((e) => !q || norm(e.title).includes(q) || e.aliases.some((x) => norm(x.alias).includes(q)))
      const l = limited(list, 100)
      return {
        ejercicios: l.items.map((e) => ({
          id: e.id,
          nombre: e.title,
          grupo: e.primaryGroupId ? (groups.get(e.primaryGroupId) ?? null) : null,
          ...(e.isBodyweight ? { pesoCorporal: true } : {}),
          ...(e.active ? {} : { inactivo: true }),
          ultimoUso: e.lastUsed
        })),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'entreno_grupos_musculares',
    label: 'Consultando los grupos musculares',
    description: 'Grupos musculares con su id y su rango recomendado de series efectivas por semana.',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => ({
      grupos: catalog
        .listMuscleGroups(ctx.db)
        .slice(0, 60)
        .map((g) => ({ id: g.id, nombre: g.name, seriesSemana: `${g.weeklySetsMin}-${g.weeklySetsMax}`, ...(g.active ? {} : { inactivo: true }) }))
    })
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'entreno_rutinas',
    label: 'Consultando los tipos de entreno',
    description: 'Tipos de entreno (rutinas como «Fuerza A» o «Natación») con su id, tipo de sesión y ejercicios previstos.',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const names = new Map(exercises.listExercises(ctx.db).map((e) => [e.id, e.title]))
      const l = limited(routines.listRoutines(ctx.db), 50)
      return {
        rutinas: l.items.map((r) => ({
          id: r.id,
          nombre: r.name,
          tipo: KIND_LABEL[r.kind],
          ...(r.active ? {} : { inactiva: true }),
          ejercicios: r.items.slice(0, 20).map((i) => names.get(i.exerciseId) ?? i.exerciseId),
          sesiones: r.workoutCount
        })),
        total: l.total
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'entreno_eventos',
    label: 'Consultando los eventos',
    description: 'Eventos con fecha (carreras, competiciones de HYROX…) con su id.',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => ({ eventos: blocks.listEvents(ctx.db).slice(0, 50).map((e) => ({ id: e.id, nombre: e.name, fecha: e.date, ...(e.notes ? { notas: e.notes } : {}) })) })
  }),

  readTool<CoreContext, { texto?: string; desde?: string; hasta?: string; tipo?: WorkoutKind; limite?: number }>({
    name: 'entreno_sesiones_buscar',
    label: 'Buscando sesiones',
    description: 'Sesiones hechas (de Hevy o manuales), de la más reciente a la más antigua, con filtros de texto (título, notas o ejercicio), fechas y tipo. Como mucho 30.',
    parameters: params({
      texto: { type: 'string' },
      desde: { type: 'string', description: 'AAAA-MM-DD' },
      hasta: { type: 'string', description: 'AAAA-MM-DD' },
      tipo: { type: 'string', enum: [...WORKOUT_KINDS] },
      limite: { type: 'integer', description: 'De 1 a 30 (por defecto 10).' }
    }),
    args: z
      .object({
        texto: z.string().trim().max(100).optional(),
        desde: isoDate.optional(),
        hasta: isoDate.optional(),
        tipo: z.enum(WORKOUT_KINDS).optional(),
        limite: z.number().int().min(1).max(30).optional()
      })
      .strict(),
    run: (ctx, a) => {
      const names = new Map(routines.listRoutines(ctx.db).map((r) => [r.id, r.name]))
      const list = workouts.listWorkouts(ctx.db, {
        search: a.texto ?? null,
        from: a.desde ?? null,
        to: a.hasta ?? null,
        kind: a.tipo ?? null,
        limit: a.limite ?? 10
      })
      return {
        sesiones: list.map((w) => ({
          id: w.id,
          titulo: w.title,
          inicio: w.startTime,
          tipo: KIND_LABEL[w.kind],
          fuente: w.source === 'MANUAL' ? 'manual' : 'Hevy',
          rutina: w.routineId ? (names.get(w.routineId) ?? null) : null,
          minutos: w.durationSeconds === null ? null : Math.round(w.durationSeconds / 60),
          ejercicios: w.exerciseCount,
          series: w.setCount,
          ...(w.perceivedEffort ? { esfuerzo: w.perceivedEffort } : {})
        }))
      }
    }
  }),

  readTool<CoreContext, z.infer<typeof NoArgs>>({
    name: 'entreno_revision_semanal',
    label: 'Haciendo la revisión semanal',
    description:
      'Revisión semanal que calcula la app: estancamientos, grupos musculares por debajo de lo previsto, adherencia al plan, ritmo hacia los objetivos y hacia HYROX, y récords. Úsala para explicar sugerencias o para «¿cómo voy?».',
    parameters: params({}),
    args: NoArgs,
    run: (ctx) => {
      const l = limited(entrenoSuggestions(ctx), 25)
      return { sugerencias: l.items.map((s) => ({ id: s.id, tipo: s.severity, titulo: s.title, detalle: s.detail, fecha: s.asOf })), total: l.total }
    }
  })
]

// ---------------------------------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------------------------------

const SetArg = z
  .object({
    tipo: z.enum(SET_TYPES).optional(),
    pesoKg: z.number().nullable().optional(),
    reps: z.number().int().min(0).nullable().optional(),
    distanciaKm: z.number().min(0).nullable().optional(),
    duracionSeg: z.number().int().min(0).nullable().optional(),
    rpe: z.number().min(1).max(10).nullable().optional()
  })
  .strict()

const WorkoutArgs = z
  .object({
    id: z.number().int().positive().optional(),
    titulo: z.string().trim().min(1).max(200).optional(),
    inicio: localDateTime.optional(),
    fin: localDateTime.nullable().optional(),
    tipo: z.enum(WORKOUT_KINDS).nullable().optional(),
    esfuerzo: z.number().int().min(1).max(10).nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional(),
    rutina: ref.nullable().optional(),
    ejercicios: z
      .array(z.object({ ejercicio: ref, notas: z.string().trim().max(1000).nullable().optional(), series: z.array(SetArg).min(1).max(50) }).strict())
      .max(40)
      .optional()
  })
  .strict()

const ExtrasArgs = z
  .object({
    id: z.number().int().positive(),
    tipo: z.enum(WORKOUT_KINDS).nullable().optional(),
    esfuerzo: z.number().int().min(1).max(10).nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional(),
    rutina: ref.nullable().optional()
  })
  .strict()

const GoalArgs = z
  .object({
    id: z.number().int().positive().optional(),
    nombre: z.string().trim().min(1).max(200).optional(),
    tipo: z.enum(GOAL_TYPES).optional(),
    objetivo: z.number().positive().nullable().optional(),
    reps: z.number().int().positive().nullable().optional(),
    fechaLimite: isoDate.nullable().optional(),
    ejercicio: ref.nullable().optional(),
    grupo: ref.nullable().optional(),
    evento: ref.nullable().optional(),
    tipoSesion: z.enum(WORKOUT_KINDS).nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional()
  })
  .strict()

const EventArgs = z
  .object({
    id: z.number().int().positive().optional(),
    nombre: z.string().trim().min(1).max(200).optional(),
    fecha: isoDate.optional(),
    notas: z.string().trim().max(2000).nullable().optional()
  })
  .strict()

const WeekArgs = z
  .object({
    semana: isoDate,
    sesiones: z
      .array(z.object({ fecha: isoDate, rutina: ref, hora: z.string().nullable().optional(), nota: z.string().trim().max(500).nullable().optional() }).strict())
      .max(70)
  })
  .strict()

const MoveArgs = z
  .object({ desde: isoDate, rutina: ref.optional(), hasta: isoDate, posicion: z.number().int().min(0).nullable().optional() })
  .strict()

const RemoveArgs = z.object({ fecha: isoDate, rutina: ref.optional() }).strict()

const RoutineArgs = z
  .object({
    id: z.number().int().positive().optional(),
    nombre: z.string().trim().min(1).max(100).optional(),
    tipo: z.enum(WORKOUT_KINDS).optional(),
    descripcion: z.string().trim().max(2000).nullable().optional(),
    activa: z.boolean().optional(),
    ejercicios: z
      .array(
        z
          .object({
            ejercicio: ref,
            series: z.number().int().positive().nullable().optional(),
            repsMin: z.number().int().positive().nullable().optional(),
            repsMax: z.number().int().positive().nullable().optional(),
            rpe: z.number().min(1).max(10).nullable().optional(),
            notas: z.string().trim().max(500).nullable().optional()
          })
          .strict()
      )
      .max(40)
      .optional()
  })
  .strict()

function exercisesText(db: Db, list: ManualWorkoutInput['exercises']): string | null {
  if (!list.length) return null
  const names = new Map(exercises.listExercises(db).map((e) => [e.id, e.title]))
  return list.map((e) => `${names.get(e.exerciseId) ?? e.exerciseId}: ${e.sets.length} ${e.sets.length === 1 ? 'serie' : 'series'}`).join('; ')
}

function detailToInput(w: WorkoutDetail): ManualWorkoutInput {
  return {
    id: w.id,
    title: w.title,
    startTime: w.startTime,
    endTime: w.endTime,
    description: w.description,
    kind: w.kindManual ? w.kind : null,
    perceivedEffort: w.perceivedEffort,
    notes: w.notes,
    blockId: w.blockId,
    routineId: w.routineId,
    exercises: w.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      supersetId: e.supersetId,
      exerciseNotes: e.exerciseNotes,
      sets: e.sets.map((s) => ({
        setType: s.setType,
        weightKg: s.weightKg,
        reps: s.reps,
        distanceKm: s.distanceKm,
        durationSeconds: s.durationSeconds,
        rpe: s.rpe,
        notes: s.notes
      }))
    }))
  }
}

const workoutFingerprint = (ctx: CoreContext, change: AiChange) => (change.entityId ? fingerprintOf(workoutOrNull(ctx.db, Number(change.entityId))) : null)

const routineName = (db: Db, id: number | null | undefined) => (id ? (routines.listRoutines(db).find((r) => r.id === id)?.name ?? String(id)) : null)

const actionTools: AiToolDef[] = [
  actionTool<CoreContext, z.infer<typeof WorkoutArgs>>({
    name: 'entreno_sesion_guardar',
    label: 'Preparando una sesión manual',
    description:
      'Propone apuntar una sesión manual (sin id) o editar una sesión manual (con id; solo cambia lo que indiques y, si das ejercicios, sustituyen a los que tenía). Las de Hevy no se editan aquí (usa entreno_sesion_datos). Fechas AAAA-MM-DDTHH:mm. NO guarda nada: Michael lo confirma.',
    parameters: params({
      id: { type: 'integer' },
      titulo: { type: 'string' },
      inicio: { type: 'string', description: 'AAAA-MM-DDTHH:mm' },
      fin: { type: 'string', description: 'AAAA-MM-DDTHH:mm (opcional)' },
      tipo: { type: 'string', enum: [...WORKOUT_KINDS], description: 'Sin poner: lo deciden las reglas.' },
      esfuerzo: { type: 'integer', description: 'De 1 a 10.' },
      notas: { type: 'string' },
      rutina: { type: 'string', description: 'Id o nombre del tipo de entreno.' },
      ejercicios: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ejercicio: { type: 'string', description: 'Id o nombre del ejercicio.' },
            notas: { type: 'string' },
            series: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: [...SET_TYPES] },
                  pesoKg: { type: 'number' },
                  reps: { type: 'integer' },
                  distanciaKm: { type: 'number' },
                  duracionSeg: { type: 'integer' },
                  rpe: { type: 'number' }
                }
              }
            }
          },
          required: ['ejercicio', 'series']
        }
      }
    }),
    args: WorkoutArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const before = a.id ? workouts.getWorkout(db, a.id) : null
      if (before && before.source !== 'MANUAL')
        throw new UserError('Esa sesión viene de Hevy: sus series no se editan aquí. Para tipo, esfuerzo, notas o rutina usa entreno_sesion_datos.')
      if (!before && (!a.titulo || !a.inicio)) throw new UserError('Para apuntar una sesión, indica el título y el inicio.')
      const base: ManualWorkoutInput = before
        ? detailToInput(before)
        : { id: null, title: a.titulo!, startTime: a.inicio!, endTime: null, kind: null, perceivedEffort: null, notes: null, routineId: null, exercises: [] }
      const input: ManualWorkoutInput = {
        ...base,
        ...(a.titulo ? { title: a.titulo } : {}),
        ...(a.inicio ? { startTime: a.inicio } : {}),
        ...(a.fin !== undefined ? { endTime: a.fin } : {}),
        ...(a.tipo !== undefined ? { kind: a.tipo } : {}),
        ...(a.esfuerzo !== undefined ? { perceivedEffort: a.esfuerzo } : {}),
        ...(a.notas !== undefined ? { notes: a.notas } : {}),
        ...(a.rutina !== undefined ? { routineId: a.rutina === null ? null : routine(db, a.rutina).id } : {})
      }
      if (a.ejercicios)
        input.exercises = a.ejercicios.map((e) => ({
          exerciseId: exercise(db, e.ejercicio).id,
          exerciseNotes: e.notas ?? null,
          sets: e.series.map((s) => ({
            setType: s.tipo ?? 'normal',
            weightKg: s.pesoKg ?? null,
            reps: s.reps ?? null,
            distanceKm: s.distanciaKm ?? null,
            durationSeconds: s.duracionSeg ?? null,
            rpe: s.rpe ?? null
          }))
        }))
      parseOrThrow(ManualWorkoutSchema, input, 'Sesión')
      const fields = diff<ManualWorkoutInput>(before ? detailToInput(before) : null, input, [
        ['Título', (w) => w.title],
        ['Inicio', (w) => dt(w.startTime)],
        ['Fin', (w) => dt(w.endTime)],
        ['Tipo', (w) => (w.kind ? KIND_LABEL[w.kind] : null)],
        ['Esfuerzo', (w) => numText(w.perceivedEffort)],
        ['Rutina', (w) => routineName(db, w.routineId)],
        ['Notas', (w) => w.notes ?? null],
        ['Ejercicios', (w) => exercisesText(db, w.exercises)]
      ])
      if (before && !fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_workout',
            entityId: before ? String(before.id) : null,
            op: before ? 'update' : 'create',
            label: `Sesión «${input.title}» · ${dt(input.startTime)}`,
            fields,
            payload: input,
            fingerprint: before ? fingerprintOf(before) : null
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'workouts.saveManual', (db) => workouts.saveManualWorkout(db, change.payload as ManualWorkoutInput))
    },
    fingerprint: workoutFingerprint
  }),

  actionTool<CoreContext, z.infer<typeof ExtrasArgs>>({
    name: 'entreno_sesion_datos',
    label: 'Preparando un cambio en una sesión',
    description:
      'Propone cambiar los datos propios de una sesión (de Hevy o manual): tipo de sesión (null = automático), esfuerzo de 1 a 10, notas o tipo de entreno (rutina). NO cambia nada: Michael lo confirma.',
    parameters: params(
      {
        id: { type: 'integer', description: 'Id de la sesión (de entreno_sesiones_buscar).' },
        tipo: { type: ['string', 'null'], enum: [...WORKOUT_KINDS, null] },
        esfuerzo: { type: ['integer', 'null'] },
        notas: { type: ['string', 'null'] },
        rutina: { type: ['string', 'null'], description: 'Id o nombre del tipo de entreno; null para quitarlo.' }
      },
      ['id']
    ),
    args: ExtrasArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const before = workouts.getWorkout(db, a.id)
      const input: WorkoutExtrasInput = { id: a.id }
      if (a.tipo !== undefined) input.kind = a.tipo
      if (a.esfuerzo !== undefined) input.perceivedEffort = a.esfuerzo
      if (a.notas !== undefined) input.notes = a.notas
      if (a.rutina !== undefined) input.routineId = a.rutina === null ? null : routine(db, a.rutina).id
      parseOrThrow(WorkoutExtrasSchema, input, 'Cambio')
      const fields: AiFieldDiff[] = []
      if (input.kind !== undefined) {
        const after = input.kind === null ? 'Automático (según las reglas)' : KIND_LABEL[input.kind]
        if (input.kind !== before.kind || (input.kind === null && before.kindManual))
          fields.push({ label: 'Tipo', before: KIND_LABEL[before.kind] + (before.kindManual ? ' (a mano)' : ''), after })
      }
      if (input.perceivedEffort !== undefined && input.perceivedEffort !== before.perceivedEffort)
        fields.push({ label: 'Esfuerzo', before: numText(before.perceivedEffort), after: numText(input.perceivedEffort) })
      if (input.notes !== undefined && (input.notes ?? null) !== before.notes) fields.push({ label: 'Notas', before: before.notes, after: input.notes ?? null })
      if (input.routineId !== undefined && input.routineId !== before.routineId)
        fields.push({ label: 'Rutina', before: routineName(db, before.routineId), after: routineName(db, input.routineId) })
      if (!fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_workout',
            entityId: String(before.id),
            op: 'update',
            label: `Sesión «${before.title}» · ${dt(before.startTime)}`,
            fields,
            payload: input,
            fingerprint: fingerprintOf(before)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'workouts.updateExtras', (db) => workouts.updateWorkoutExtras(db, change.payload as WorkoutExtrasInput))
    },
    fingerprint: workoutFingerprint
  }),

  actionTool<CoreContext, z.infer<typeof GoalArgs>>({
    name: 'entreno_objetivo_guardar',
    label: 'Preparando un objetivo de entreno',
    description:
      'Propone crear un objetivo de entreno (sin id) o cambiar uno (con id; solo cambia lo que indiques). Tipos: E1RM (ejercicio + objetivo en kg), WEIGHT_REPS (ejercicio + kg + reps), WEEKLY_VOLUME (grupo o ejercicio + objetivo), FREQUENCY (tipoSesion o grupo + veces por semana), EVENT (evento). Para cambiar el estado usa entreno_objetivo_estado. NO guarda nada: Michael lo confirma.',
    parameters: params({
      id: { type: 'integer' },
      nombre: { type: 'string' },
      tipo: { type: 'string', enum: [...GOAL_TYPES] },
      objetivo: { type: 'number' },
      reps: { type: 'integer' },
      fechaLimite: { type: 'string', description: 'AAAA-MM-DD' },
      ejercicio: { type: 'string', description: 'Id o nombre.' },
      grupo: { type: 'string', description: 'Id o nombre del grupo muscular.' },
      evento: { type: 'string', description: 'Id o nombre del evento.' },
      tipoSesion: { type: 'string', enum: [...WORKOUT_KINDS] },
      notas: { type: 'string' }
    }),
    args: GoalArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const before = a.id ? goalById(db, a.id) : null
      if (!before && (!a.nombre || !a.tipo)) throw new UserError('Para crear un objetivo, indica el nombre y el tipo.')
      const pick = <T>(v: T | undefined, prev: T): T => (v === undefined ? prev : v)
      const input: GoalInput = {
        id: before?.id ?? null,
        name: a.nombre ?? before!.name,
        type: a.tipo ?? before!.type,
        targetValue: pick(a.objetivo, before?.targetValue ?? null),
        targetReps: pick(a.reps, before?.targetReps ?? null),
        deadline: pick(a.fechaLimite, before?.deadline ?? null),
        exerciseId: a.ejercicio === undefined ? (before?.exerciseId ?? null) : a.ejercicio === null ? null : exercise(db, a.ejercicio).id,
        groupId: a.grupo === undefined ? (before?.groupId ?? null) : a.grupo === null ? null : group(db, a.grupo).id,
        eventId: a.evento === undefined ? (before?.eventId ?? null) : a.evento === null ? null : event(db, a.evento).id,
        kind: pick(a.tipoSesion, before?.kind ?? null),
        notes: pick(a.notas, before?.notes ?? null),
        ...(before ? {} : { status: 'ACTIVE' as const })
      }
      parseOrThrow(GoalSchema, input, 'Objetivo')
      const exName = (id: number | null | undefined) => (id ? (exercises.listExercises(db).find((e) => e.id === id)?.title ?? String(id)) : null)
      const grName = (id: number | null | undefined) => (id ? (catalog.listMuscleGroups(db).find((g) => g.id === id)?.name ?? String(id)) : null)
      const evName = (id: number | null | undefined) => (id ? (blocks.listEvents(db).find((e) => e.id === id)?.name ?? String(id)) : null)
      const fields = diff<GoalInput>(before, input, [
        ['Nombre', (g) => g.name],
        ['Tipo', (g) => GOAL_TYPE_LABEL[g.type]],
        ['Objetivo', (g) => numText(g.targetValue)],
        ['Repeticiones', (g) => numText(g.targetReps)],
        ['Fecha límite', (g) => (g.deadline ? fecha(g.deadline) : null)],
        ['Ejercicio', (g) => exName(g.exerciseId)],
        ['Grupo muscular', (g) => grName(g.groupId)],
        ['Evento', (g) => evName(g.eventId)],
        ['Tipo de sesión', (g) => (g.kind ? KIND_LABEL[g.kind] : null)],
        ['Notas', (g) => g.notes ?? null]
      ])
      if (before && !fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_goal',
            entityId: before ? String(before.id) : null,
            op: before ? 'update' : 'create',
            label: `Objetivo «${input.name}»`,
            fields,
            payload: input,
            fingerprint: fingerprintOf(before)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'goals.save', (db) => goals.saveGoal(db, change.payload as GoalInput))
    },
    fingerprint: (ctx, change) => (change.entityId ? fingerprintOf(goals.listGoals(ctx.db).find((g) => g.id === Number(change.entityId)) ?? null) : null)
  }),

  actionTool<CoreContext, { id: number; estado: GoalStatus }>({
    name: 'entreno_objetivo_estado',
    label: 'Preparando un cambio de estado de objetivo',
    description: 'Propone marcar un objetivo de entreno como activo (ACTIVE), conseguido (ACHIEVED) o abandonado (ABANDONED). NO lo cambia: Michael lo confirma.',
    parameters: params({ id: { type: 'integer' }, estado: { type: 'string', enum: [...GOAL_STATUSES] } }, ['id', 'estado']),
    args: z.object({ id: z.number().int().positive(), estado: z.enum(GOAL_STATUSES) }).strict(),
    plan: (ctx, a) => {
      const before = goalById(ctx.db, a.id)
      if (before.status === a.estado) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_goal',
            entityId: String(before.id),
            op: 'update',
            label: `Objetivo «${before.name}»`,
            fields: [{ label: 'Estado', before: GOAL_STATUS_LABEL[before.status], after: GOAL_STATUS_LABEL[a.estado] }],
            payload: { id: before.id, status: a.estado },
            fingerprint: fingerprintOf(before)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      const p = change.payload as { id: number; status: GoalStatus }
      await write(ctx, guard, 'goals.setStatus', (db) => goals.setGoalStatus(db, p.id, p.status))
    },
    fingerprint: (ctx, change) => (change.entityId ? fingerprintOf(goals.listGoals(ctx.db).find((g) => g.id === Number(change.entityId)) ?? null) : null)
  }),

  actionTool<CoreContext, z.infer<typeof EventArgs>>({
    name: 'entreno_evento_guardar',
    label: 'Preparando un evento',
    description: 'Propone crear un evento con fecha (sin id) o cambiar uno (con id). NO guarda nada: Michael lo confirma.',
    parameters: params({ id: { type: 'integer' }, nombre: { type: 'string' }, fecha: { type: 'string', description: 'AAAA-MM-DD' }, notas: { type: 'string' } }),
    args: EventArgs,
    plan: (ctx, a) => {
      const before = a.id ? (blocks.listEvents(ctx.db).find((e) => e.id === a.id) ?? null) : null
      if (a.id && !before) throw new UserError(`El evento ${a.id} no existe.`)
      if (!before && (!a.nombre || !a.fecha)) throw new UserError('Para crear un evento, indica el nombre y la fecha.')
      const input: TrainingEventInput = {
        id: before?.id ?? null,
        name: a.nombre ?? before!.name,
        date: a.fecha ?? before!.date,
        notes: a.notas === undefined ? (before?.notes ?? null) : a.notas
      }
      parseOrThrow(TrainingEventSchema, input, 'Evento')
      const fields = diff<TrainingEventInput>(before, input, [
        ['Nombre', (e) => e.name],
        ['Fecha', (e) => fecha(e.date)],
        ['Notas', (e) => e.notes ?? null]
      ])
      if (before && !fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_event',
            entityId: before ? String(before.id) : null,
            op: before ? 'update' : 'create',
            label: `Evento «${input.name}» · ${fecha(input.date)}`,
            fields,
            payload: input,
            fingerprint: fingerprintOf(before)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'events.save', (db) => blocks.saveEvent(db, change.payload as TrainingEventInput))
    },
    fingerprint: (ctx, change) => (change.entityId ? fingerprintOf(blocks.listEvents(ctx.db).find((e) => e.id === Number(change.entityId)) ?? null) : null)
  }),

  actionTool<CoreContext, z.infer<typeof WeekArgs>>({
    name: 'entreno_semana_guardar',
    label: 'Preparando el plan de la semana',
    description:
      'Propone sustituir el plan de una semana (lunes a domingo) por estas sesiones: cada una con fecha dentro de la semana, tipo de entreno (id o nombre), hora HH:mm opcional y nota. Para un cambio pequeño usa entreno_semana_mover o entreno_semana_quitar. NO guarda nada: Michael lo confirma.',
    parameters: params(
      {
        semana: { type: 'string', description: 'Lunes de la semana (AAAA-MM-DD).' },
        sesiones: {
          type: 'array',
          items: {
            type: 'object',
            properties: { fecha: { type: 'string' }, rutina: { type: 'string' }, hora: { type: 'string' }, nota: { type: 'string' } },
            required: ['fecha', 'rutina']
          }
        }
      },
      ['semana', 'sesiones']
    ),
    args: WeekArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const ws = mondayOf(a.semana)
      if (ws !== a.semana) throw new UserError(`La semana tiene que empezar en lunes: sería el ${ws}.`)
      const slots: WeekPlanSlotInput[] = a.sesiones.map((s) => {
        if (mondayOf(s.fecha) !== ws) throw new UserError(`El ${formatDate(s.fecha)} no es de la semana del ${formatDate(ws)}.`)
        return { date: s.fecha, routineId: routine(db, s.rutina).id, time: s.hora ?? null, note: s.nota ?? null }
      })
      parseOrThrow(WeekPlanSlotsSchema, slots, 'Plan')
      slots.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
      const before = planning.getWeekPlan(db, ws)
      const names = new Map(routines.listRoutines(db).map((r) => [r.id, r.name]))
      const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() || 7
      const after = slots.length ? slots.map((s) => slotText(dow(s.date), names.get(s.routineId) ?? String(s.routineId), s.time, s.note)).join(', ') : null
      const prev = weekText(before)
      // Se compara todo lo que se guarda (fecha, orden del día, rutina, hora y nota), como `slotsOf`.
      const perDay = new Map<string, number>()
      const next = slots.map((x) => {
        const order = perDay.get(x.date) ?? 0
        perDay.set(x.date, order + 1)
        return { date: x.date, order, routineId: x.routineId, time: x.time ?? null, note: x.note ?? null }
      })
      if (before.saved && JSON.stringify(next) === JSON.stringify(slotsOf(before))) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_week_plan',
            entityId: ws,
            op: 'update',
            label: `Plan de la semana del ${formatDate(ws)}`,
            fields: [{ label: 'Sesiones', before: prev, after }],
            payload: { weekStart: ws, slots },
            fingerprint: weekFingerprint(db, ws)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      const p = change.payload as { weekStart: string; slots: WeekPlanSlotInput[] }
      await write(ctx, guard, 'weekPlan.save', (db) => planning.saveWeekPlan(db, p.weekStart, p.slots))
    },
    fingerprint: (ctx, change) => weekFingerprint(ctx.db, String(change.entityId))
  }),

  actionTool<CoreContext, z.infer<typeof MoveArgs>>({
    name: 'entreno_semana_mover',
    label: 'Preparando un cambio en el plan',
    description:
      'Propone mover una sesión del plan a otro día de la misma semana. Indica la fecha de origen, la rutina si ese día hay varias, y la fecha de destino. NO cambia nada: Michael lo confirma.',
    parameters: params(
      {
        desde: { type: 'string', description: 'AAAA-MM-DD' },
        rutina: { type: 'string', description: 'Rutina que se mueve (si ese día hay varias).' },
        hasta: { type: 'string', description: 'AAAA-MM-DD' },
        posicion: { type: 'integer', description: 'Posición dentro del día de destino (opcional; por defecto, al final).' }
      },
      ['desde', 'hasta']
    ),
    args: MoveArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const ws = mondayOf(a.desde)
      if (mondayOf(a.hasta) !== ws) throw new UserError('Solo se puede mover una sesión a otro día de la misma semana.')
      const slot = findSlot(db, a.desde, a.rutina)
      const input: WeekPlanMoveInput = { from: slot.ref, to: { date: a.hasta, order: a.posicion ?? null } }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_week_plan',
            entityId: ws,
            op: 'update',
            label: `Mover «${slot.name}»`,
            fields: [{ label: 'Día', before: formatDate(a.desde), after: formatDate(a.hasta) }],
            payload: input,
            fingerprint: weekFingerprint(db, ws)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'weekPlan.move', (db) => planning.moveWeekSlot(db, change.payload as WeekPlanMoveInput))
    },
    fingerprint: (ctx, change) => weekFingerprint(ctx.db, String(change.entityId))
  }),

  actionTool<CoreContext, z.infer<typeof RemoveArgs>>({
    name: 'entreno_semana_quitar',
    label: 'Preparando un cambio en el plan',
    description: 'Propone quitar una sesión del plan de la semana (indica la fecha y la rutina si ese día hay varias). NO cambia nada: Michael lo confirma.',
    parameters: params({ fecha: { type: 'string', description: 'AAAA-MM-DD' }, rutina: { type: 'string' } }, ['fecha']),
    args: RemoveArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const ws = mondayOf(a.fecha)
      const slot = findSlot(db, a.fecha, a.rutina)
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_week_plan',
            entityId: ws,
            op: 'delete',
            label: `Quitar «${slot.name}» del ${formatDate(a.fecha)}`,
            fields: [{ label: 'Sesión', before: `${slot.name} · ${formatDate(a.fecha)}`, after: null }],
            payload: slot.ref,
            fingerprint: weekFingerprint(db, ws)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'weekPlan.remove', (db) => planning.removeWeekSlot(db, change.payload as WeekPlanSlotRef))
    },
    fingerprint: (ctx, change) => weekFingerprint(ctx.db, String(change.entityId))
  }),

  actionTool<CoreContext, z.infer<typeof RoutineArgs>>({
    name: 'entreno_rutina_guardar',
    label: 'Preparando un tipo de entreno',
    description:
      'Propone crear un tipo de entreno (sin id) o cambiar uno (con id; solo cambia lo que indiques; si das ejercicios, sustituyen a los previstos). NO guarda nada: Michael lo confirma.',
    parameters: params({
      id: { type: 'integer' },
      nombre: { type: 'string' },
      tipo: { type: 'string', enum: [...WORKOUT_KINDS] },
      descripcion: { type: 'string' },
      activa: { type: 'boolean' },
      ejercicios: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ejercicio: { type: 'string' },
            series: { type: 'integer' },
            repsMin: { type: 'integer' },
            repsMax: { type: 'integer' },
            rpe: { type: 'number' },
            notas: { type: 'string' }
          },
          required: ['ejercicio']
        }
      }
    }),
    args: RoutineArgs,
    plan: (ctx, a) => {
      const db = ctx.db
      const before = a.id ? (routines.listRoutines(db).find((r) => r.id === a.id) ?? null) : null
      if (a.id && !before) throw new UserError(`El tipo de entreno ${a.id} no existe.`)
      if (!before && (!a.nombre || !a.tipo)) throw new UserError('Para crear un tipo de entreno, indica el nombre y el tipo de sesión.')
      const input: RoutineInput = {
        id: before?.id ?? null,
        name: a.nombre ?? before!.name,
        kind: a.tipo ?? before!.kind,
        description: a.descripcion === undefined ? (before?.description ?? null) : a.descripcion,
        active: a.activa ?? before?.active ?? true
      }
      if (a.ejercicios)
        input.items = a.ejercicios.map((e) => ({
          exerciseId: exercise(db, e.ejercicio).id,
          targetSets: e.series ?? null,
          repsMin: e.repsMin ?? null,
          repsMax: e.repsMax ?? null,
          targetRpe: e.rpe ?? null,
          notes: e.notas ?? null
        }))
      parseOrThrow(RoutineSchema, input, 'Tipo de entreno')
      const names = new Map(exercises.listExercises(db).map((e) => [e.id, e.title]))
      const itemsText = (items: Array<{ exerciseId: number }> | undefined) =>
        items && items.length ? items.map((i) => names.get(i.exerciseId) ?? String(i.exerciseId)).join(', ') : null
      const fields = diff<RoutineInput>(before ? { id: before.id, name: before.name, kind: before.kind, description: before.description, active: before.active } : null, input, [
        ['Nombre', (r) => r.name],
        ['Tipo de sesión', (r) => KIND_LABEL[r.kind]],
        ['Descripción', (r) => r.description ?? null],
        ['Activa', (r) => ((r.active ?? true) ? 'Sí' : 'No')]
      ])
      if (a.ejercicios) {
        const b = itemsText(before?.items)
        const n = itemsText(input.items)
        if (!before || b !== n) fields.push({ label: 'Ejercicios', before: b, after: n })
      }
      if (before && !fields.length) return { criterion: null, changes: [] }
      return {
        criterion: null,
        changes: [
          {
            entity: 'trn_routine',
            entityId: before ? String(before.id) : null,
            op: before ? 'update' : 'create',
            label: `Tipo de entreno «${input.name}»`,
            fields,
            payload: input,
            fingerprint: fingerprintOf(before)
          }
        ]
      }
    },
    apply: async (ctx, change, guard) => {
      await write(ctx, guard, 'routines.save', (db) => routines.saveRoutine(db, change.payload as RoutineInput))
    },
    fingerprint: (ctx, change) => (change.entityId ? fingerprintOf(routines.listRoutines(ctx.db).find((r) => r.id === Number(change.entityId)) ?? null) : null)
  })
]

export const ENTRENO_AI_TOOLS: readonly AiToolDef[] = [...readTools, ...actionTools]

