import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { readCsv, writeCsv } from '../../src/shared/csv'
import { describe, expect, it } from 'vitest'
import { readXlsxRecords } from '../../src/main/modules/entreno/hevyXlsx'
import {
  deduceKind,
  formatHevyCsv,
  groupHevySessions,
  hevyKey,
  readHevyRecords,
  readHevyText,
  sessionSignature,
  type KindRule
} from '../../src/shared/modules/entreno/hevy'

const fx = (n: string): string => readFileSync(resolve(__dirname, '../fixtures', n), 'utf8')
const CSV = fx('hevy-ficticio-sesiones.csv')

describe('lectura y agrupado', () => {
  const res = readHevyText(CSV)
  it('agrupa en 3 sesiones con exercise_order por aparición', () => {
    expect(res.fatal).toBeNull()
    expect(res.grouping.errors).toEqual([])
    const s = res.grouping.sessions
    expect(s.map((x) => x.hevyKey)).toEqual([
      'Natación técnica|2026-11-20T18:30',
      'Torso A|2026-11-05T07:05',
      'Core rápido|2024-02-29T00:00'
    ])
    const torso = s[1]
    expect(torso.sets.map((x) => [x.exerciseTitle, x.exerciseOrder, x.setIndex])).toEqual([
      ['Press banca ficticio', 0, 0],
      ['Press banca ficticio', 0, 1],
      ['Press banca ficticio', 0, 2],
      ['Remo ficticio', 1, 0],
      ['Dominadas ficticias', 2, 0],
      ['Dominadas ficticias', 2, 1],
      ['Curl ficticio', 3, 0],
      ['Curl ficticio', 3, 1]
    ])
    expect(torso.sets[2].setType).toBe('failure')
    expect(torso.sets[7].setType).toBe('dropset')
    expect(torso.sets[4].exerciseNotes).toBe('Primera línea\nsegunda línea, con coma y "comillas"')
    expect(torso.sets[4].weightKg).toBeNull()
    expect(torso.description).toBe('Buen día, sin prisas')
    expect(s[0].sets[0]).toMatchObject({ distanceKm: 0.4, durationSeconds: 600, reps: null })
    expect(s[2].description).toBeNull()
  })
  it('hevyKey estable', () => {
    expect(hevyKey('Torso A', '2026-11-05T07:05')).toBe('Torso A|2026-11-05T07:05')
  })
})

describe('ida y vuelta', () => {
  it('CSV -> sesiones -> CSV da el mismo texto', () => {
    expect(formatHevyCsv(readHevyText(CSV).grouping.sessions)).toBe(CSV)
  })
  it('también desde TSV (con la misma lectura)', () => {
    const tsv = fx('hevy-ficticio-sesiones.tsv')
    const r = readHevyText(tsv)
    expect(r.parse.delimiter).toBe('\t')
    expect(formatHevyCsv(r.grouping.sessions)).toBe(CSV)
  })
  it('también desde XLSX', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Hevy')
    const rows = readHevyText(CSV).parse
    // Reconstruye la tabla de texto desde el CSV y deja la fecha del primer inicio como Date UTC.
    const table = (await import('../../src/shared/csv')).readCsv(CSV).records.map((r) => r.fields)
    table.forEach((r, i) => {
      if (i === 0) return ws.addRow(r)
      const n = (v: string): string | number => (v === '' || r === undefined ? v : v)
      ws.addRow(r.map((v, c) => (c === 1 && i === 1 ? new Date(Date.UTC(2026, 10, 20, 18, 30)) : c >= 9 && v !== '' ? Number(n(v)) : v)))
    })
    expect(rows.fatal).toBeNull()
    const buf = await wb.xlsx.writeBuffer()
    const recs = await readXlsxRecords(buf as ArrayBuffer)
    const r = readHevyRecords(recs)
    expect(r.fatal).toBeNull()
    expect(r.grouping.errors).toEqual([])
    expect(formatHevyCsv(r.grouping.sessions)).toBe(CSV)
  })
})

describe('errores', () => {
  const r = readHevyText(fx('hevy-ficticio-errores.csv'))
  it('da nº de línea y columna sin contenido de celda, y aísla la sesión', () => {
    expect(r.grouping.errors).toEqual([
      { line: 3, column: 'rpe', message: 'rpe fuera de 1 a 10 en rpe, línea 3' }
    ])
    const bad = r.grouping.sessions.find((s) => s.title === 'Pierna B')!
    expect(bad.hasErrors).toBe(true)
    expect(r.grouping.sessions.filter((s) => s.hasErrors)).toHaveLength(1)
    expect(r.grouping.sessions.find((s) => s.title === 'Empuje C')!.hasErrors).toBe(false)
  })
  const head = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\r\n'
  const row = (o: Record<number, string>): string => {
    const f = ['T', '1 Jan 2026, 10:00', '1 Jan 2026, 11:00', '', 'E', '', '', '0', 'normal', '10', '5', '', '', '']
    for (const [k, v] of Object.entries(o)) f[+k] = v
    return f.map((x) => `"${x}"`).join(',') + '\r\n'
  }
  it('motivos varios', () => {
    const t = (o: Record<number, string>) => readHevyText(head + row(o)).grouping.errors.map((e) => e.column)
    expect(t({ 1: 'ayer' })).toEqual(['start_time'])
    expect(t({ 2: '1 Jan 2026, 09:00' })).toEqual(['end_time'])
    expect(t({ 8: 'raro' })).toEqual(['set_type'])
    expect(t({ 9: '-5' })).toEqual(['weight_kg'])
    expect(t({ 10: '2.5' })).toEqual(['reps'])
    expect(t({ 13: '0' })).toEqual(['rpe'])
    expect(t({ 7: '' })).toContain('set_index')
  })
  it('fila con fecha ilegible marca las sesiones vecinas', () => {
    const t = head + row({}) + row({ 1: 'ayer', 0: 'X' }) + row({ 0: 'Otra', 1: '2 Jan 2026, 10:00', 2: '2 Jan 2026, 11:00' })
    const g = readHevyText(t).grouping
    expect(g.sessions.every((s) => s.hasErrors)).toBe(true)
  })
  it('serie repetida', () => {
    const g = readHevyText(head + row({}) + row({})).grouping
    expect(g.sessions[0].hasErrors).toBe(true)
    expect(g.errors).toHaveLength(1)
  })
  it('cabecera: faltan columnas, extras y orden distinto', () => {
    expect(readHevyText('"title","start_time"\r\n').fatal).toMatch(/Faltan columnas.*end_time/)
    expect(readHevyText('').fatal).toBeTruthy()
    const recs = readCsv(head + row({})).records.map((r) => [...r.fields].reverse().concat(['extra']))
    recs[0][recs[0].length - 1] = 'extra'
    recs[1][recs[1].length - 1] = '1'
    const r2 = readHevyText(writeCsv(recs))
    expect(r2.fatal).toBeNull()
    expect(r2.parse.warnings.join()).toMatch(/extra/)
    expect(r2.grouping.sessions).toHaveLength(1)
  })
  it('aviso por discrepancias dentro de una sesión', () => {
    const g = readHevyText(head + row({}) + row({ 7: '1', 3: 'otra' })).grouping
    expect(g.sessions[0].warnings).toHaveLength(1)
    expect(g.sessions[0].hasErrors).toBe(false)
  })
  it('coma decimal con punto y coma', () => {
    const t = (head + row({ 9: '82,5' })).replace(/","/g, '";"').replace(/^"/, '"')
    expect(readHevyText(t).grouping.sessions[0].sets[0].weightKg).toBe(82.5)
  })
})

describe('firma', () => {
  const sess = readHevyText(CSV).grouping.sessions
  it('estable y sensible al contenido', () => {
    const again = readHevyText(CSV).grouping.sessions
    expect(again.map((s) => s.signature)).toEqual(sess.map((s) => s.signature))
    const changed = structuredClone(sess[1])
    changed.sets[1].weightKg = 85
    expect(sessionSignature(changed)).not.toBe(sess[1].signature)
    const desc = { ...sess[1], description: 'otra' }
    expect(sessionSignature(desc)).not.toBe(sess[1].signature)
    expect(new Set(sess.map((s) => s.signature)).size).toBe(3)
  })
  it('no depende del orden de las filas ni de CRLF en notas', () => {
    const shuffled = { ...sess[1], sets: [...sess[1].sets].reverse() }
    expect(sessionSignature(shuffled)).toBe(sess[1].signature)
    const crlf = structuredClone(sess[1])
    crlf.sets[4].exerciseNotes = crlf.sets[4].exerciseNotes!.replace(/\n/g, '\r\n')
    expect(sessionSignature(crlf)).toBe(sess[1].signature)
  })
  it('groupHevySessions se puede reutilizar', () => {
    expect(groupHevySessions(readHevyText(CSV).parse).sessions).toHaveLength(3)
  })
})

describe('deducción de tipo', () => {
  const rules: KindRule[] = [
    { field: 'title', contains: 'natacion', kind: 'SWIM', priority: 10, active: true },
    { field: 'exercise', contains: 'crol', kind: 'OTHER', priority: 5, active: true },
    { field: 'exercise', contains: 'sled', kind: 'HYROX', priority: 20, active: true },
    { field: 'title', contains: 'carrera', kind: 'RUN', priority: 99, active: false }
  ]
  const [nat, torso] = readHevyText(CSV).grouping.sessions
  it('sin distinguir mayúsculas ni tildes; mayor prioridad gana', () => {
    expect(deduceKind(nat, rules)).toBe('SWIM')
    expect(deduceKind({ title: 'Carrera', sets: [] }, rules)).toBe('GYM')
    expect(deduceKind({ title: 'X', sets: [{ exerciseTitle: 'SLED Push' }, { exerciseTitle: 'Crol' }] }, rules)).toBe('HYROX')
  })
  it('por defecto GYM', () => {
    expect(deduceKind(torso, rules)).toBe('GYM')
    expect(deduceKind(torso, [])).toBe('GYM')
  })
})
