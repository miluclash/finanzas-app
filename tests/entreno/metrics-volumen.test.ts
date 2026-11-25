// e1RM, series que cuentan, volúmenes, series efectivas, frecuencia, densidad, RPE y natación.
import { describe, expect, it } from 'vitest'
import {
  bodyweightVolume,
  e1rm,
  effectiveSetsByGroup,
  effectiveSetsWeekly,
  groupFrequency,
  internalLoadWeekly,
  loadVolume,
  rpeByExerciseWeek,
  sessionsWeekly,
  swimWeekly,
  workoutStats
} from '../../src/shared/modules/entreno/metrics'
import { SETTINGS, ctxOf, ex, grp, st, wk } from './metrics-helpers'

const groups = [grp(1, 'Pecho'), grp(2, 'Tríceps', 2, 4), grp(3, 'Hombro'), grp(4, 'Espalda')]
const exercises = [
  ex(10, { title: 'Press banca', primaryGroupId: 1, secondaryGroupIds: [2, 3] }),
  ex(11, { title: 'Fondos', isBodyweight: true, measure: 'REPS', primaryGroupId: 2, secondaryGroupIds: [1] }),
  ex(12, { title: 'Remo', primaryGroupId: 4 }),
  ex(13, { title: 'Crol', category: 'SWIM', measure: 'DISTANCE_DURATION' }),
  ex(14, { title: 'Sin grupo' })
]

function datos() {
  return ctxOf({
    groups,
    exercises,
    workouts: [
      wk(1, '2026-11-23T07:00', { endTime: '2026-11-23T08:00' }),
      wk(2, '2026-11-25T18:00', { endTime: '2026-11-25T18:30' }),
      wk(3, '2026-11-24T19:00', { kind: 'SWIM', endTime: '2026-11-24T19:45' }),
      wk(4, '2026-12-01T07:00', { kind: 'SWIM' }),
      wk(5, '2026-12-02T07:00')
    ],
    sets: [
      st(1, 10, 40, 10, { type: 'warmup', rpe: 5 }),
      st(1, 10, 100, 5, { rpe: 8 }),
      st(1, 10, 100, 5, { rpe: 9, type: 'failure' }),
      st(1, 11, null, 12),
      st(1, 11, 10, 8),
      st(1, 12, 60, 10),
      st(2, 10, 102.5, 3),
      st(3, 13, null, 4, { distanceKm: 0.2 }),
      st(3, 13, null, 2),
      st(3, 13, null, 1, { distanceKm: 0.1, type: 'warmup' }),
      st(4, 13, null, 6),
      // Ejercicio sin peso (solo reps) y ejercicio que no está en el catálogo.
      st(5, 14, null, 10),
      st(5, 99, 20, 10)
    ]
  })
}

describe('e1RM', () => {
  it('Epley 100 kg × 5 = 116,7 (sin redondear al calcular)', () => {
    const v = e1rm(100, 5, SETTINGS)!
    expect(v).toBeCloseTo(116.6667, 4)
    expect(v.toFixed(1)).toBe('116.7')
  })

  it('Brzycki 100 kg × 5 = 112,5', () => {
    expect(e1rm(100, 5, { ...SETTINGS, e1rmFormula: 'BRZYCKI' })).toBeCloseTo(112.5, 10)
    expect(e1rm(100, 1, { ...SETTINGS, e1rmFormula: 'BRZYCKI' })).toBeCloseTo(100, 10)
  })

  it('fuera de 1–12 repeticiones, sin peso o sin reps no hay e1RM', () => {
    expect(e1rm(100, 13, SETTINGS)).toBeNull()
    expect(e1rm(100, 0, SETTINGS)).toBeNull()
    expect(e1rm(100, 12, SETTINGS)).toBeCloseTo(140, 10)
    expect(e1rm(null, 5, SETTINGS)).toBeNull()
    expect(e1rm(0, 5, SETTINGS)).toBeNull()
    expect(e1rm(100, null, SETTINGS)).toBeNull()
  })

  it('el límite de repeticiones sale de los ajustes', () => {
    expect(e1rm(100, 8, { ...SETTINGS, e1rmMaxReps: 6 })).toBeNull()
    expect(e1rm(100, 2, { ...SETTINGS, e1rmMinReps: 3 })).toBeNull()
  })
})

describe('volumen', () => {
  it('los calentamientos no cuentan y el peso corporal va aparte', () => {
    const ctx = datos()
    expect(loadVolume(ctx, 'workout', { workoutId: 1 })).toEqual([{ key: '1', value: 1600 }])
    expect(bodyweightVolume(ctx, 'workout', { workoutId: 1 })).toEqual([{ key: '1', value: 20 }])
  })

  it('si los calentamientos se marcan como que cuentan, suman', () => {
    const ctx = ctxOf({ exercises, workouts: [wk(1, '2026-11-23T07:00')], sets: [st(1, 10, 40, 10, { type: 'warmup' }), st(1, 10, 100, 5)] }, {
      countedSetTypes: ['normal', 'warmup']
    })
    expect(loadVolume(ctx, 'week')).toEqual([{ key: '2026-11-23', value: 900 }])
  })

  it('por ejercicio, grupo principal, semana y mes', () => {
    const ctx = datos()
    expect(loadVolume(ctx, 'exercise')).toEqual([
      { key: '10', value: 1000 + 307.5 },
      { key: '12', value: 600 },
      { key: '99', value: 200 }
    ])
    expect(loadVolume(ctx, 'muscleGroup')).toEqual([
      { key: '1', value: 1307.5 },
      { key: '4', value: 600 }
    ])
    expect(loadVolume(ctx, 'week')).toEqual([
      { key: '2026-11-23', value: 1907.5 },
      { key: '2026-11-30', value: 200 }
    ])
    expect(loadVolume(ctx, 'month')).toEqual([
      { key: '2026-11', value: 1907.5 },
      { key: '2026-12', value: 200 }
    ])
  })

  it('un ejercicio renombrado (alias) sigue siendo el mismo id y suma junto', () => {
    // En la base el alias ya apunta al mismo exerciseId: dos sesiones con títulos de Hevy distintos.
    const ctx = ctxOf({ exercises, workouts: [wk(1, '2026-11-02T07:00'), wk(2, '2026-11-09T07:00')], sets: [st(1, 10, 80, 5), st(2, 10, 85, 5)] })
    expect(loadVolume(ctx, 'exercise')).toEqual([{ key: '10', value: 825 }])
  })

  it('ejercicios sin peso no suman kg ni rompen nada', () => {
    const ctx = datos()
    expect(loadVolume(ctx, 'exercise', { exerciseId: 14 })).toEqual([])
    expect(workoutStats(ctx).find((s) => s.workoutId === 5)).toMatchObject({ loadKg: 200, sets: 2, minutes: null, density: null })
  })
})

describe('series efectivas y frecuencia', () => {
  it('principal 1 y secundarios 0,5, con estado según el rango del grupo', () => {
    const ctx = datos()
    const byGroup = Object.fromEntries(effectiveSetsByGroup(ctx, '2026-11-23').map((g) => [g.name, g]))
    // Pecho: 3 de press banca + 0,5 × 2 de fondos.
    expect(byGroup['Pecho']).toMatchObject({ sets: 4, status: 'bajo', min: 10, max: 20 })
    // Tríceps: 2 de fondos + 0,5 × 3 de press banca, con rango 2–4.
    expect(byGroup['Tríceps']).toMatchObject({ sets: 3.5, status: 'dentro' })
    expect(byGroup['Hombro'].sets).toBe(1.5)
    expect(byGroup['Espalda'].sets).toBe(1)
  })

  it('el factor de secundarios sale de los ajustes', () => {
    const ctx = ctxOf({ groups, exercises, workouts: [wk(1, '2026-11-23T07:00')], sets: [st(1, 10, 100, 5)] }, { secondaryMuscleFactor: 0.25 })
    const t = effectiveSetsByGroup(ctx, '2026-11-23').find((g) => g.groupId === 2)!
    expect(t.sets).toBe(0.25)
  })

  it('por encima del rango y semanas sin sesiones con 0', () => {
    const many = Array.from({ length: 5 }, () => st(1, 11, null, 10))
    const ctx = ctxOf({ groups, exercises, workouts: [wk(1, '2026-11-23T07:00')], sets: many })
    expect(effectiveSetsByGroup(ctx, '2026-11-23').find((g) => g.groupId === 2)).toMatchObject({ sets: 5, status: 'por-encima' })
    expect(effectiveSetsByGroup(ctx, '2026-11-16').every((g) => g.sets === 0 && g.status === 'bajo')).toBe(true)
    expect(effectiveSetsWeekly(ctx, 2, ['2026-11-16', '2026-11-23'])).toEqual([
      { key: '2026-11-16', value: 0 },
      { key: '2026-11-23', value: 5 }
    ])
  })

  it('frecuencia: días distintos con el grupo como principal', () => {
    const ctx = datos()
    const f = Object.fromEntries(groupFrequency(ctx, '2026-11-23').map((g) => [g.name, g.days]))
    expect(f).toEqual({ Pecho: 2, Tríceps: 1, Hombro: 0, Espalda: 1 })
  })
})

describe('sesiones, duración y densidad', () => {
  it('duración en minutos y kg por minuto', () => {
    const ctx = datos()
    const s1 = workoutStats(ctx).find((s) => s.workoutId === 1)!
    expect(s1.minutes).toBe(60)
    expect(s1.density).toBeCloseTo(1600 / 60, 10)
    expect(s1.sets).toBe(5)
  })

  it('sesiones por semana y tipo, con semanas vacías a 0', () => {
    const ctx = datos()
    expect(sessionsWeekly(ctx, ['2026-11-16', '2026-11-23', '2026-11-30'])).toEqual([
      { key: '2026-11-16', value: 0 },
      { key: '2026-11-23', value: 3 },
      { key: '2026-11-30', value: 2 }
    ])
    expect(sessionsWeekly(ctx, ['2026-11-23'], 'SWIM')).toEqual([{ key: '2026-11-23', value: 1 }])
  })
})

describe('RPE y carga interna', () => {
  it('RPE medio solo con series que tienen RPE (sin calentamientos)', () => {
    const ctx = datos()
    expect(rpeByExerciseWeek(ctx)).toEqual([{ exerciseId: 10, weekKey: '2026-11-23', avgRpe: 8.5, sets: 2 }])
  })

  it('carga interna = Σ series × RPE; sin RPE es null, no 0', () => {
    const ctx = datos()
    expect(internalLoadWeekly(ctx, ['2026-11-23', '2026-11-30'])).toEqual([
      { weekKey: '2026-11-23', load: 17, setsWithRpe: 2 },
      { weekKey: '2026-11-30', load: null, setsWithRpe: 0 }
    ])
  })
})

describe('natación', () => {
  it('sesiones, ejercicios, series y metros (null si no hay distancia)', () => {
    const ctx = datos()
    expect(swimWeekly(ctx, ['2026-11-23', '2026-11-30', '2026-12-07'])).toEqual([
      { weekKey: '2026-11-23', sessions: 1, exercises: 1, sets: 2, meters: 200 },
      { weekKey: '2026-11-30', sessions: 1, exercises: 1, sets: 1, meters: null },
      { weekKey: '2026-12-07', sessions: 0, exercises: 0, sets: 0, meters: null }
    ])
  })
})
