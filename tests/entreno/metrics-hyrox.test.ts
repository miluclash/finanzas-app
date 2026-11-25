// Cuenta atrás, HYROX (fases, estaciones y carrera) y volumen semanal con tendencia.
import { describe, expect, it } from 'vitest'
import { eventCountdown, hyroxStatus, weeklyVolumeTrend } from '../../src/shared/modules/entreno/metrics'
import { blk, ctxOf, ex, st, wk } from './metrics-helpers'

const STATIONS = ['SkiErg', 'Sled Push', 'Sled Pull', 'Wall Balls']

function hyrox() {
  return ctxOf({
    events: [{ id: 1, name: 'Carrera ficticia', date: '2027-03-20' }],
    blocks: [
      blk(3, '2027-01-04', null, { eventId: 1, name: 'Específico' }),
      blk(1, '2026-11-02', '2026-12-27', { eventId: 1, name: 'Base' }),
      blk(2, '2026-12-28', '2027-01-03', { eventId: 1, name: 'Descarga', isDeload: true }),
      blk(4, '2026-09-01', '2026-10-31', { name: 'Otro' })
    ],
    exercises: [
      ex(20, { title: 'Ergo ficticio', hyroxStation: 'SkiErg', measure: 'DISTANCE_DURATION' }),
      ex(21, { title: 'Trineo ficticio', hyroxStation: 'Sled Push', measure: 'WEIGHT_DISTANCE' }),
      ex(22, { title: 'Balón ficticio', hyroxStation: 'Wall Balls' }),
      ex(23, { title: 'Remo ficticio', hyroxStation: 'Rowing' }),
      ex(30, { title: 'Carrera', category: 'CARDIO', measure: 'DISTANCE_DURATION' })
    ],
    workouts: [
      wk(1, '2026-10-20T07:00', { kind: 'HYROX' }),
      wk(2, '2026-11-05T07:00', { kind: 'HYROX' }),
      wk(3, '2026-11-12T07:00', { kind: 'HYROX' }),
      wk(4, '2026-11-10T07:00', { kind: 'RUN' }),
      wk(5, '2026-11-17T07:00', { kind: 'RUN' }),
      wk(6, '2026-11-20T07:00', { kind: 'RUN' }),
      wk(7, '2026-10-01T07:00', { kind: 'RUN' })
    ],
    sets: [
      st(1, 20, null, null, { distanceKm: 1, durationSeconds: 200 }),
      st(2, 20, null, null, { distanceKm: 1, durationSeconds: 240 }),
      st(2, 20, null, null, { distanceKm: 0.5, durationSeconds: 110 }),
      st(2, 21, 100, null, { distanceKm: 0.05 }),
      st(2, 22, 6, 20),
      st(3, 20, null, null, { distanceKm: 1, durationSeconds: 230 }),
      st(3, 21, 120, null, { distanceKm: 0.025 }),
      st(3, 21, 140, null, { distanceKm: 0.025, type: 'warmup' }),
      st(4, 30, null, null, { distanceKm: 5, durationSeconds: 1500 }),
      st(4, 30, null, null, { distanceKm: 1, durationSeconds: 200, type: 'warmup' }),
      st(5, 30, null, null, { distanceKm: 10, durationSeconds: 3300 }),
      st(6, 30, null, null, { durationSeconds: 1800 }),
      st(7, 30, null, null, { distanceKm: 3, durationSeconds: 600 })
    ]
  })
}

describe('cuenta atrás', () => {
  it('días y semanas restantes', () => {
    expect(eventCountdown('2027-03-20', '2026-11-25')).toEqual({ date: '2027-03-20', daysLeft: 115, weeksLeft: 17, isPast: false })
    expect(eventCountdown('2026-11-25', '2026-11-25')).toEqual({ date: '2026-11-25', daysLeft: 0, weeksLeft: 0, isPast: false })
    expect(eventCountdown('2026-11-24', '2026-11-25')).toMatchObject({ daysLeft: -1, weeksLeft: 0, isPast: true })
  })
})

describe('HYROX', () => {
  it('tiempo transcurrido desde el inicio del primer bloque, fases y fase actual', () => {
    const h = hyroxStatus(hyrox(), 1, '2026-11-25', STATIONS)!
    expect(h.elapsed).toEqual({ start: '2026-11-02', daysElapsed: 23, daysTotal: 138, pct: 23 / 138 })
    expect(h.phases.map((p) => [p.name, p.weeks, p.isDeload, p.isCurrent])).toEqual([
      ['Base', 8, false, true],
      ['Descarga', 1, true, false],
      ['Específico', 11, false, false]
    ])
    expect(h.phases[2].endDate).toBe('2027-03-20')
    expect(h.currentPhase).toEqual({ blockId: 1, name: 'Base', week: 4, weeks: 8 })
    expect(h.countdown.daysLeft).toBe(115)
  })

  it('fase actual en la descarga y después del evento', () => {
    expect(hyroxStatus(hyrox(), 1, '2027-01-01', STATIONS)!.currentPhase).toEqual({ blockId: 2, name: 'Descarga', week: 1, weeks: 1 })
    const after = hyroxStatus(hyrox(), 1, '2027-04-01', STATIONS)!
    expect(after.elapsed).toMatchObject({ daysElapsed: 138, pct: 1 })
    expect(after.currentPhase).toBeNull()
    expect(after.countdown.isPast).toBe(true)
  })

  it('estaciones: veces hechas y mejores marcas desde el inicio del primer bloque', () => {
    const h = hyroxStatus(hyrox(), 1, '2026-11-25', STATIONS)!
    expect(h.stations.map((s) => s.station)).toEqual(['SkiErg', 'Sled Push', 'Sled Pull', 'Wall Balls', 'Rowing'])
    const [ski, push, pull, wall, row] = h.stations
    // La sesión del 20/10 (antes del primer bloque) no cuenta.
    expect(ski).toMatchObject({ timesDone: 2, lastDate: '2026-11-12', bestWeightKg: null })
    expect(ski.bestDistanceKm).toEqual({ value: 1, workoutId: 2, date: '2026-11-05' })
    expect(ski.bestDurationSeconds).toEqual({ value: 110, workoutId: 2, date: '2026-11-05' })
    // El calentamiento de 140 kg no cuenta.
    expect(push.bestWeightKg).toEqual({ value: 120, workoutId: 3, date: '2026-11-12' })
    expect(push.bestDistanceKm!.value).toBe(0.05)
    expect(pull).toMatchObject({ timesDone: 0, lastDate: null, bestWeightKg: null, bestDistanceKm: null, bestDurationSeconds: null, bestReps: null })
    expect(wall).toMatchObject({ timesDone: 1, bestReps: { value: 20, workoutId: 2, date: '2026-11-05' } })
    expect(row.timesDone).toBe(0)
  })

  it('carrera desde las sesiones RUN: sesiones, distancia y mejor ritmo', () => {
    const h = hyroxStatus(hyrox(), 1, '2026-11-25', STATIONS)!
    expect(h.run.sessions).toBe(3)
    expect(h.run.distanceKm).toBe(15)
    expect(h.run.bestPaceSecPerKm).toEqual({ value: 300, workoutId: 4, date: '2026-11-10' })
  })

  it('un evento sin bloques: sin barra de tiempo ni fases, y todo el historial', () => {
    const ctx = ctxOf({ events: [{ id: 9, name: 'Sin bloques', date: '2027-01-10' }], workouts: [wk(1, '2026-01-01T07:00', { kind: 'RUN' })] })
    const h = hyroxStatus(ctx, 9, '2026-11-25')!
    expect(h).toMatchObject({ elapsed: null, phases: [], currentPhase: null, from: null })
    expect(h.run).toEqual({ sessions: 1, distanceKm: null, bestPaceSecPerKm: null })
    expect(hyroxStatus(ctx, 99, '2026-11-25')).toBeNull()
  })
})

describe('volumen semanal con tendencia', () => {
  it('N semanas con la actual, la anterior, el cambio y la descarga anotada', () => {
    const ctx = ctxOf({
      exercises: [ex(10)],
      blocks: [blk(1, '2026-11-16', '2026-11-22', { isDeload: true })],
      workouts: [wk(1, '2026-11-03T07:00'), wk(2, '2026-11-17T07:00'), wk(3, '2026-11-24T07:00')],
      sets: [st(1, 10, 100, 10), st(2, 10, 50, 10), st(3, 10, 60, 10), st(3, 10, 20, 10, { type: 'warmup' })]
    })
    const t = weeklyVolumeTrend(ctx, '2026-11-25', 4)
    expect(t.weeks.map((w) => [w.weekKey, w.isoWeek, w.loadKg, w.isDeload, w.isCurrent])).toEqual([
      ['2026-11-02', 45, 1000, false, false],
      ['2026-11-09', 46, 0, false, false],
      ['2026-11-16', 47, 500, true, false],
      ['2026-11-23', 48, 600, false, true]
    ])
    expect(t.current.weekKey).toBe('2026-11-23')
    expect(t.previous!.weekKey).toBe('2026-11-16')
    expect(t.changePct).toBeCloseTo(0.2, 10)
  })

  it('si la semana anterior no tiene volumen no hay % de cambio', () => {
    const t = weeklyVolumeTrend(ctxOf(), '2026-11-25', 2)
    expect(t.weeks.map((w) => w.loadKg)).toEqual([0, 0])
    expect(t.changePct).toBeNull()
  })
})
