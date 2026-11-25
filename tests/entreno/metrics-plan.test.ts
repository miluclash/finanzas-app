// Plan de la semana (guardado o boceto), adherencia sin compensación, constancia, semana resuelta
// y próxima sesión.
import { describe, expect, it } from 'vitest'
import {
  type BaseWeekEntryFact,
  type MetricsFacts,
  adherenceWeekly,
  buildInicio,
  buildSummary,
  computeRecords,
  consistencyMap,
  nextSession,
  planForWeek,
  plannedForWeek,
  resolveWeek,
  slotsForDate,
  weekAdherence
} from '../../src/shared/modules/entreno/metrics'
import { blk, ctxOf, ex, rt, st, wk } from './metrics-helpers'

const routines = [rt(1, 'Fuerza A', 'GYM'), rt(2, 'Fuerza B', 'GYM'), rt(3, 'Natación', 'SWIM')]
// Boceto: lunes Fuerza A 07:00, martes Natación 19:00, jueves Fuerza B, sábado Natación.
const baseWeek: BaseWeekEntryFact[] = [
  { weekday: 1, order: 0, routineId: 1, time: '07:00' },
  { weekday: 2, order: 0, routineId: 3, time: '19:00' },
  { weekday: 4, order: 0, routineId: 2, time: null },
  { weekday: 6, order: 0, routineId: 3, time: null }
]
const base = (p: Partial<MetricsFacts> = {}) => ctxOf({ routines, baseWeek, ...p })

describe('plan de la semana', () => {
  it('una semana sin plan guardado usa el boceto en sus fechas', () => {
    const p = planForWeek(base(), '2026-11-25')
    expect(p.source).toBe('boceto')
    expect(p.slots.map((s) => [s.date, s.routineName, s.kind, s.time])).toEqual([
      ['2026-11-23', 'Fuerza A', 'GYM', '07:00'],
      ['2026-11-24', 'Natación', 'SWIM', '19:00'],
      ['2026-11-26', 'Fuerza B', 'GYM', null],
      ['2026-11-28', 'Natación', 'SWIM', null]
    ])
  })

  it('una semana guardada usa su plan, aunque esté vacía', () => {
    const ctx = base({
      savedWeeks: [
        { weekStart: '2026-11-30', slots: [{ date: '2026-12-02', order: 0, routineId: 1, time: '08:00' }] },
        { weekStart: '2026-12-07', slots: [] }
      ]
    })
    const p = planForWeek(ctx, '2026-12-01')
    expect(p.source).toBe('semana')
    expect(p.slots.map((s) => [s.date, s.routineId])).toEqual([['2026-12-02', 1]])
    expect(planForWeek(ctx, '2026-12-08')).toMatchObject({ source: 'semana', slots: [] })
  })

  it('las semanas anteriores al primer boceto no tienen plan', () => {
    const ctx = base({ baseFirstSavedOn: '2026-11-20' })
    expect(planForWeek(ctx, '2026-11-10').source).toBe('ninguno')
    expect(planForWeek(ctx, '2026-11-17').source).toBe('boceto')
  })
})

describe('adherencia', () => {
  it('dos sesiones del mismo tipo de entreno cuentan las dos', () => {
    const ctx = ctxOf({
      routines,
      savedWeeks: [
        {
          weekStart: '2026-11-23',
          slots: [
            { date: '2026-11-23', order: 0, routineId: 1, time: null },
            { date: '2026-11-26', order: 0, routineId: 1, time: null }
          ]
        }
      ],
      workouts: [wk(1, '2026-11-23T07:00', { routineId: 1 }), wk(2, '2026-11-24T07:00', { routineId: 1 })]
    })
    expect(weekAdherence(ctx, '2026-11-23')).toMatchObject({ planned: 2, done: 2, pct: 1, source: 'semana' })
    const week = resolveWeek(ctx, '2026-11-23', '2026-11-25')
    expect(week.slots.map((s) => [s.date, s.doneWorkoutId, s.doneDate])).toEqual([
      ['2026-11-23', 1, '2026-11-23'],
      ['2026-11-26', 2, '2026-11-24']
    ])
  })

  it('cada semana va aparte: lo que falta no se compensa la semana siguiente y nunca pasa del 100 %', () => {
    const ctx = base({
      workouts: [
        // Semana 16/11: 1 de 2 de gimnasio, 2 de 2 de natación.
        wk(1, '2026-11-16T07:00', { routineId: 1 }),
        wk(2, '2026-11-17T19:00', { kind: 'SWIM' }),
        wk(3, '2026-11-21T10:00', { kind: 'SWIM' }),
        // Semana 23/11: Fuerza A el lunes, Fuerza B el martes (cumple la del jueves), un gimnasio sin
        // tipo de entreno el jueves (su hueco ya está cumplido: sobra), ninguna natación y una carrera.
        wk(4, '2026-11-23T07:00', { routineId: 1 }),
        wk(5, '2026-11-24T07:00', { routineId: 2 }),
        wk(6, '2026-11-26T07:00'),
        wk(7, '2026-11-27T07:00', { kind: 'RUN' })
      ]
    })
    const [a, b] = adherenceWeekly(ctx, ['2026-11-16', '2026-11-23'])
    expect(a.byKind).toEqual([
      { kind: 'GYM', planned: 2, done: 1, pct: 0.5 },
      { kind: 'SWIM', planned: 2, done: 2, pct: 1 }
    ])
    expect(a.pct).toBe(0.75)
    expect(b.byKind).toEqual([
      { kind: 'GYM', planned: 2, done: 2, pct: 1 },
      { kind: 'SWIM', planned: 2, done: 0, pct: 0 }
    ])
    // El gimnasio de más no tapa la natación que falta, ni la semana anterior.
    expect(b.done).toBe(2)
    expect(b.pct).toBe(0.5)
    expect(b.extra).toBe(2)
    for (const w of [a, b]) expect(w.pct!).toBeLessThanOrEqual(1)
  })

  it('caso de la revisión: sesiones sin tipo de entreno en días sin hueco de su tipo no cumplen nada', () => {
    // Plan: Fuerza A el lunes y Fuerza B el jueves (las dos GYM). Dos GYM sin tipo de entreno martes y miércoles.
    const ctx = ctxOf({
      routines,
      savedWeeks: [
        {
          weekStart: '2026-11-23',
          slots: [
            { date: '2026-11-23', order: 0, routineId: 1, time: null },
            { date: '2026-11-26', order: 0, routineId: 2, time: null }
          ]
        }
      ],
      workouts: [wk(1, '2026-11-24T07:00'), wk(2, '2026-11-25T07:00')]
    })
    const a = weekAdherence(ctx, '2026-11-23')
    expect(a).toMatchObject({ planned: 2, done: 0, pct: 0, extra: 2 })
    expect(a.byKind).toEqual([{ kind: 'GYM', planned: 2, done: 0, pct: 0 }])
    const w = resolveWeek(ctx, '2026-11-23', '2026-11-25')
    expect(w.days.map((d) => d.status)).toEqual(['sin-hacer', 'hecha', 'hecha', 'planificada', 'descanso', 'descanso', 'descanso'])
    expect(w.slots.every((sl) => sl.doneWorkoutId == null)).toBe(true)
    // Inicio y Resumen dan la misma cifra, y coincide con los huecos cumplidos de la semana resuelta.
    const r = computeRecords(ctx)
    const inicio = buildInicio(ctx, r, '2026-11-25')
    const resumen = buildSummary(ctx, r, '2026-11-25')
    const ultima = resumen.adherence.weeks[resumen.adherence.weeks.length - 1]
    expect([inicio.week.done, inicio.week.planned]).toEqual([0, 2])
    expect([ultima.done, ultima.planned]).toEqual([0, 2])
    expect(resumen.week.slots.filter((sl) => sl.doneWorkoutId != null)).toHaveLength(0)
    // El mismo GYM sin tipo hecho el lunes sí cumple la Fuerza A del lunes.
    const lunes = ctxOf({ routines, savedWeeks: ctx.facts.savedWeeks, workouts: [wk(1, '2026-11-23T07:00')] })
    expect(weekAdherence(lunes, '2026-11-23')).toMatchObject({ done: 1, extra: 0 })
  })

  it('sin plan de semana ni boceto, se usa lo previsto del bloque', () => {
    const ctx = ctxOf({
      blocks: [blk(1, '2026-11-02', '2026-12-27', { plannedByKind: { GYM: 4, SWIM: 2 } })],
      workouts: [1, 2, 3, 4, 5].map((i) => wk(i, `2026-11-${String(9 + i).padStart(2, '0')}T07:00`)).concat([wk(9, '2026-11-12T19:00', { kind: 'SWIM' })])
    })
    expect(plannedForWeek(ctx, '2026-11-09')).toEqual({ source: 'bloque', byKind: { GYM: 4, SWIM: 2 } })
    const a = weekAdherence(ctx, '2026-11-09')
    expect(a).toMatchObject({ planned: 6, done: 5, source: 'bloque' })
    expect(a.pct).toBeCloseTo(5 / 6, 10)
  })

  it('una semana sin nada previsto no tiene adherencia (ni 0 ni 100)', () => {
    const ctx = ctxOf({ workouts: [wk(1, '2026-11-23T07:00')] })
    expect(weekAdherence(ctx, '2026-11-23')).toMatchObject({ planned: 0, pct: null, extra: 1, source: 'ninguno' })
    const vacia = base({ savedWeeks: [{ weekStart: '2026-11-23', slots: [] }] })
    expect(weekAdherence(vacia, '2026-11-23').pct).toBeNull()
  })
})

describe('semana resuelta y próxima sesión', () => {
  it('estado de cada día respecto a hoy', () => {
    const ctx = base({ workouts: [wk(1, '2026-11-23T07:10', { routineId: 1 })] })
    const w = resolveWeek(ctx, '2026-11-25', '2026-11-25')
    expect(w.source).toBe('boceto')
    expect(w.days.map((d) => d.status)).toEqual(['hecha', 'sin-hacer', 'hoy', 'planificada', 'descanso', 'planificada', 'descanso'])
    expect(w.days[2].isToday).toBe(true)
    expect(w.next).toMatchObject({ date: '2026-11-26', routineName: 'Fuerza B', isToday: false })
  })

  it('próxima sesión: hoy si aún no está hecha, y la siguiente si ya lo está (con hora)', () => {
    const sinHacer = base()
    expect(nextSession(sinHacer, '2026-11-24')).toMatchObject({ date: '2026-11-24', routineId: 3, time: '19:00', isToday: true })
    const hecha = base({ workouts: [wk(1, '2026-11-24T19:05', { kind: 'SWIM' })] })
    expect(nextSession(hecha, '2026-11-24')).toMatchObject({ date: '2026-11-26', routineId: 2, isToday: false })
    expect(resolveWeek(hecha, '2026-11-24', '2026-11-24').days[1].status).toBe('hecha')
  })

  it('una sesión hecha otro día cumple su hueco y aparece donde se hizo', () => {
    // Fuerza B (jueves) hecha el miércoles.
    const ctx = base({ workouts: [wk(1, '2026-11-25T18:00', { routineId: 2 })] })
    const w = resolveWeek(ctx, '2026-11-25', '2026-11-25')
    expect(w.days[2]).toMatchObject({ status: 'hecha' })
    expect(w.days[2].workouts.map((x) => x.id)).toEqual([1])
    expect(w.days[3]).toMatchObject({ status: 'descanso' })
    expect(w.days[3].slots[0]).toMatchObject({ doneWorkoutId: 1, doneDate: '2026-11-25' })
    expect(w.next).toMatchObject({ date: '2026-11-28', routineId: 3 })
  })

  it('sin tipo de entreno, cuenta el tipo de sesión del mismo día', () => {
    const ctx = base({ workouts: [wk(1, '2026-11-23T07:00'), wk(2, '2026-11-24T07:00')] })
    const w = resolveWeek(ctx, '2026-11-23', '2026-11-29')
    // El gimnasio del martes no cumple la natación del martes ni la Fuerza B del jueves (otro día, sin tipo de entreno).
    expect(w.slots.map((s) => s.doneWorkoutId)).toEqual([1, null, null, null])
    expect(w.days.map((d) => d.status)).toEqual(['hecha', 'hecha', 'descanso', 'sin-hacer', 'descanso', 'sin-hacer', 'hoy'])
  })

  it('la próxima sesión salta a la semana siguiente (y a su plan guardado)', () => {
    const ctx = base({
      savedWeeks: [{ weekStart: '2026-11-30', slots: [{ date: '2026-12-03', order: 0, routineId: 2, time: '18:30' }] }]
    })
    expect(nextSession(ctx, '2026-11-29')).toMatchObject({ date: '2026-12-03', routineName: 'Fuerza B', time: '18:30' })
  })

  it('sin boceto ni planes no hay próxima sesión', () => {
    expect(nextSession(ctxOf({ routines }), '2026-11-25')).toBeNull()
  })

  it('¿qué me toca? para una fecha', () => {
    const ctx = base()
    expect(slotsForDate(ctx, '2026-11-26').map((s) => [s.routineName, s.doneWorkoutId])).toEqual([['Fuerza B', null]])
    expect(slotsForDate(ctx, '2026-11-27')).toEqual([])
    expect(nextSession(ctx, '2026-11-27')).toMatchObject({ date: '2026-11-28', routineName: 'Natación' })
  })
})

describe('constancia', () => {
  it('12 semanas, 0–3 por día según series que cuentan, null en días futuros', () => {
    const ctx = ctxOf({
      exercises: [ex(10)],
      workouts: [wk(1, '2026-11-23T07:00'), wk(2, '2026-11-24T07:00'), wk(3, '2026-11-25T07:00'), wk(4, '2026-09-07T07:00')],
      sets: [
        ...Array.from({ length: 6 }, () => st(1, 10, 50, 10)),
        ...Array.from({ length: 2 }, () => st(2, 10, 50, 10)),
        ...Array.from({ length: 4 }, () => st(3, 10, 50, 10)),
        st(4, 10, 20, 10, { type: 'warmup' })
      ]
    })
    const m = consistencyMap(ctx, '2026-11-25')
    expect(m.start).toBe('2026-09-07')
    expect(m.days).toHaveLength(84)
    expect(m.days[0]).toBe(1) // sesión solo con calentamiento
    expect(m.days[1]).toBe(0)
    expect(m.days.slice(77, 84)).toEqual([3, 1, 2, null, null, null, null])
  })
})
