// Revisión semanal de Entreno (metrics/review.ts) y su conversión en sugerencias (suggestions.ts).
// Hoy = viernes 27/11/2026: la semana revisada es la del 16 al 22 de noviembre.
import { describe, expect, it } from 'vitest'
import {
  REVIEW_DEFAULTS,
  type AdherenceFinding,
  type BaseWeekEntryFact,
  type ReviewFinding,
  type ReviewFindingKind,
  reviewParamsFrom,
  weeklyReview
} from '../../src/shared/modules/entreno/metrics'
import { applyHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import { DEFAULT_SETTINGS } from '../../src/main/modules/entreno/seed'
import { entrenoSuggestions } from '../../src/main/modules/entreno/suggestions'
import { entrenoModule } from '../../src/main/modules/entreno'
import { SettingsSchema } from '../../src/shared/modules/entreno/schemas'
import { META, entrenoApp, escribir, serie, sesion } from './helpers'
import { SETTINGS, blk, ctxOf, ex, goal, grp, rt, st, wk } from './metrics-helpers'

const HOY = '2026-11-27'
const of = <K extends ReviewFindingKind>(fs: ReviewFinding[], kind: K) => fs.filter((f) => f.kind === kind) as Extract<ReviewFinding, { kind: K }>[]
const review = (...a: Parameters<typeof ctxOf>) => weeklyReview({ ctx: ctxOf(...a), today: HOY })

// Boceto: lunes Fuerza A, miércoles Natación, viernes Fuerza A.
const routines = [rt(1, 'Fuerza A', 'GYM'), rt(2, 'Natación', 'SWIM')]
const boceto: BaseWeekEntryFact[] = [
  { weekday: 1, order: 0, routineId: 1, time: null },
  { weekday: 3, order: 0, routineId: 2, time: null },
  { weekday: 5, order: 0, routineId: 1, time: null }
]

describe('weeklyReview: semana revisada y casos vacíos', () => {
  it('sin sesiones ni nada configurado no hay hallazgos', () => {
    const r = review()
    expect([r.weekStart, r.weekEnd, r.sessions, r.isDeload]).toEqual(['2026-11-16', '2026-11-22', 0, false])
    expect(r.findings).toEqual([])
  })

  it('revisa siempre la última semana completa (también un lunes o un domingo)', () => {
    expect(weeklyReview({ ctx: ctxOf(), today: '2026-11-23' }).weekStart).toBe('2026-11-16')
    expect(weeklyReview({ ctx: ctxOf(), today: '2026-11-22' }).weekStart).toBe('2026-11-09')
  })

  it('los parámetros salen de los ajustes; lo que falte, por defecto', () => {
    expect(reviewParamsFrom({})).toEqual(REVIEW_DEFAULTS)
    expect(reviewParamsFrom({ ...SETTINGS, reviewStallWeeks: 6, reviewAdherenceMin: 0.5 })).toMatchObject({ stallWeeks: 6, adherenceMin: 0.5 })
    // Los ajustes por defecto de la app coinciden con REVIEW_DEFAULTS y pasan la validación.
    expect(reviewParamsFrom(DEFAULT_SETTINGS)).toEqual(REVIEW_DEFAULTS)
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, reviewAdherenceMin: 1.5 }).success).toBe(false)
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, reviewStallWeeks: 1 }).success).toBe(false)
  })
})

describe('weeklyReview: adherencia', () => {
  const adh = (r: ReturnType<typeof review>) => of(r.findings, 'adherence')[0] as AdherenceFinding | undefined

  it('semana sin plan, sin boceto y sin bloque: no hay hallazgo aunque haya sesiones', () => {
    const r = review({ routines, workouts: [wk(1, '2026-11-16T07:00')] })
    expect(adh(r)).toBeUndefined()
    expect(r.sessions).toBe(1)
  })

  it('por debajo del mínimo es un aviso y dice qué faltó y qué día', () => {
    const f = adh(review({ routines, baseWeek: boceto, workouts: [wk(1, '2026-11-16T07:00', { routineId: 1 }), wk(2, '2026-11-18T19:00', { routineId: 2, kind: 'SWIM' })] }))!
    expect(f).toMatchObject({ severity: 'warning', source: 'boceto', planned: 3, done: 2, extra: 0 })
    expect(f.missed).toEqual([{ date: '2026-11-20', routineName: 'Fuerza A', kind: 'GYM', count: 1 }])
  })

  it('con el umbral más bajo es información, y todo hecho es un acierto', () => {
    const workouts = [wk(1, '2026-11-16T07:00', { routineId: 1 }), wk(2, '2026-11-18T19:00', { routineId: 2, kind: 'SWIM' })]
    const ctx = ctxOf({ routines, baseWeek: boceto, workouts }, { reviewAdherenceMin: 0.5 })
    expect(of(weeklyReview({ ctx, today: HOY }).findings, 'adherence')[0].severity).toBe('info')
    const todas = adh(review({ routines, baseWeek: boceto, workouts: [...workouts, wk(3, '2026-11-20T07:00', { routineId: 1 })] }))!
    expect(todas).toMatchObject({ severity: 'success', done: 3, pct: 1, missed: [] })
  })

  it('una sesión que cruza la medianoche cuenta el día en que empieza', () => {
    // Plan: domingo Fuerza A. La sesión empieza el domingo 22 a las 23:30 y acaba el lunes.
    const f = adh(
      review({
        routines,
        baseWeek: [{ weekday: 7, order: 0, routineId: 1, time: null }],
        workouts: [wk(1, '2026-11-22T23:30', { routineId: 1, endTime: '2026-11-23T00:40' })]
      })
    )!
    expect(f).toMatchObject({ severity: 'success', done: 1, planned: 1 })
  })

  it('sin días planificados usa lo previsto del bloque, por tipo', () => {
    const f = adh(review({ blocks: [blk(1, '2026-11-01', null, { plannedByKind: { GYM: 3, SWIM: 1 } })], workouts: [wk(1, '2026-11-17T07:00'), wk(2, '2026-11-18T07:00', { kind: 'SWIM' })] }))!
    expect(f).toMatchObject({ severity: 'warning', source: 'bloque', planned: 4, done: 2 })
    expect(f.missed).toEqual([{ date: null, routineName: null, kind: 'GYM', count: 2 }])
  })

  it('una semana sin ninguna sesión con plan da 0 %', () => {
    expect(adh(review({ routines, baseWeek: boceto }))).toMatchObject({ severity: 'warning', done: 0, pct: 0 })
  })
})

describe('weeklyReview: estancamientos', () => {
  const exercises = [ex(1, { title: 'Press banca' }), ex(2, { title: 'Sentadilla' })]
  // Antes de las 4 semanas (26/10–22/11): 100 × 5. En ellas, cuatro sesiones a 95 × 5.
  const base = {
    exercises,
    workouts: [wk(1, '2026-10-12T07:00'), wk(2, '2026-10-27T07:00'), wk(3, '2026-11-03T07:00'), wk(4, '2026-11-10T07:00'), wk(5, '2026-11-17T07:00')],
    sets: [st(1, 1, 100, 5), st(2, 1, 95, 5), st(3, 1, 95, 5), st(4, 1, 95, 5), st(5, 1, 95, 5)]
  }

  it('avisa si la mejor marca de las últimas semanas no supera la de antes', () => {
    const [f] = of(review(base).findings, 'stagnation')
    expect(f).toMatchObject({ exerciseId: 1, exerciseTitle: 'Press banca', measure: 'e1rm', bestDate: '2026-10-12', sessions: 4, weeks: 4 })
    expect(f.best).toBeCloseTo(100 * (1 + 5 / 30))
    expect(f.windowBest).toBeCloseTo(95 * (1 + 5 / 30))
  })

  it('igualar la marca no es mejorar (empate = estancado); superarla, sí', () => {
    const empate = { ...base, sets: [...base.sets, st(5, 1, 100, 5)] }
    expect(of(review(empate).findings, 'stagnation')).toHaveLength(1)
    const mejora = { ...base, sets: [...base.sets, st(5, 1, 100, 6)] }
    expect(of(review(mejora).findings, 'stagnation')).toHaveLength(0)
  })

  it('un calentamiento más pesado no cuenta como mejora', () => {
    const conCalentamiento = { ...base, sets: [...base.sets, st(5, 1, 140, 5, { type: 'warmup' })] }
    expect(of(review(conCalentamiento).findings, 'stagnation')).toHaveLength(1)
  })

  it('no juzga con pocas sesiones, sin historial anterior, sin peso ni en natación', () => {
    expect(of(review({ ...base }, { reviewStallMinSessions: 5 }).findings, 'stagnation')).toHaveLength(0)
    // Sin historial anterior (ejercicio nuevo).
    expect(of(review({ ...base, workouts: base.workouts.slice(1), sets: base.sets.slice(1) }).findings, 'stagnation')).toHaveLength(0)
    // Series sin peso: no hay e1RM y no se juzga.
    const sinPeso = { ...base, sets: base.workouts.map((w) => st(w.id, 1, null, 10)) }
    expect(of(review(sinPeso).findings, 'stagnation')).toHaveLength(0)
    const natacion = { ...base, exercises: [ex(1, { title: 'Crol', category: 'SWIM' })] }
    expect(of(review(natacion).findings, 'stagnation')).toHaveLength(0)
  })

  it('en peso corporal mira las repeticiones de una serie', () => {
    const dominadas = {
      exercises: [ex(1, { title: 'Dominadas', isBodyweight: true })],
      workouts: base.workouts,
      sets: [st(1, 1, null, 12), st(2, 1, null, 10), st(3, 1, null, 11), st(4, 1, null, 12), st(5, 1, null, 9)]
    }
    expect(of(review(dominadas).findings, 'stagnation')[0]).toMatchObject({ measure: 'reps', best: 12, windowBest: 12 })
  })

  it('las semanas de la ventana son editables', () => {
    // Con 2 semanas, lo de antes llega hasta el 08/11 (95 × 5) y la ventana empata: sigue estancado.
    expect(of(review(base, { reviewStallWeeks: 2, reviewStallMinSessions: 2 }).findings, 'stagnation')[0]).toMatchObject({ weeks: 2, sessions: 2 })
  })

  it('a igualdad de sesiones y distancia, ordena por nombre y respeta el máximo por tipo', () => {
    const dos = { ...base, sets: [...base.sets, ...base.sets.map((s) => ({ ...s, exerciseId: 2 }))] }
    expect(of(review(dos).findings, 'stagnation').map((f) => f.exerciseTitle)).toEqual(['Press banca', 'Sentadilla'])
    const params = { ...reviewParamsFrom(SETTINGS), maxPerKind: 1 }
    expect(of(weeklyReview({ ctx: ctxOf(dos), today: HOY }, params).findings, 'stagnation')).toHaveLength(1)
  })
})

describe('weeklyReview: grupos musculares', () => {
  const groups = [grp(1, 'Pecho', 10, 20), grp(2, 'Espalda', 6, 12), grp(3, 'Movilidad', 0, 0)]
  const exercises = [ex(1, { primaryGroupId: 1 }), ex(2, { primaryGroupId: 2 })]
  const sets = (n1: number, n2: number) => [...Array.from({ length: n1 }, () => st(1, 1, 50, 10)), ...Array.from({ length: n2 }, () => st(1, 2, 50, 10))]

  it('avisa de los grupos por debajo de su mínimo, con más déficit primero', () => {
    const r = review({ groups, exercises, workouts: [wk(1, '2026-11-18T07:00')], sets: sets(3, 5) })
    expect(of(r.findings, 'muscle').map((f) => [f.groupName, f.sets, f.min])).toEqual([
      ['Pecho', 3, 10],
      ['Espalda', 5, 6]
    ])
    expect(of(r.findings, 'muscles-ok')).toEqual([])
  })

  it('si todos los grupos con mínimo llegan, un solo acierto', () => {
    const r = review({ groups, exercises, workouts: [wk(1, '2026-11-18T07:00')], sets: sets(10, 6) })
    expect(of(r.findings, 'muscle')).toEqual([])
    expect(of(r.findings, 'muscles-ok')).toEqual([{ kind: 'muscles-ok', severity: 'success', groups: 2 }])
  })

  it('solo los grupos que entrenas: uno que no tocas no avisa; uno que sueles hacer y esta semana no, sí', () => {
    // Espalda (grupo 2) se hizo hace 3 semanas, no en la revisada; Pecho cumple.
    const ws = [wk(1, '2026-11-18T07:00'), wk(2, '2026-10-28T07:00')]
    const ss = [...sets(10, 0), st(2, 2, 50, 10)]
    const r = review({ groups, exercises, workouts: ws, sets: ss })
    expect(of(r.findings, 'muscle').map((f) => [f.groupName, f.sets])).toEqual([['Espalda', 0]])
    // Con una ventana de 2 semanas, Espalda ya no cuenta como grupo que entrenas.
    const corta = review({ groups, exercises, workouts: ws, sets: ss }, { reviewMuscleWeeks: 2 })
    expect(of(corta.findings, 'muscle')).toEqual([])
    expect(of(corta.findings, 'muscles-ok')[0]).toMatchObject({ groups: 1 })
  })

  it('ni en una semana sin series ni en una de descarga', () => {
    expect(of(review({ groups, exercises }).findings, 'muscle')).toEqual([])
    const descarga = review({ groups, exercises, workouts: [wk(1, '2026-11-18T07:00')], sets: sets(1, 1), blocks: [blk(1, '2026-11-16', '2026-11-22', { isDeload: true })] })
    expect(descarga.isDeload).toBe(true)
    expect(of(descarga.findings, 'muscle')).toEqual([])
  })
})

describe('weeklyReview: ritmo de objetivos y HYROX', () => {
  const exercises = [ex(1, { title: 'Press banca' }), ex(2, { title: 'SkiErg', category: 'HYROX', hyroxStation: 'SkiErg' })]
  // e1RM semanal subiendo 2,5 kg por semana durante 4 semanas (la última, la revisada).
  const workouts = [wk(1, '2026-10-27T07:00'), wk(2, '2026-11-03T07:00'), wk(3, '2026-11-10T07:00'), wk(4, '2026-11-17T07:00')]
  const sets = [st(1, 1, 90, 1), st(2, 1, 92.5, 1), st(3, 1, 95, 1), st(4, 1, 97.5, 1)]
  const event = { id: 7, name: 'HYROX Madrid', date: '2027-03-20' }

  it('a ritmo, sin llegar o conseguido', () => {
    const goals = [
      goal(1, { name: 'Press a 110', type: 'E1RM', exerciseId: 1, targetValue: 110, deadline: '2027-03-01' }),
      goal(2, { name: 'Press a 200', type: 'E1RM', exerciseId: 1, targetValue: 200, deadline: '2027-03-01' }),
      goal(3, { name: '', type: 'E1RM', exerciseId: 1, targetValue: 95, deadline: '2027-03-01' })
    ]
    const r = review({ exercises, workouts, sets, goals })
    expect(of(r.findings, 'pace').map((f) => [f.goalId, f.status, f.severity])).toEqual([
      [2, 'behind', 'warning'],
      [1, 'on-track', 'success'],
      [3, 'achieved', 'success']
    ])
    // Sin nombre, el del ejercicio.
    expect(of(r.findings, 'pace')[2]).toMatchObject({ goalName: 'Press banca', projected: null })
  })

  it('sin fecha propia usa la del evento al que va unido; sin fecha ni evento, nada', () => {
    const goals = [goal(1, { type: 'E1RM', exerciseId: 1, targetValue: 200, eventId: 7 }), goal(2, { type: 'E1RM', exerciseId: 1, targetValue: 200 })]
    const f = of(review({ exercises, workouts, sets, goals, events: [event] }).findings, 'pace')
    expect(f.map((x) => [x.goalId, x.deadline, x.eventName])).toEqual([[1, '2027-03-20', 'HYROX Madrid']])
  })

  it('sin proyección (pocas semanas), con fecha pasada, abandonado o de tipo evento: nada', () => {
    const goals = [
      goal(1, { type: 'E1RM', exerciseId: 1, targetValue: 200, deadline: '2026-11-01' }),
      goal(2, { type: 'E1RM', exerciseId: 1, targetValue: 200, deadline: '2027-03-01', status: 'ABANDONED' }),
      goal(3, { type: 'EVENT', eventId: 7 })
    ]
    expect(of(review({ exercises, workouts, sets, goals, events: [event] }).findings, 'pace')).toEqual([])
    const pocas = [goal(1, { type: 'E1RM', exerciseId: 1, targetValue: 200, deadline: '2027-03-01' })]
    expect(of(review({ exercises, workouts: workouts.slice(2), sets: sets.slice(2), goals: pocas }).findings, 'pace')).toEqual([])
  })

  it('sin evento HYROX no hay hallazgos de HYROX', () => {
    const r = review({ exercises, workouts, sets })
    expect(of(r.findings, 'hyrox')).toEqual([])
    expect(of(r.findings, 'stations')).toEqual([])
    // Un evento sin bloques tampoco es el de la tarjeta HYROX.
    expect(of(review({ exercises, workouts, sets, events: [event] }).findings, 'hyrox')).toEqual([])
  })

  it('con evento y bloques: cuenta atrás, fase y estaciones sin practicar', () => {
    const blocks = [blk(1, '2026-10-26', null, { name: 'Base', eventId: 7 })]
    const ws = [...workouts, wk(9, '2026-11-19T18:00', { kind: 'HYROX' })]
    const ss = [...sets, st(9, 2, null, null, { distanceKm: 1, durationSeconds: 250 })]
    const r = weeklyReview({ ctx: ctxOf({ exercises, workouts: ws, sets: ss, events: [event], blocks }), today: HOY, stations: ['SkiErg', 'Sled Push'] })
    expect(of(r.findings, 'hyrox')[0]).toMatchObject({ eventName: 'HYROX Madrid', daysLeft: 113, weeksLeft: 17, phase: { name: 'Base', week: 5 } })
    expect(of(r.findings, 'stations')[0]).toMatchObject({ severity: 'warning', total: 2, weeks: 3, stale: [{ station: 'Sled Push', lastDate: null }] })
    // Con todas practicadas, un acierto.
    const todas = weeklyReview({ ctx: ctxOf({ exercises, workouts: ws, sets: ss, events: [event], blocks }), today: HOY, stations: ['SkiErg'] })
    expect(of(todas.findings, 'stations')[0]).toMatchObject({ severity: 'success', stale: [] })
  })
})

describe('weeklyReview: récords de la semana', () => {
  const exercises = [1, 2, 3, 4].map((i) => ex(i, { title: `Ejercicio ${i}` }))

  it('uno por ejercicio, el más importante, con cuántos hubo', () => {
    const r = review({
      exercises,
      workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-17T07:00')],
      sets: [st(1, 1, 80, 5), st(2, 1, 85, 5)]
    })
    const [f] = of(r.findings, 'record')
    expect(f).toMatchObject({ exerciseId: 1, type: 'peso-maximo', value: 85, previous: 80, workoutId: 2, date: '2026-11-17' })
    expect(f.count).toBeGreaterThan(1)
    expect(of(r.findings, 'record')).toHaveLength(1)
  })

  it('igualar no es récord, los de otras semanas no salen y como mucho 3', () => {
    expect(of(review({ exercises, workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-17T07:00')], sets: [st(1, 1, 80, 5), st(2, 1, 80, 5)] }).findings, 'record')).toEqual([])
    expect(of(review({ exercises, workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-24T07:00')], sets: [st(1, 1, 80, 5), st(2, 1, 90, 5)] }).findings, 'record')).toEqual([])
    const muchos = review({
      exercises,
      workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-17T07:00')],
      sets: [1, 2, 3, 4].flatMap((e) => [st(1, e, 50, 5), st(2, e, 55, 5)])
    })
    expect(of(muchos.findings, 'record').map((f) => f.exerciseId)).toEqual([1, 2, 3])
  })
})

describe('entrenoSuggestions', () => {
  it('convierte la revisión en sugerencias en español, sin escribir nada', async () => {
    const app = await entrenoApp()
    app.ctx.todayOverride = HOY
    const h = app.h
    await h['entreno:routines.save']({ name: 'Torso A', kind: 'GYM' })
    const press = (w: number, kg: number) => [serie('Press banca', 0, 0, { weightKg: kg, reps: 5 }), serie('Press banca', 0, 1, { weightKg: kg - 10, reps: 5, rpe: null })]
    escribir(app.ctx, () =>
      applyHevyWorkouts(app.db, {
        meta: { ...META, rowsTotal: 12 },
        newWorkouts: [
          sesion('Torso A', '2026-10-12T07:00', [...press(1, 100), serie('Remo con barra', 1, 0, { weightKg: 60, reps: 8 })]),
          sesion('Torso A', '2026-10-27T07:00', press(2, 95)),
          sesion('Torso A', '2026-11-03T07:00', press(3, 95)),
          sesion('Torso A', '2026-11-10T07:00', press(4, 95)),
          // Cruza la medianoche: cuenta el martes 17.
          sesion('Torso A', '2026-11-17T23:30', press(5, 95), { endTime: '2026-11-18T00:45' }),
          sesion('Extra', '2026-11-19T18:00', [serie('Remo con barra', 0, 0, { weightKg: 65, reps: 8 })])
        ],
        changedWorkouts: []
      })
    )
    const ev = await h['entreno:events.save']({ name: 'HYROX ficticio', date: '2027-03-20' })
    await h['entreno:blocks.save']({ name: 'Base', startDate: '2026-10-05', endDate: null, plannedGym: 3, plannedSwim: 0, plannedHyrox: 0, plannedRun: 0, plannedOther: 0, eventId: ev.id })
    const pressId = h['entreno:exercises.list']().find((e) => e.title === 'Press banca')!.id
    const remoId = h['entreno:exercises.list']().find((e) => e.title === 'Remo con barra')!.id
    const g = await h['entreno:goals.save']({ name: 'Press a 130', type: 'E1RM', exerciseId: pressId, targetValue: 130, deadline: '2027-03-20' })

    const audit = () => app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n
    const antes = audit()
    const s = entrenoSuggestions(app.ctx)
    expect(audit()).toBe(antes)
    expect(entrenoModule.suggestions).toBe(entrenoSuggestions)

    // Los grupos del catálogo inicial (mínimo 10 por defecto) que no se entrenan no avisan.
    const resto = s
    expect(resto.map((x) => x.id)).toEqual([
      'entreno.review.adherence.2026-11-16',
      `entreno.review.stagnation.${pressId}`,
      `entreno.review.pace.${g.id}`,
      `entreno.review.hyrox.${ev.id}`,
      `entreno.review.record.${remoId}-2026-11-16`
    ])
    for (const x of s) expect(x.module).toBe('entreno')
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length)
    const [adh, est, ritmo, hyrox, rec] = resto
    expect(adh).toMatchObject({
      severity: 'warning',
      title: 'Semana floja: 2 de 3 sesiones',
      detail: 'Hiciste 2 de las 3 sesiones previstas la semana del 16 al 22 de noviembre (67 %). Te faltó: 1 sesión de gimnasio.',
      href: '/entreno/plan',
      asOf: '2026-11-16'
    })
    expect(est).toMatchObject({ severity: 'warning', title: 'Press banca lleva 4 semanas sin mejorar', href: '/entreno/ejercicios?q=Press%20banca' })
    expect(est.detail).toContain('Tu mejor e1RM sigue en 116,7 kg (12/10/2026)')
    expect(est.detail).toContain('con 4 sesiones, lo más alto ha sido 110,8 kg')
    expect(ritmo).toMatchObject({ severity: 'warning', title: 'Objetivo «Press a 130»: a este ritmo no llegas', href: '/entreno/objetivos', asOf: HOY })
    expect(hyrox).toMatchObject({ severity: 'info', title: 'HYROX ficticio: quedan 17 semanas', asOf: HOY })
    expect(hyrox.detail).toContain('fase «Base», semana 8')
    expect(rec).toMatchObject({ severity: 'success', title: 'Récord en Remo con barra', asOf: '2026-11-16' })
    expect(rec.detail).toMatch(/^Peso máximo: 65 kg \(antes 60 kg\), el 19\/11\/2026\./)
    expect(rec.href).toMatch(/^\/entreno\/sesiones\/\d+$/)

    // Cambiar un umbral en los ajustes cambia la revisión (y la caché se invalida al guardar).
    await h['entreno:settings.save']({ reviewStallMinSessions: 5, reviewAdherenceMin: 0.5 })
    const s2 = entrenoSuggestions(app.ctx)
    expect(s2.find((x) => x.id.startsWith('entreno.review.stagnation.'))).toBeUndefined()
    expect(s2[0]).toMatchObject({ severity: 'info', title: '2 de 3 sesiones la semana pasada' })
  })

  it('sin datos no da sugerencias ni falla', async () => {
    const app = await entrenoApp()
    app.ctx.todayOverride = HOY
    expect(entrenoSuggestions(app.ctx)).toEqual([])
  })
})
