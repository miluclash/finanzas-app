// Registro de métricas: ids estables, contrato y cálculo por agrupación.
import { describe, expect, it } from 'vitest'
import { ENTRENO_CHART_METRICS, ENTRENO_METRICS, computeMetric, getEntrenoMetric } from '../../src/shared/modules/entreno/metrics'
import { ctxOf, ex, grp, rt, st, wk } from './metrics-helpers'

function datos() {
  return ctxOf({
    groups: [grp(1, 'Pecho'), grp(2, 'Tríceps')],
    exercises: [ex(10, { primaryGroupId: 1, secondaryGroupIds: [2] }), ex(13, { category: 'SWIM' }), ex(30, { category: 'CARDIO' })],
    routines: [rt(1, 'Fuerza A', 'GYM')],
    baseWeek: [{ weekday: 1, order: 0, routineId: 1, time: null }],
    workouts: [
      wk(1, '2026-11-23T07:00', { endTime: '2026-11-23T08:00', routineId: 1 }),
      wk(2, '2026-11-25T07:00', { endTime: '2026-11-25T07:30' }),
      wk(3, '2026-11-24T19:00', { kind: 'SWIM' }),
      wk(4, '2026-11-26T07:00', { kind: 'RUN' }),
      wk(5, '2026-11-16T07:00', { kind: 'SWIM' })
    ],
    sets: [
      st(1, 10, 100, 5, { rpe: 8 }),
      st(1, 10, 100, 5, { rpe: 9 }),
      st(1, 10, 50, 10, { type: 'warmup', rpe: 4 }),
      st(2, 10, 90, 10),
      st(3, 13, null, 4, { distanceKm: 0.2 }),
      st(3, 13, null, 4, { distanceKm: 0.3 }),
      st(4, 30, null, null, { distanceKm: 5, durationSeconds: 1500 })
    ]
  })
}

describe('registro de métricas', () => {
  it('ids únicos en kebab, nombres en español y publicados en el núcleo como entreno.<id>', () => {
    const ids = ENTRENO_METRICS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of ENTRENO_METRICS) {
      expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.groupings.length).toBeGreaterThan(0)
    }
    expect(getEntrenoMetric('volumen-carga')!.unit).toBe('kg')
    expect(ENTRENO_CHART_METRICS.map((m) => m.id)).toEqual(ids.map((id) => `entreno.${id}`))
  })

  it('calcula cada métrica con su agrupación', () => {
    const ctx = datos()
    expect(computeMetric(ctx, 'volumen-carga', { groupBy: 'week' })).toEqual([{ key: '2026-11-23', value: 1900 }])
    expect(computeMetric(ctx, 'series', { groupBy: 'workout', kind: 'GYM' })).toEqual([
      { key: '1', value: 2 },
      { key: '2', value: 1 }
    ])
    expect(computeMetric(ctx, 'series-efectivas', { groupBy: 'muscleGroup' })).toEqual([
      { key: '1', value: 3 },
      { key: '2', value: 1.5 }
    ])
    expect(computeMetric(ctx, 'series-efectivas', { groupBy: 'week', groupId: 2 })).toEqual([{ key: '2026-11-23', value: 1.5 }])
    const e = computeMetric(ctx, 'e1rm', { groupBy: 'workout', exerciseId: 10 })
    expect(e.map((b) => b.key)).toEqual(['1', '2'])
    expect(e[0].value).toBeCloseTo(116.6667, 4)
    expect(e[1].value).toBeCloseTo(120, 10)
    expect(computeMetric(ctx, 'peso-maximo', { groupBy: 'week', exerciseId: 10 })).toEqual([{ key: '2026-11-23', value: 100 }])
    expect(computeMetric(ctx, 'sesiones', { groupBy: 'kind' })).toEqual([
      { key: 'GYM', value: 2 },
      { key: 'RUN', value: 1 },
      { key: 'SWIM', value: 2 }
    ])
    expect(computeMetric(ctx, 'frecuencia-grupo', { groupBy: 'week', groupId: 1 })).toEqual([{ key: '2026-11-23', value: 2 }])
    expect(computeMetric(ctx, 'duracion', { groupBy: 'week' })).toEqual([{ key: '2026-11-23', value: 90 }])
    expect(computeMetric(ctx, 'densidad', { groupBy: 'workout' })).toEqual([
      { key: '1', value: 1000 / 60 },
      { key: '2', value: 900 / 30 }
    ])
    expect(computeMetric(ctx, 'rpe-medio', { groupBy: 'exercise' })).toEqual([{ key: '10', value: 8.5 }])
    expect(computeMetric(ctx, 'carga-interna', { groupBy: 'week' })).toEqual([{ key: '2026-11-23', value: 17 }])
    expect(computeMetric(ctx, 'natacion-metros', { groupBy: 'workout' })).toEqual([{ key: '3', value: 500 }])
    expect(computeMetric(ctx, 'carrera-distancia', { groupBy: 'week' })).toEqual([{ key: '2026-11-23', value: 5 }])
  })

  it('adherencia por semana en %, sin pasar de 100', () => {
    const ctx = datos()
    // Boceto con un gimnasio por semana: la del 16/11 tiene 0 de 1 y la del 23/11, 2 de 1 → 100 %.
    expect(computeMetric(ctx, 'adherencia', { groupBy: 'week', from: '2026-11-16', to: '2026-11-29' })).toEqual([
      { key: '2026-11-16', value: 0 },
      { key: '2026-11-23', value: 100 }
    ])
  })

  it('filtro de fechas y errores claros', () => {
    const ctx = datos()
    expect(computeMetric(ctx, 'volumen-carga', { groupBy: 'day', from: '2026-11-24' })).toEqual([{ key: '2026-11-25', value: 900 }])
    expect(() => computeMetric(ctx, 'adherencia', { groupBy: 'month' })).toThrow(/no se puede agrupar/)
    expect(() => computeMetric(ctx, 'no-existe', { groupBy: 'week' })).toThrow(/desconocida/)
  })
})
