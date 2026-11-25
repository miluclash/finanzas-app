// Prueba con el archivo real de Hevy. Solo se ejecuta si existe: FINANZAS_HEVY_FILE o el primer
// .csv de %USERPROFILE%\Finanzas-hevy\. El archivo nunca está en el repo.
// Si algo falla, los mensajes solo dicen nº de registro y nombre de columna, nunca el contenido.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readCsv } from '../src/shared/csv'
import { HEVY_COLUMNS } from '../src/shared/modules/entreno/hevy'
import { entrenoApp, noDialogs } from './entreno/helpers'

function findFile(): string | null {
  const env = process.env.FINANZAS_HEVY_FILE
  if (env) return fs.existsSync(env) ? env : null
  const dir = path.join(os.homedir(), 'Finanzas-hevy')
  if (!fs.existsSync(dir)) return null
  const f = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.csv')).sort()[0]
  return f ? path.join(dir, f) : null
}

/** Pone CRLF en los fines de registro (fuera de comillas); dentro de las celdas no toca nada. */
function normalizeRecordEnds(text: string): string {
  let out = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') inQ = !inQ
    if (!inQ && c === '\r' && text[i + 1] === '\n') {
      out += '\r\n'
      i++
    } else if (!inQ && c === '\n') out += '\r\n'
    else out += c
  }
  return out
}

const file = findFile()
const tmpOut = path.join(os.tmpdir(), `hevy-real-${process.pid}.csv`)
afterAll(() => fs.rmSync(tmpOut, { force: true }))
const run = file ? describe : describe.skip

run('Hevy real: importar, reimportar y exportar', () => {
  it('ida y vuelta completa contra la base', async () => {
    const original = fs.readFileSync(file!, 'utf8').replace(/^﻿/, '')
    const dialogs = { ...noDialogs, openFile: async () => file!, saveFile: async () => tmpOut }
    const app = await entrenoApp(undefined, dialogs)
    const count = (t: string): number => app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n

    const p = (await app.h['entreno:import.preview']())!
    expect(p.errors.length).toBe(0)
    expect(p.sessionsWithErrors).toBe(0)
    expect(p.newWorkouts.length).toBeGreaterThan(0)
    expect(p.duplicateCount).toBe(0)
    const r = await app.h['entreno:import.apply'](p.token)
    expect(r.workoutsNew).toBe(p.newWorkouts.length)
    expect(r.rowsError).toBe(0)
    const workouts = count('trn_workouts')
    const sets = count('trn_sets')
    expect(workouts).toBe(p.newWorkouts.length)
    expect(sets).toBe(p.rowsTotal)

    // Reimportar: nada nuevo, nada cambiado, todo duplicado.
    const p2 = (await app.h['entreno:import.preview']())!
    expect([p2.newWorkouts.length, p2.changedWorkouts.length, p2.duplicateCount]).toEqual([0, 0, workouts])
    const r2 = await app.h['entreno:import.apply'](p2.token)
    expect([r2.workoutsNew, r2.workoutsChanged, r2.workoutsDuplicate]).toEqual([0, 0, workouts])
    expect([count('trn_workouts'), count('trn_sets')]).toEqual([workouts, sets])

    // Exportar y comparar celda a celda con el original.
    const out = (await app.h['entreno:export.csv']())!
    const exported = fs.readFileSync(out, 'utf8')
    const a = readCsv(original).records
    const b = readCsv(exported).records
    expect(b.length).toBe(a.length)
    let bad: string | null = null
    for (let i = 0; i < a.length && !bad; i++)
      for (let c = 0; c < HEVY_COLUMNS.length; c++)
        if (a[i].fields[c] !== b[i].fields[c]) {
          bad = `registro ${i + 1}, columna ${HEVY_COLUMNS[c]}`
          break
        }
    expect(bad, 'primera celda distinta').toBeNull()

    // Texto idéntico tras normalizar los fines de registro a CRLF.
    const norm = normalizeRecordEnds(original)
    if (norm !== exported) {
      let k = 0
      while (k < norm.length && norm[k] === exported[k]) k++
      const rec = readCsv(norm.slice(0, k)).records.length
      expect.fail(`el texto difiere desde el registro ${rec} (longitudes ${norm.length} y ${exported.length})`)
    }
  })
})
