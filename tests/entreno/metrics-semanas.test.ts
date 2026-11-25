// Semanas, días y duraciones de las métricas de Entreno (fechas como texto, sin zona horaria).
import { describe, expect, it } from 'vitest'
import {
  isoWeekNumber,
  isoWeekday,
  lastWeekKeys,
  minutesBetween,
  weekEndOf,
  weekKeyOf,
  weekKeysBetween,
  weekStartOf,
  workoutStats
} from '../../src/shared/modules/entreno/metrics'
import { ctxOf, wk } from './metrics-helpers'

describe('semanas', () => {
  it('va de lunes a domingo: domingo 23:30 cae en su semana y lunes 00:10 en la siguiente', () => {
    expect(isoWeekday('2026-11-23')).toBe(1)
    expect(weekKeyOf('2026-11-29T23:30')).toBe('2026-11-23')
    expect(weekKeyOf('2026-11-30T00:10')).toBe('2026-11-30')
    expect(weekEndOf('2026-11-23')).toBe('2026-11-29')
  })

  it('respeta weekStartsOn (domingo = 7)', () => {
    expect(weekStartOf('2026-11-25', 7)).toBe('2026-11-22')
    expect(weekStartOf('2026-11-22', 7)).toBe('2026-11-22')
    expect(weekStartOf('2026-11-21', 7)).toBe('2026-11-15')
  })

  it('número de semana ISO, también en la semana 53 que cruza el año', () => {
    expect(isoWeekNumber('2026-01-01')).toEqual({ year: 2026, week: 1 })
    expect(isoWeekNumber('2026-11-23')).toEqual({ year: 2026, week: 48 })
    expect(isoWeekNumber('2026-12-28')).toEqual({ year: 2026, week: 53 })
    expect(isoWeekNumber('2027-01-03')).toEqual({ year: 2026, week: 53 })
    expect(isoWeekNumber('2027-01-04')).toEqual({ year: 2027, week: 1 })
  })

  it('lista de semanas entre fechas y las N últimas', () => {
    expect(weekKeysBetween('2026-11-04', '2026-11-23')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'])
    expect(lastWeekKeys('2026-11-25', 3)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
  })

  it('el cambio de hora no mueve semanas (último domingo de marzo y de octubre)', () => {
    expect(weekKeyOf('2026-03-29T23:59')).toBe('2026-03-23')
    expect(weekKeyOf('2026-03-30T00:00')).toBe('2026-03-30')
    expect(weekKeyOf('2026-10-25T23:59')).toBe('2026-10-19')
    expect(weekKeysBetween('2026-03-23', '2026-04-06')).toEqual(['2026-03-23', '2026-03-30', '2026-04-06'])
  })
})

describe('duración', () => {
  it('minutos por reloj, también cruzando la medianoche', () => {
    expect(minutesBetween('2026-11-05T07:05', '2026-11-05T08:15')).toBe(70)
    expect(minutesBetween('2026-11-29T23:30', '2026-11-30T00:40')).toBe(70)
    expect(minutesBetween('2026-12-31T23:50', '2027-01-01T00:20')).toBe(30)
  })

  it('sin fin o con fin anterior al inicio no hay duración', () => {
    expect(minutesBetween('2026-11-05T07:05', null)).toBeNull()
    expect(minutesBetween('2026-11-05T08:00', '2026-11-05T07:00')).toBeNull()
  })

  it('el cambio de hora no descuadra la duración (se cuenta por reloj)', () => {
    // Una hora de entreno por la tarde de los días del cambio: 60 minutos, no 0 ni 120.
    expect(minutesBetween('2026-03-29T18:00', '2026-03-29T19:00')).toBe(60)
    expect(minutesBetween('2026-10-25T18:00', '2026-10-25T19:00')).toBe(60)
    // Cruzando la hora del cambio cuenta la diferencia de reloj (las horas de Hevy no llevan zona).
    expect(minutesBetween('2026-03-29T01:30', '2026-03-29T03:30')).toBe(120)
    expect(minutesBetween('2026-10-25T01:30', '2026-10-25T03:30')).toBe(120)
  })

  it('una sesión que cruza la medianoche cuenta en el día y la semana en que empieza', () => {
    const ctx = ctxOf({ workouts: [wk(1, '2026-11-29T23:30', { endTime: '2026-11-30T00:40' })] })
    const [s] = workoutStats(ctx)
    expect(s.date).toBe('2026-11-29')
    expect(s.weekKey).toBe('2026-11-23')
    expect(s.minutes).toBe(70)
    expect(s.density).toBe(0)
  })
})
