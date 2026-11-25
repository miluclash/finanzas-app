// Progreso de objetivos y proyección (regresión lineal sobre semanas con datos).
import { describe, expect, it } from 'vitest'
import { goalProgress, goalsProgress, linearRegression, projectSeries } from '../../src/shared/modules/entreno/metrics'
import { ctxOf, ex, goal, grp, st, wk } from './metrics-helpers'

const exercises = [ex(10, { primaryGroupId: 1 }), ex(11, { isBodyweight: true, primaryGroupId: 1 })]
const groups = [grp(1, 'Pecho')]
// Con Brzycki y 1 repetición, el e1RM es el peso: así las cuentas salen redondas.
const BRZ = { e1rmFormula: 'BRZYCKI' as const }

/** Una sesión por fecha con una serie de `peso` × 1 del ejercicio 10. */
function e1rmCtx(points: [string, number][], s: object = {}) {
  return ctxOf(
    {
      exercises,
      workouts: points.map(([d], i) => wk(i + 1, `${d}T07:00`)),
      sets: points.map(([, w], i) => st(i + 1, 10, w, 1))
    },
    { ...BRZ, ...s }
  )
}

describe('regresión lineal', () => {
  it('mínimos cuadrados con resultado conocido', () => {
    expect(linearRegression([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])).toEqual({ slope: 2, intercept: 1 })
    const f = linearRegression([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 2 }])!
    expect(f.slope).toBeCloseTo(0.6, 10)
    expect(f.intercept).toBeCloseTo(0.1, 10)
    expect(linearRegression([{ x: 1, y: 1 }])).toBeNull()
    expect(linearRegression([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull()
  })
})

describe('objetivo de e1RM', () => {
  it('proyección conocida a la fecha límite', () => {
    const ctx = e1rmCtx([
      ['2026-11-02', 100],
      ['2026-11-09', 102],
      ['2026-11-16', 104]
    ])
    const p = goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 110, deadline: '2026-11-30' }), '2026-11-25')
    expect(p.series.map((x) => x.value)).toEqual([100, 102, 104])
    expect(p.current).toBe(104)
    expect(p.pct).toBeCloseTo(104 / 110, 10)
    expect(p.achieved).toBe(false)
    expect(p.projection!.value).toBeCloseTo(108, 10)
    expect(p.projection!.slopePerWeek).toBeCloseTo(2, 10)
    expect(p.projection!.date).toBe('2026-11-30')
    expect(p.projection!.line).toEqual([
      { date: '2026-11-02', value: expect.closeTo(100, 10) },
      { date: '2026-11-30', value: expect.closeTo(108, 10) }
    ])
    expect(p.projectionReason).toBeNull()
  })

  it('las semanas vacías no cuentan y el eje x son las semanas reales', () => {
    // Sin la semana del 9/11: x = 0, 2, 3. Con índices consecutivos la pendiente sería 3, no 2.
    const ctx = e1rmCtx([
      ['2026-11-02', 100],
      ['2026-11-16', 104],
      ['2026-11-23', 106]
    ])
    const p = goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 120, deadline: '2026-12-07' }), '2026-11-25')
    expect(p.projection!.weeksUsed).toEqual(['2026-11-02', '2026-11-16', '2026-11-23'])
    expect(p.projection!.slopePerWeek).toBeCloseTo(2, 10)
    expect(p.projection!.value).toBeCloseTo(110, 10)
  })

  it('solo las últimas trendWeeks semanas con datos (las vacías no completan las N)', () => {
    const ctx = e1rmCtx(
      [
        ['2026-09-07', 300],
        ['2026-09-14', 10],
        ['2026-10-26', 100],
        ['2026-11-09', 101],
        ['2026-11-23', 102]
      ],
      { trendWeeks: 3 }
    )
    const p = goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 120, deadline: '2026-12-21' }), '2026-11-25')
    expect(p.projection!.weeksUsed).toEqual(['2026-10-26', '2026-11-09', '2026-11-23'])
    // 1 kg cada 2 semanas; del 26/10 al 21/12 son 8 semanas → 104.
    expect(p.projection!.value).toBeCloseTo(104, 10)
    expect(p.best).toBe(300)
  })

  it('con menos de 3 semanas con datos no hay proyección', () => {
    const ctx = e1rmCtx([
      ['2026-11-02', 100],
      ['2026-11-02', 101],
      ['2026-11-16', 104]
    ])
    const p = goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 110, deadline: '2026-12-31' }), '2026-11-25')
    expect(p.series).toHaveLength(2)
    expect(p.projection).toBeNull()
    expect(p.projectionReason).toBe('pocos-datos')
  })

  it('sin fecha límite o con la fecha pasada no se proyecta', () => {
    const ctx = e1rmCtx([
      ['2026-11-02', 100],
      ['2026-11-09', 102],
      ['2026-11-16', 104]
    ])
    expect(goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 110 }), '2026-11-25').projectionReason).toBe('sin-fecha-limite')
    expect(goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 110, deadline: '2026-11-20' }), '2026-11-25').projectionReason).toBe(
      'fecha-pasada'
    )
  })

  it('cumplido cuando la mejor semana llega al objetivo (para proponer marcarlo)', () => {
    const ctx = e1rmCtx([
      ['2026-11-02', 111],
      ['2026-11-09', 100]
    ])
    const p = goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 110 }), '2026-11-25')
    expect(p.achieved).toBe(true)
    expect(p.current).toBe(100)
  })

  it('los datos posteriores a hoy no entran', () => {
    const ctx = e1rmCtx([
      ['2026-11-02', 100],
      ['2026-12-07', 130]
    ])
    expect(goalProgress(ctx, goal(1, { type: 'E1RM', exerciseId: 10, targetValue: 120 }), '2026-11-25')).toMatchObject({ current: 100, achieved: false })
  })
})

describe('objetivo de peso × repeticiones', () => {
  it('mejor peso con al menos esas reps; logrado si una serie llega a las dos cosas', () => {
    const ctx = ctxOf({
      exercises,
      workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-09T07:00')],
      sets: [st(1, 10, 100, 4), st(1, 10, 95, 6), st(1, 10, 120, 1, { type: 'warmup' }), st(2, 10, 100, 5)]
    })
    const g = goal(1, { type: 'WEIGHT_REPS', exerciseId: 10, targetValue: 100, targetReps: 5 })
    const p = goalProgress(ctx, g, '2026-11-25')
    expect(p.series).toEqual([
      { weekKey: '2026-11-02', value: 95 },
      { weekKey: '2026-11-09', value: 100 }
    ])
    expect(p.achieved).toBe(true)
    expect(goalProgress(ctx, g, '2026-11-08').achieved).toBe(false)
  })
})

describe('objetivo de volumen semanal', () => {
  it('por grupo: series efectivas; la semana en curso no entra en la tendencia', () => {
    const weeks = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']
    const counts = [10, 12, 14, 2]
    const ctx = ctxOf({
      groups,
      exercises,
      workouts: weeks.map((d, i) => wk(i + 1, `${d}T07:00`)),
      sets: weeks.flatMap((_, i) => Array.from({ length: counts[i] }, () => st(i + 1, 10, 50, 10)))
    })
    const p = goalProgress(ctx, goal(1, { type: 'WEEKLY_VOLUME', groupId: 1, targetValue: 16, deadline: '2026-11-30' }), '2026-11-25')
    expect(p.unit).toBe('series')
    expect(p.series.map((x) => x.value)).toEqual([10, 12, 14, 2])
    expect(p.projection!.weeksUsed).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
    expect(p.projection!.value).toBeCloseTo(18, 10)
  })

  it('por ejercicio: kg de la semana (y reps si es de peso corporal)', () => {
    const ctx = ctxOf({
      exercises,
      workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-04T07:00')],
      sets: [st(1, 10, 100, 5), st(2, 10, 100, 5), st(1, 11, null, 10)]
    })
    const kg = goalProgress(ctx, goal(1, { type: 'WEEKLY_VOLUME', exerciseId: 10, targetValue: 2000 }), '2026-11-25')
    expect(kg).toMatchObject({ unit: 'kg', current: 1000, pct: 0.5 })
    const reps = goalProgress(ctx, goal(2, { type: 'WEEKLY_VOLUME', exerciseId: 11, targetValue: 20 }), '2026-11-25')
    expect(reps).toMatchObject({ unit: 'reps', current: 10 })
  })
})

describe('objetivo de frecuencia', () => {
  it('por tipo de sesión: sesiones por semana (las semanas sin ninguna no son 0)', () => {
    const ctx = ctxOf({
      workouts: [
        wk(1, '2026-11-02T07:00', { kind: 'SWIM' }),
        wk(2, '2026-11-04T07:00', { kind: 'SWIM' }),
        wk(3, '2026-11-05T07:00'),
        wk(4, '2026-11-16T07:00', { kind: 'SWIM' })
      ]
    })
    const p = goalProgress(ctx, goal(1, { type: 'FREQUENCY', kind: 'SWIM', targetValue: 2 }), '2026-11-25')
    expect(p.series).toEqual([
      { weekKey: '2026-11-02', value: 2 },
      { weekKey: '2026-11-16', value: 1 }
    ])
    expect(p).toMatchObject({ unit: 'sesiones', current: 1, pct: 0.5, achieved: true })
  })

  it('por grupo: días por semana', () => {
    const ctx = ctxOf({
      groups,
      exercises,
      workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-02T19:00'), wk(3, '2026-11-04T07:00')],
      sets: [st(1, 10, 50, 10), st(2, 10, 50, 10), st(3, 10, 50, 10)]
    })
    expect(goalProgress(ctx, goal(1, { type: 'FREQUENCY', groupId: 1, targetValue: 3 }), '2026-11-25')).toMatchObject({ unit: 'dias', current: 2 })
  })
})

describe('objetivo de evento y lista', () => {
  it('evento: cuenta atrás, sin serie ni proyección', () => {
    const ctx = ctxOf({ events: [{ id: 1, name: 'Carrera ficticia', date: '2027-03-20' }] })
    const p = goalProgress(ctx, goal(1, { type: 'EVENT', eventId: 1 }), '2026-11-25')
    expect(p.countdown).toEqual({ date: '2027-03-20', daysLeft: 115, weeksLeft: 17, isPast: false })
    expect(p.projection).toBeNull()
    expect(p.series).toEqual([])
  })

  it('por defecto solo los activos', () => {
    const ctx = ctxOf({
      goals: [goal(1, { type: 'E1RM', exerciseId: 10 }), goal(2, { type: 'E1RM', exerciseId: 10, status: 'ACHIEVED' })]
    })
    expect(goalsProgress(ctx, '2026-11-25').map((g) => g.goalId)).toEqual([1])
    expect(goalsProgress(ctx, '2026-11-25', true)).toHaveLength(2)
  })

  it('projectSeries ignora el orden de entrada', () => {
    const r = projectSeries(
      [
        { weekKey: '2026-11-16', value: 104 },
        { weekKey: '2026-11-02', value: 100 },
        { weekKey: '2026-11-09', value: 102 }
      ],
      '2026-11-30',
      '2026-11-25',
      6
    )
    expect(r.projection!.value).toBeCloseTo(108, 10)
  })
})
