// Récords calculados: vigentes por ejercicio y marca "Récord" por sesión.
import { describe, expect, it } from 'vitest'
import { computeRecords, recentRecords, workoutRecordHits } from '../../src/shared/modules/entreno/metrics'
import { ctxOf, ex, st, wk } from './metrics-helpers'

const exercises = [ex(10, { title: 'Press banca' }), ex(11, { title: 'Dominadas', isBodyweight: true, measure: 'REPS' })]

function historial(sinPrimera = false) {
  const workouts = [wk(3, '2026-11-16T07:00'), wk(2, '2026-11-09T07:00'), ...(sinPrimera ? [] : [wk(1, '2026-11-02T07:00')])]
  const sets = [
    st(1, 10, 100, 1, { type: 'warmup' }),
    st(1, 10, 80, 8),
    st(1, 10, 82.5, 5),
    st(1, 11, null, 10),
    st(1, 11, 5, 6),
    st(2, 10, 82.5, 6),
    st(2, 10, 82.4, 10),
    st(2, 10, 80, 8),
    st(2, 11, null, 12),
    st(3, 10, 85, 3),
    st(3, 11, 10, 5)
  ].filter((s) => !sinPrimera || s.workoutId !== 1)
  return ctxOf({ exercises, workouts, sets })
}

describe('récords', () => {
  it('la primera sesión de un ejercicio no se marca, pero sus marcas son récords vigentes', () => {
    const r = computeRecords(historial())
    expect(workoutRecordHits(r, 1)).toEqual([])
    const solo = computeRecords(ctxOf({ exercises, workouts: [wk(1, '2026-11-02T07:00')], sets: [st(1, 10, 60, 5)] }))
    expect(solo.byWorkout).toEqual([])
    expect(solo.current[0].records.map((x) => x.type)).toEqual(['peso-maximo', 'mejor-e1rm', 'volumen-sesion', 'reps-con-peso'])
  })

  it('marca por sesión: reps con el mismo peso exacto, e1RM y volumen', () => {
    const r = computeRecords(historial())
    const hits = workoutRecordHits(r, 2)
    expect(hits.map((h) => [h.exerciseId, h.type, h.weightKg, h.previous])).toEqual([
      [10, 'mejor-e1rm', null, 80 * (1 + 8 / 30)],
      [10, 'volumen-sesion', null, 640 + 412.5],
      [10, 'reps-con-peso', 82.5, 5],
      [11, 'reps-peso-corporal', null, 10]
    ])
    expect(hits[0].value).toBeCloseTo(82.4 * (1 + 10 / 30), 10)
    expect(hits[1].value).toBe(495 + 824 + 640)
    expect(hits[2].value).toBe(6)
  })

  it('82,4 kg no es 82,5 kg: la primera vez con un peso no es récord de reps', () => {
    const r = computeRecords(historial())
    expect(workoutRecordHits(r, 2).some((h) => h.weightKg === 82.4)).toBe(false)
    const reps = r.current.find((c) => c.exerciseId === 10)!.records.filter((x) => x.type === 'reps-con-peso')
    expect(reps.map((x) => [x.weightKg, x.value, x.workoutId])).toEqual([
      [80, 8, 1],
      [82.4, 10, 2],
      [82.5, 6, 2],
      [85, 3, 3]
    ])
  })

  it('igualar una marca no es récord; el calentamiento no cuenta como peso máximo', () => {
    const r = computeRecords(historial())
    // En la sesión 1 hubo 100 kg de calentamiento: el peso máximo vigente es 85 (sesión 3).
    const pm = r.current.find((c) => c.exerciseId === 10)!.records.find((x) => x.type === 'peso-maximo')!
    expect(pm).toMatchObject({ value: 85, workoutId: 3, date: '2026-11-16' })
    // 80 × 8 se repite en la sesión 2: sin récord con 80 kg.
    expect(workoutRecordHits(r, 2).some((h) => h.weightKg === 80)).toBe(false)
  })

  it('peso corporal: más reps y más lastre', () => {
    const r = computeRecords(historial())
    expect(workoutRecordHits(r, 3).map((h) => [h.exerciseId, h.type, h.value, h.previous])).toEqual([
      [10, 'peso-maximo', 85, 82.5],
      [11, 'lastre-maximo', 10, 5]
    ])
    const bw = r.current.find((c) => c.exerciseId === 11)!.records
    expect(bw.map((x) => [x.type, x.value, x.workoutId])).toEqual([
      ['reps-peso-corporal', 12, 2],
      ['lastre-maximo', 10, 3]
    ])
  })

  it('el historial se recorre en orden aunque las sesiones lleguen desordenadas, y borrar recalcula', () => {
    const r = computeRecords(historial())
    expect(r.byWorkout.map((w) => w.workoutId)).toEqual([2, 3])
    const sin = computeRecords(historial(true))
    // Sin la sesión 1, la 2 pasa a ser la primera: ya no tiene marca.
    expect(sin.byWorkout.map((w) => w.workoutId)).toEqual([3])
  })

  it('récords recientes: del más nuevo al más antiguo', () => {
    const r = computeRecords(historial())
    expect(recentRecords(r, 3).map((h) => [h.workoutId, h.type])).toEqual([
      [3, 'peso-maximo'],
      [3, 'lastre-maximo'],
      [2, 'mejor-e1rm']
    ])
  })

  it('series sin peso ni reps no generan récords', () => {
    const r = computeRecords(
      ctxOf({ exercises, workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-09T07:00')], sets: [st(1, 10, null, null), st(2, 10, null, 5)] })
    )
    expect(r.byWorkout).toEqual([])
    expect(r.current).toEqual([{ exerciseId: 10, records: [] }])
  })
})
