import { describe, expect, it } from 'vitest'
import { detectDelimiter, readCsv, writeCsv } from '../../src/shared/csv'

describe('csv', () => {
  it('lee comillas, comillas dobladas y saltos de línea dentro de comillas', () => {
    const r = readCsv('"a","b ""x"", y","l1\nl2"\r\n"1","2","3"\r\n')
    expect(r.records).toEqual([
      { line: 1, fields: ['a', 'b "x", y', 'l1\nl2'] },
      { line: 3, fields: ['1', '2', '3'] }
    ])
  })
  it('acepta LF, CR, BOM y falta de salto final', () => {
    expect(readCsv('﻿a,b\nc,d').records.map((x) => x.fields)).toEqual([['a', 'b'], ['c', 'd']])
    expect(readCsv('a,b\rc,d\r').records).toHaveLength(2)
  })
  it('ignora líneas en blanco pero conserva campos vacíos', () => {
    const r = readCsv('a,b\n\n,\n""\n')
    expect(r.records.map((x) => [x.line, x.fields])).toEqual([[1, ['a', 'b']], [3, ['', '']], [4, ['']]])
  })
  it('detecta separador fuera de comillas', () => {
    expect(detectDelimiter('"a,b,c";"d"\n')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('a,b;c')).toBe(',')
    expect(detectDelimiter('solo')).toBe(',')
  })
  it('avisa de comilla sin cerrar', () => {
    const r = readCsv('a,b\n"c,d\n')
    expect(r.unterminatedQuoteLine).toBe(2)
    expect(r.records).toHaveLength(1)
  })
  it('escribe todo entre comillas con CRLF y ida y vuelta', () => {
    const rows = [['a', 'b "c"'], ['x\ny', '']]
    const txt = writeCsv(rows)
    expect(txt).toBe('"a","b ""c"""\r\n"x\ny",""\r\n')
    expect(readCsv(txt).records.map((x) => x.fields)).toEqual(rows)
    expect(writeCsv([['a', 'b,c']], { quoteAll: false, trailingEol: false })).toBe('a,"b,c"')
  })
})
