// Campo «Objetivo» del constructor: coma o punto decimal, euros en céntimos y % como proporción.
import { describe, expect, it } from 'vitest'
import { entradaAObjetivo, objetivoAEntrada, parseNumeroEs } from '../../src/shared/core/charts'

describe('objetivo del gráfico', () => {
  it('acepta coma y punto decimales (82.5 kg no es 825)', () => {
    expect(entradaAObjetivo('82.5', 'kg')).toBe(82.5)
    expect(entradaAObjetivo('82,5', 'kg')).toBe(82.5)
    expect(entradaAObjetivo('1.234,5', 'kg')).toBe(1234.5)
    expect(entradaAObjetivo('1,234.5', 'kg')).toBe(1234.5)
    expect(entradaAObjetivo('1.500', 'kg')).toBe(1500)
    expect(entradaAObjetivo('0.500', 'km')).toBe(0.5)
    expect(entradaAObjetivo(' 100 ', 'kg')).toBe(100)
    expect(entradaAObjetivo('-3', 'kg')).toBe(-3)
  })

  it('euros a céntimos y % a proporción', () => {
    expect(entradaAObjetivo('1.200,50', 'eur_cents')).toBe(120050)
    expect(entradaAObjetivo('12.5', 'eur_cents')).toBe(1250)
    expect(entradaAObjetivo('25', 'pct')).toBe(0.25)
    expect(entradaAObjetivo('12,5', 'pct')).toBe(0.125)
  })

  it('vacío o texto no numérico: null', () => {
    expect(entradaAObjetivo('', 'kg')).toBeNull()
    expect(entradaAObjetivo('   ', 'kg')).toBeNull()
    expect(entradaAObjetivo('abc', 'kg')).toBeNull()
    expect(entradaAObjetivo('1,2,3', 'kg')).toBeNull()
    expect(parseNumeroEs('1.2.3')).toBeNull()
  })

  it('ida y vuelta con el texto del campo', () => {
    expect(objetivoAEntrada(82.5, 'kg')).toBe('82,5')
    expect(objetivoAEntrada(120050, 'eur_cents')).toBe('1200,5')
    expect(objetivoAEntrada(0.125, 'pct')).toBe('12,5')
    for (const [v, u] of [[82.5, 'kg'], [120050, 'eur_cents'], [0.125, 'pct']] as const) expect(entradaAObjetivo(objetivoAEntrada(v, u), u)).toBe(v)
  })
})
