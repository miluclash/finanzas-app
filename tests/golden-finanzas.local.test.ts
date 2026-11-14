// Test dorado de finanzas con los DATOS REALES de Michael. Solo se ejecuta en su máquina (se salta en CI).
// Trabaja sobre una copia congelada de la base (nunca sobre la real), la abre solo en memoria y NO IMPRIME CIFRAS:
// ante una diferencia solo nombra las claves que cambian; el detalle va a ultimo-diff.json dentro de la carpeta dorada.
//
// Carpeta dorada: FINANZAS_GOLDEN_DIR, o %APPDATA%\Finanzas-golden. Contiene finanzas.sqlite, meta.json y golden.json.
// Se crea con: npm run golden:capture
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Db } from '../src/main/db/db'
import { DEFAULT_SETTINGS } from '../src/main/db/store'
import { schemaVersion } from '../src/main/db/migrations'
import { AppState } from '../src/main/services/state'
import { collectGolden, diffGolden } from './golden/collect'

const dir = process.env.FINANZAS_GOLDEN_DIR ?? (process.env.APPDATA ? path.join(process.env.APPDATA, 'Finanzas-golden') : null)
const sqlitePath = dir ? path.join(dir, 'finanzas.sqlite') : ''
const metaPath = dir ? path.join(dir, 'meta.json') : ''
const goldenPath = dir ? path.join(dir, 'golden.json') : ''
const diffPath = dir ? path.join(dir, 'ultimo-diff.json') : ''
const update = process.env.FINANZAS_GOLDEN_UPDATE === '1'

const available = !!dir && fs.existsSync(sqlitePath) && fs.existsSync(metaPath)
const run = available ? describe : describe.skip

interface Meta {
  createdAt: string
  todays: string[]
  dbSha256: string
  commit?: string
  dirty?: boolean
  keyCount?: number
  schemaVersion?: number
  /** Claves de ajustes que NO estaban guardadas en la base (solo nombres). */
  settingsNotPersisted?: string[]
}

const sha256 = (buf: Uint8Array) => createHash('sha256').update(buf).digest('hex')

run('test dorado de finanzas con datos reales (solo en la máquina de Michael)', () => {
  it(update ? 'captura la línea base' : 'las cifras reales siguen siendo las congeladas', { timeout: 600_000 }, async () => {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Meta
    const bytes = fs.readFileSync(sqlitePath)
    if (sha256(bytes) !== meta.dbSha256)
      throw new Error('La copia congelada finanzas.sqlite no coincide con el SHA-256 de meta.json: alguien la ha cambiado. Repite la captura con --force.')
    if (!Array.isArray(meta.todays) || !meta.todays.length) throw new Error('meta.json no tiene "todays".')

    // Se abre solo en memoria: no hay archivo asociado, así que nunca se escribe en disco.
    const db = await Db.openReadOnlyBuffer(new Uint8Array(bytes))
    const s = AppState.init(db, { dbPath: null, backupsDir: null })
    const persisted = new Set(db.all<{ key: string }>('SELECT key FROM settings').map((r) => r.key))
    const notPersisted = Object.keys(DEFAULT_SETTINGS).filter((k) => !persisted.has(k)).sort()
    const actual = collectGolden(s, meta.todays)

    if (update) {
      fs.writeFileSync(goldenPath, JSON.stringify(actual))
      const newMeta: Meta = { ...meta, keyCount: Object.keys(actual).length, schemaVersion: schemaVersion(db), settingsNotPersisted: notPersisted }
      fs.writeFileSync(metaPath, JSON.stringify(newMeta, null, 2) + '\n')
      console.log(`Línea base capturada: ${newMeta.keyCount} claves, schemaVersion ${newMeta.schemaVersion}. Carpeta: ${dir}`)
      // El colector congela también los errores; si hay alguno conviene saberlo al capturar (solo nombres de clave).
      const errored = Object.keys(actual).filter((k) => {
        const v = actual[k]
        return typeof v === 'object' && v !== null && !Array.isArray(v) && '__error' in v
      })
      if (errored.length)
        console.warn(
          `AVISO: ${errored.length} clave(s) han dado error al calcularse y se ha congelado el error: ${errored.slice(0, 20).join(', ')}${errored.length > 20 ? ' …' : ''}`
        )
      if (notPersisted.length)
        console.warn(`AVISO: ajustes no guardados en la base (usan el valor por defecto del código): ${notPersisted.join(', ')}`)
      if (notPersisted.includes('trackingStart'))
        console.warn(
          'AVISO: "trackingStart" no está guardado en la base. Su valor por defecto es el mes en que se ejecuta el código, ' +
            'así que las cifras de esta captura dependen del mes actual y el test fallará cuando cambie de mes. Guarda el ajuste en la app y repite la captura.'
        )
    } else {
      if (!fs.existsSync(goldenPath)) throw new Error(`Falta golden.json en ${dir}. Créalo con "npm run golden:capture".`)
      if (notPersisted.includes('trackingStart'))
        console.warn(
          'AVISO: "trackingStart" no está guardado en la base de la copia dorada: las cifras dependen del mes en que se ejecuta el test. ' +
            'Si falla solo por esto, guarda el ajuste en la app y repite la captura.'
        )
      const expected = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as Record<string, unknown>
      const bad = diffGolden(expected, actual)
      if (bad.length) {
        const detail: Record<string, { expected: unknown; actual: unknown }> = {}
        for (const k of bad) detail[k] = { expected: expected[k] ?? null, actual: actual[k] ?? null }
        fs.writeFileSync(diffPath, JSON.stringify(detail, null, 1))
        const shown = bad.slice(0, 40).join('\n  ')
        throw new Error(
          `${bad.length} clave(s) del dorado real han cambiado (de ${Object.keys(expected).length}):\n  ${shown}` +
            `${bad.length > 40 ? `\n  … y ${bad.length - 40} más` : ''}\nDetalle (con cifras, solo en tu máquina): ${diffPath}`
        )
      }
      if (fs.existsSync(diffPath)) fs.rmSync(diffPath)
      expect(bad).toEqual([])
    }

    // La copia congelada no debe haberse tocado
    expect(sha256(fs.readFileSync(sqlitePath)) === meta.dbSha256).toBe(true)
    db.close()
  })
})
