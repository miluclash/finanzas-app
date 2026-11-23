import { describe, expect, it } from 'vitest'
import { dateToIsoLocal, formatHevyDate, parseHevyDate } from '../../src/shared/modules/entreno/hevy/dates'
import { parseNumberCell } from '../../src/shared/modules/entreno/hevy/parse'

describe('fechas de Hevy', () => {
  it('inglés, día de un dígito y ida y vuelta', () => {
    expect(parseHevyDate('5 Nov 2026, 07:05')).toBe('2026-11-05T07:05')
    expect(parseHevyDate('20 Nov 2026, 18:30')).toBe('2026-11-20T18:30')
    expect(formatHevyDate('2026-11-05T07:05')).toBe('5 Nov 2026, 07:05')
    for (let m = 1; m <= 12; m++) {
      const iso = `2026-${String(m).padStart(2, '0')}-09T23:59`
      expect(parseHevyDate(formatHevyDate(iso))).toBe(iso)
    }
  })
  it('español con y sin punto', () => {
    expect(parseHevyDate('5 ene 2026, 07:05')).toBe('2026-01-05T07:05')
    expect(parseHevyDate('5 sept. 2026, 07:05')).toBe('2026-09-05T07:05')
    expect(parseHevyDate('1 dic. 2026, 10:00')).toBe('2026-12-01T10:00')
    expect(parseHevyDate('7 ago 2026, 10:00')).toBe('2026-08-07T10:00')
    expect(parseHevyDate('7 abr 2026, 10:00')).toBe('2026-04-07T10:00')
  })
  it('medianoche y bisiestos', () => {
    expect(parseHevyDate('29 Feb 2024, 00:00')).toBe('2024-02-29T00:00')
    expect(parseHevyDate('29 Feb 2023, 00:00')).toBeNull()
    expect(parseHevyDate('29 Feb 1900, 00:00')).toBeNull()
    expect(parseHevyDate('29 Feb 2000, 12:00')).toBe('2000-02-29T12:00')
    expect(parseHevyDate('31 Apr 2026, 12:00')).toBeNull()
    expect(parseHevyDate('1 Jan 2026, 24:00')).toBeNull()
  })
  it('otros formatos y basura', () => {
    expect(parseHevyDate('05/11/2026, 07:05')).toBe('2026-11-05T07:05')
    expect(parseHevyDate('2026-11-05 07:05:33')).toBe('2026-11-05T07:05')
    expect(parseHevyDate('2026-11-05T07:05')).toBe('2026-11-05T07:05')
    expect(parseHevyDate('')).toBeNull()
    expect(parseHevyDate('5 Xyz 2026, 07:05')).toBeNull()
    expect(parseHevyDate('mañana')).toBeNull()
  })
  it('Date a ISO local', () => {
    expect(dateToIsoLocal(new Date(Date.UTC(2026, 10, 5, 7, 5)), true)).toBe('2026-11-05T07:05')
    expect(dateToIsoLocal(new Date(2026, 10, 5, 7, 5))).toBe('2026-11-05T07:05')
  })
})

describe('números', () => {
  it('punto decimal, vacío y enteros', () => {
    expect(parseNumberCell('82.5', 'dec', false)).toBe(82.5)
    expect(parseNumberCell('', 'dec', false)).toBeNull()
    expect(parseNumberCell('12', 'int', false)).toBe(12)
    expect(parseNumberCell('12.5', 'int', false)).toBeUndefined()
    expect(parseNumberCell('abc', 'dec', false)).toBeUndefined()
  })
  it('coma decimal solo si se permite', () => {
    expect(parseNumberCell('82,5', 'dec', false)).toBeUndefined()
    expect(parseNumberCell('82,5', 'dec', true)).toBe(82.5)
  })
})
