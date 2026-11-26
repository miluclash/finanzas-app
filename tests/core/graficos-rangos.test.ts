// Rangos relativos con `now` fijo y periodo anterior con la misma duración (en días o en periodos),
// incluidos el cambio de año y la semana ISO 53.
import { describe, expect, it } from 'vitest'
import { isoWeekday, previousRange, previousRangeFor, resolveRange, timeKeys } from '../../src/shared/core/charts'
import type { ChartRange } from '../../src/shared/core/metrics-types'
import { diffDays } from '../../src/shared/dates'
import { isoWeekNumber } from '../../src/shared/modules/entreno/metrics'

const dias = (r: { from: string; to: string }) => diffDays(r.to, r.from) + 1

describe('rangos relativos', () => {
  const HOY = '2026-11-25' // miércoles

  it('últimas N semanas, meses, días y años; este periodo', () => {
    expect(resolveRange({ kind: 'last', unit: 'week', count: 12 }, HOY)).toEqual({ from: '2026-09-07', to: HOY })
    expect(isoWeekday('2026-09-07')).toBe(1)
    expect(resolveRange({ kind: 'last', unit: 'month', count: 6 }, HOY)).toEqual({ from: '2026-06-01', to: HOY })
    expect(resolveRange({ kind: 'last', unit: 'day', count: 30 }, HOY)).toEqual({ from: '2026-10-27', to: HOY })
    expect(resolveRange({ kind: 'last', unit: 'year', count: 2 }, HOY)).toEqual({ from: '2025-01-01', to: HOY })
    expect(resolveRange({ kind: 'this', unit: 'year' }, HOY)).toEqual({ from: '2026-01-01', to: HOY })
    expect(resolveRange({ kind: 'this', unit: 'month' }, HOY)).toEqual({ from: '2026-11-01', to: HOY })
    expect(resolveRange({ kind: 'this', unit: 'week' }, HOY)).toEqual({ from: '2026-11-23', to: HOY })
    expect(resolveRange({ kind: 'absolute', from: '2026-01-05', to: '2026-02-01' }, HOY)).toEqual({ from: '2026-01-05', to: '2026-02-01' })
  })

  it('el eje de 12 semanas tiene 12 lunes', () => {
    const r = resolveRange({ kind: 'last', unit: 'week', count: 12 }, HOY)
    const k = timeKeys(r.from, r.to, 'week')
    expect(k).toHaveLength(12)
    expect(k[11]).toBe('2026-11-23')
    expect(k.every((d) => isoWeekday(d) === 1)).toBe(true)
  })
})

describe('periodo anterior', () => {
  const casos: { now: string; range: ChartRange; actual: [string, string]; anterior: [string, string]; periodos?: ['day' | 'week' | 'month' | 'year', number] }[] = [
    // 12 semanas (la actual hasta el miércoles): las 12 anteriores, cortada la última también en miércoles.
    { now: '2026-11-25', range: { kind: 'last', unit: 'week', count: 12 }, actual: ['2026-09-07', '2026-11-25'], anterior: ['2026-06-15', '2026-09-02'], periodos: ['week', 12] },
    { now: '2026-11-25', range: { kind: 'last', unit: 'month', count: 6 }, actual: ['2026-06-01', '2026-11-25'], anterior: ['2025-12-01', '2026-05-25'], periodos: ['month', 6] },
    { now: '2026-11-25', range: { kind: 'this', unit: 'year' }, actual: ['2026-01-01', '2026-11-25'], anterior: ['2025-01-01', '2025-11-25'], periodos: ['year', 1] },
    { now: '2026-11-25', range: { kind: 'this', unit: 'month' }, actual: ['2026-11-01', '2026-11-25'], anterior: ['2026-10-01', '2026-10-25'], periodos: ['month', 1] },
    // Cambio de año: 3 meses desde enero.
    { now: '2027-01-15', range: { kind: 'last', unit: 'month', count: 3 }, actual: ['2026-11-01', '2027-01-15'], anterior: ['2026-08-01', '2026-10-15'], periodos: ['month', 3] },
    // Semana ISO 53 de 2026 (del 28/12/2026 al 3/1/2027), vista el sábado 2/1/2027.
    { now: '2027-01-02', range: { kind: 'this', unit: 'week' }, actual: ['2026-12-28', '2027-01-02'], anterior: ['2026-12-21', '2026-12-26'], periodos: ['week', 1] },
    { now: '2027-01-02', range: { kind: 'last', unit: 'week', count: 2 }, actual: ['2026-12-21', '2027-01-02'], anterior: ['2026-12-07', '2026-12-19'], periodos: ['week', 2] },
    // Fin de mes: el anterior también acaba a fin de mes.
    { now: '2026-04-30', range: { kind: 'this', unit: 'month' }, actual: ['2026-04-01', '2026-04-30'], anterior: ['2026-03-01', '2026-03-31'], periodos: ['month', 1] },
    { now: '2026-02-28', range: { kind: 'this', unit: 'month' }, actual: ['2026-02-01', '2026-02-28'], anterior: ['2026-01-01', '2026-01-31'], periodos: ['month', 1] },
    { now: '2026-06-30', range: { kind: 'last', unit: 'month', count: 3 }, actual: ['2026-04-01', '2026-06-30'], anterior: ['2026-01-01', '2026-03-31'], periodos: ['month', 3] },
    { now: '2028-02-29', range: { kind: 'this', unit: 'month' }, actual: ['2028-02-01', '2028-02-29'], anterior: ['2028-01-01', '2028-01-31'], periodos: ['month', 1] },
    { now: '2028-02-29', range: { kind: 'this', unit: 'year' }, actual: ['2028-01-01', '2028-02-29'], anterior: ['2027-01-01', '2027-02-28'], periodos: ['year', 1] },
    { now: '2027-02-28', range: { kind: 'this', unit: 'year' }, actual: ['2027-01-01', '2027-02-28'], anterior: ['2026-01-01', '2026-02-28'], periodos: ['year', 1] },
    // A mitad de mes no cambia nada: el 29/3 se compara hasta el 28/2 (el día no existe) y el 15/3, hasta el 15/2.
    { now: '2027-03-29', range: { kind: 'this', unit: 'month' }, actual: ['2027-03-01', '2027-03-29'], anterior: ['2027-02-01', '2027-02-28'], periodos: ['month', 1] },
    { now: '2027-03-15', range: { kind: 'this', unit: 'month' }, actual: ['2027-03-01', '2027-03-15'], anterior: ['2027-02-01', '2027-02-15'], periodos: ['month', 1] },
    // Mes cortado el 31: el anterior se corta en el último día de febrero.
    { now: '2027-03-31', range: { kind: 'this', unit: 'month' }, actual: ['2027-03-01', '2027-03-31'], anterior: ['2027-02-01', '2027-02-28'], periodos: ['month', 1] },
    // Días: los mismos días justo antes, cruzando el año.
    { now: '2027-01-03', range: { kind: 'last', unit: 'day', count: 7 }, actual: ['2026-12-28', '2027-01-03'], anterior: ['2026-12-21', '2026-12-27'] },
    // Fechas fijas: días, o meses completos si lo son.
    { now: '2026-11-25', range: { kind: 'absolute', from: '2026-01-10', to: '2026-01-19' }, actual: ['2026-01-10', '2026-01-19'], anterior: ['2025-12-31', '2026-01-09'] },
    { now: '2026-11-25', range: { kind: 'absolute', from: '2026-01-01', to: '2026-03-31' }, actual: ['2026-01-01', '2026-03-31'], anterior: ['2025-10-01', '2025-12-31'], periodos: ['month', 3] }
  ]

  for (const c of casos) {
    it(`${JSON.stringify(c.range)} con hoy ${c.now}`, () => {
      const r = resolveRange(c.range, c.now)
      const p = previousRangeFor(c.range, c.now)
      expect([r.from, r.to]).toEqual(c.actual)
      expect([p.from, p.to]).toEqual(c.anterior)
      // Siempre antes del rango, sin solaparse.
      expect(p.to < r.from).toBe(true)
      if (c.periodos) {
        // Misma duración en periodos (y alineado al inicio de un periodo).
        const [u, n] = c.periodos
        expect(timeKeys(r.from, r.to, u)).toHaveLength(n)
        expect(timeKeys(p.from, p.to, u)).toHaveLength(n)
        expect(timeKeys(p.from, p.from, u)[0]).toBe(u === 'week' ? p.from : u === 'month' ? p.from.slice(0, 7) : p.from.slice(0, 4))
        if (u === 'week' || u === 'day') expect(dias(p)).toBe(dias(r))
      } else {
        // Misma duración en días y justo antes.
        expect(dias(p)).toBe(dias(r))
        expect(diffDays(r.from, p.to)).toBe(1)
      }
    })
  }

  it('la semana 53 existe y es la del 28/12/2026', () => {
    expect(isoWeekNumber('2026-12-28')).toEqual({ year: 2026, week: 53 })
    expect(timeKeys('2026-12-28', '2027-01-03', 'week')).toEqual(['2026-12-28'])
  })

  it('previousRange: meses completos → meses completos; si no, los mismos días', () => {
    expect(previousRange('2026-02-01', '2026-02-28')).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(previousRange('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousRange('2026-01-01', '2026-12-31')).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(previousRange('2026-03-02', '2026-03-31')).toEqual({ from: '2026-01-31', to: '2026-03-01' })
  })

  it('claves del eje por día, mes y año', () => {
    expect(timeKeys('2026-12-30', '2027-01-02', 'day')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(timeKeys('2026-11-15', '2027-02-01', 'month')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(timeKeys('2025-06-01', '2027-02-01', 'year')).toEqual(['2025', '2026', '2027'])
    expect(timeKeys('2027-01-01', '2026-01-01', 'day')).toEqual([])
  })
})
