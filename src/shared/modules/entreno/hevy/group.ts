/** Agrupado de filas en sesiones, firma de sesión y comparación. */
import type { HevyParseResult } from './parse'
import { hevyKey } from './key'
import type { HevyRow, HevySession, HevySet, RowError } from './types'

export interface HevyGrouping {
  /** Todas las sesiones, en el orden de aparición en el archivo. Las que tienen `hasErrors` no se importan. */
  sessions: HevySession[]
  errors: RowError[]
  warnings: string[]
  rowCount: number
  validRowCount: number
}

const nz = (s: string | null): string => (s ?? '').replace(/\r\n?/g, '\n')
const nn = (n: number | null): string => (n === null ? '' : String(n))

/** Hash de 53 bits (cyrb53) en hexadecimal; dos semillas dan 106 bits. Puro, sin crypto. */
function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/**
 * Firma estable del contenido de una sesión: título, inicio, fin, descripción y todas sus series
 * (ejercicio, orden, set_index, tipo, números, notas, superset). Misma firma = mismo contenido.
 * Las series se ordenan por (exercise_order, set_index), así que el orden de las filas no influye.
 */
export function sessionSignature(s: {
  title: string
  startTime: string
  endTime: string | null
  description: string | null
  sets: HevySet[]
}): string {
  const sets = [...s.sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex)
  const parts = [
    'v1',
    s.title,
    s.startTime,
    s.endTime ?? '',
    nz(s.description),
    ...sets.map((x) =>
      [
        x.exerciseTitle,
        x.exerciseOrder,
        x.setIndex,
        x.setType,
        nn(x.weightKg),
        nn(x.reps),
        nn(x.distanceKm),
        nn(x.durationSeconds),
        nn(x.rpe),
        nz(x.exerciseNotes),
        x.supersetId ?? ''
      ].join('\u001f')
    )
  ]
  const canon = parts.join('\u001e')
  return cyrb53(canon, 1) + cyrb53(canon, 2)
}

export function groupHevySessions(parsed: HevyParseResult): HevyGrouping {
  const warnings = [...parsed.warnings]
  const errors: RowError[] = parsed.items.flatMap((i) => i.errors)

  interface Acc {
    key: string
    firstRow: HevyRow
    rows: HevyRow[]
    hasErrors: boolean
    warnings: string[]
    discrepancies: Set<string>
  }
  const map = new Map<string, Acc>()
  const order: Acc[] = []
  const get = (key: string, row: HevyRow | null): Acc | null => {
    let a = map.get(key)
    if (!a && row) {
      a = { key, firstRow: row, rows: [], hasErrors: false, warnings: [], discrepancies: new Set() }
      map.set(key, a)
      order.push(a)
    }
    return a ?? null
  }

  // Sesiones por las filas válidas.
  for (const it of parsed.items) {
    if (!it.row) continue
    const r = it.row
    const a = get(hevyKey(r.title, r.startTime), r)!
    if (r.endTime !== a.firstRow.endTime) a.discrepancies.add('end_time')
    if (r.description !== a.firstRow.description) a.discrepancies.add('description')
    a.rows.push(r)
  }

  // Filas con error: marcan su sesión; sin sesión identificable, marcan las vecinas.
  let prevKey: string | null = null
  const lastKeyBefore: (string | null)[] = []
  for (const it of parsed.items) {
    lastKeyBefore.push(prevKey)
    if (it.row) prevKey = hevyKey(it.row.title, it.row.startTime)
  }
  parsed.items.forEach((it, n) => {
    if (it.errors.length === 0) return
    if (it.sessionKey) {
      const a = map.get(it.sessionKey)
      if (a) a.hasErrors = true
      else {
        // Sesión con todas sus filas erróneas: aparece igualmente como sesión con errores.
        const stub: Acc = {
          key: it.sessionKey,
          firstRow: null as unknown as HevyRow,
          rows: [],
          hasErrors: true,
          warnings: [],
          discrepancies: new Set()
        }
        map.set(it.sessionKey, stub)
        order.push(stub)
      }
      return
    }
    const before = lastKeyBefore[n]
    const after = parsed.items.slice(n + 1).find((x) => x.row)?.row
    if (before) map.get(before)!.hasErrors = true
    if (after) map.get(hevyKey(after.title, after.startTime))!.hasErrors = true
  })

  const sessions: HevySession[] = []
  for (const a of order) {
    if (a.rows.length === 0) continue // solo filas erróneas: ya constan en `errors`
    // exercise_order: un bloque nuevo cada vez que cambia el ejercicio respecto a la fila anterior
    // (el mismo ejercicio separado por otro cuenta como dos bloques, como en Hevy).
    let block = -1
    let prevTitle: string | null = null
    const sets: HevySet[] = []
    const seenSet = new Set<string>()
    for (const r of a.rows) {
      if (r.exerciseTitle !== prevTitle) block++
      prevTitle = r.exerciseTitle
      const dupKey = `${block}\u001f${r.setIndex}`
      if (seenSet.has(dupKey)) {
        errors.push({ line: r.line, column: 'set_index', message: `serie repetida (mismo bloque de ejercicio y set_index), línea ${r.line}` })
        a.hasErrors = true
        continue
      }
      seenSet.add(dupKey)
      sets.push({
        exerciseTitle: r.exerciseTitle,
        exerciseOrder: block,
        supersetId: r.supersetId,
        exerciseNotes: r.exerciseNotes,
        setIndex: r.setIndex,
        setType: r.setType,
        weightKg: r.weightKg,
        reps: r.reps,
        distanceKm: r.distanceKm,
        durationSeconds: r.durationSeconds,
        rpe: r.rpe
      })
    }
    sets.sort((x, y) => x.exerciseOrder - y.exerciseOrder || x.setIndex - y.setIndex)
    const f = a.firstRow
    const w: string[] = []
    if (a.discrepancies.size > 0) {
      w.push(
        `Las filas de la sesión que empieza en la línea ${f.line} no coinciden en ${[...a.discrepancies].join(' y ')}; se usa la primera fila.`
      )
    }
    const data = { title: f.title, startTime: f.startTime, endTime: f.endTime, description: f.description, sets }
    sessions.push({
      ...data,
      hevyKey: a.key,
      firstLine: f.line,
      hasErrors: a.hasErrors,
      warnings: w,
      signature: sessionSignature(data)
    })
    warnings.push(...w)
  }

  const validRowCount = parsed.items.filter((i) => i.row).length
  return { sessions, errors, warnings, rowCount: parsed.items.length, validRowCount }
}
