// Test dorado SINTÉTICO de finanzas: congela todas las cifras de una base inventada.
// Cualquier refactorización que cambie un resultado hace fallar este test (y se ejecuta también en CI).
// Para regenerar el JSON a propósito: npm run golden:update (solo si el cambio de cifras es intencionado).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectGolden, diffGolden } from './golden/collect'
import { buildSyntheticApp } from './golden/synthetic'
import { updateSettings } from '../src/main/services/catalog'
import { previewTradeRepublicText } from '../src/main/services/importTradeRepublic'
import type { AppState } from '../src/main/services/state'
import { memoryApp } from './helpers'

const GOLDEN = path.join(__dirname, 'golden', 'sintetico.golden.json')
const TODAYS = ['2026-10-11', '2026-11-25']
const update = process.env.GOLDEN_SINTETICO_UPDATE === '1'
const SLOW = 180_000

let shared: ReturnType<typeof build> | null = null
/** Base compartida (solo lectura) para los tests que no la modifican. */
const getShared = () => (shared ??= build())

async function build() {
  const s = await memoryApp('2026-11-25')
  buildSyntheticApp(s)
  return s
}

/**
 * Todo lo que congela este test: el colector general más (a) la vista previa de Trade Republic sobre el CSV inventado
 * (sin token aleatorio) y (b) las cifras de inversión con el método de coste FIFO, sobre una segunda base idéntica.
 */
async function collectAll(s: AppState): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...collectGolden(s, TODAYS) }
  s.todayOverride = TODAYS[1]
  const csv = fs.readFileSync(path.join(__dirname, 'fixtures', 'tr-sample.csv'), 'utf8')
  const { token: _token, ...preview } = previewTradeRepublicText(s, csv, 'tr-sample.csv')
  void _token
  out[`${TODAYS[1]}|previewTradeRepublic`] = JSON.parse(JSON.stringify(preview))
  // costMethod FIFO: segunda base igual, solo claves de inversión
  const f = await build()
  updateSettings(f, { costMethod: 'FIFO' })
  const fifo = collectGolden(f, [TODAYS[1]])
  for (const k of Object.keys(fifo))
    if (/[|]inv[.](overview|plan)$/.test(k) || k.includes('|portfolioSummary@2026-11-30')) out[`FIFO|${k}`] = fifo[k]
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(out).sort()) sorted[k] = out[k]
  return sorted
}

describe('test dorado sintético de finanzas', () => {
  it('las cifras coinciden con tests/golden/sintetico.golden.json', { timeout: SLOW }, async () => {
    const s = await getShared()
    const actual = await collectAll(s)
    const text = JSON.stringify(actual, null, 1) + '\n'
    if (update) {
      fs.writeFileSync(GOLDEN, text)
      console.log(`Dorado sintético reescrito: ${Object.keys(actual).length} claves, ${(text.length / 1024).toFixed(0)} KB`)
      return
    }
    if (!fs.existsSync(GOLDEN))
      throw new Error(`Falta ${GOLDEN}. Genéralo a propósito con "npm run golden:update" y súbelo al repositorio.`)
    const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, unknown>
    const diff = diffGolden(expected, actual)
    expect(diff, `Claves del dorado sintético que han cambiado (${diff.length})`).toEqual([])
    // Git en Windows puede dejar el archivo con CRLF al cambiar de rama: se compara sin tener en cuenta el fin de línea.
    expect(text === fs.readFileSync(GOLDEN, 'utf8').replace(/\r\n/g, '\n')).toBe(true)
  })

  it('es determinista: dos pasadas dan exactamente lo mismo', { timeout: SLOW }, async () => {
    const s = await getShared()
    const a = JSON.stringify(await collectAll(s))
    const b = JSON.stringify(await collectAll(s))
    expect(a === b).toBe(true)
    // y reconstruir la base desde cero da el mismo resultado byte a byte
    const c = JSON.stringify(await collectAll(await build()))
    expect(c === a).toBe(true)
  })

  it('cubre las ramas principales (la base inventada no se ha quedado corta)', { timeout: SLOW }, async () => {
    const s = await getShared()
    const g = await collectAll(s)
    expect(Object.keys(g).length).toBeGreaterThan(150)
    expect(g['2026-11-25|previewTradeRepublic']).toBeTruthy()
    expect(Object.keys(g).some((k) => k.startsWith('FIFO|'))).toBe(true)
    const ctx = s.ctx()
    expect(ctx.accounts.length).toBeGreaterThanOrEqual(8)
    expect(ctx.ops.length).toBeGreaterThanOrEqual(15)
    expect(ctx.transactions.some((t) => t.status === 'PENDING_REVIEW')).toBe(true)
    expect(ctx.transactions.some((t) => t.status === 'CANCELLED')).toBe(true)
    expect(ctx.dismissedDuplicates.length).toBe(1)
    expect(JSON.stringify(g['2026-11-25|budgets.report@2026-10'])).toContain('OVER')
    expect(JSON.stringify(g['2026-11-25|allDuplicatePairs'])).not.toBe('[]')
  })
})
