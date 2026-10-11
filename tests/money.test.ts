import { describe, expect, it } from 'vitest'
import { addMonths, formatDate, isISODate, parseUserDate } from '../src/shared/dates'
import { eurosToCents, formatEur, parseEurToCents } from '../src/shared/money'

describe('importes', () => {
  it('interpreta el formato español y el punto decimal', () => {
    expect(parseEurToCents('12,50')).toBe(1250)
    expect(parseEurToCents('1.234,56')).toBe(123456)
    expect(parseEurToCents('1234.56')).toBe(123456)
    expect(parseEurToCents('12.5')).toBe(1250)
    expect(parseEurToCents('1.234')).toBe(123400)
    expect(parseEurToCents('0.500')).toBe(50)
    expect(parseEurToCents('-8')).toBe(-800)
    expect(parseEurToCents('21,78 €')).toBe(2178)
    expect(parseEurToCents('0,005')).toBe(1)
    expect(parseEurToCents('abc')).toBeNull()
    expect(parseEurToCents('')).toBeNull()
    expect(parseEurToCents('1,2,3')).toBeNull()
  })

  it('convierte floats de Excel sin errores de coma flotante', () => {
    expect(eurosToCents(544.0299999999995)).toBe(54403)
    expect(eurosToCents(0.1 + 0.2)).toBe(30)
    expect(eurosToCents(-21.78)).toBe(-2178)
  })

  it('formatea en euros con convención española', () => {
    expect(formatEur(123456).replace(/\s/g, ' ')).toBe('1.234,56 €')
    expect(formatEur(-2178).replace(/\s/g, ' ')).toBe('-21,78 €')
    expect(formatEur(-0).replace(/\s/g, ' ')).toBe('0,00 €')
    expect(formatEur(500, { sign: true }).replace(/\s/g, ' ')).toBe('+5,00 €')
  })
})

describe('fechas', () => {
  it('valida y formatea', () => {
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2028-02-29')).toBe(true)
    expect(formatDate('2026-10-03')).toBe('03/10/2026')
    expect(parseUserDate('3/10/2026')).toBe('2026-10-03')
  })
  it('suma meses respetando el fin de mes', () => {
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2, 31)).toBe('2026-03-31')
  })
})
