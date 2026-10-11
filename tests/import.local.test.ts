// Prueba con el Excel real. Solo se ejecuta si existe la variable FINANCIAL_MASTER_PATH
// (el archivo nunca se guarda en el repositorio).
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyImport, previewImport } from '../src/main/services/importExcel'
import { memoryApp } from './helpers'

const file = process.env.FINANCIAL_MASTER_PATH
const run = file && fs.existsSync(file) ? describe : describe.skip

run('importación del FINANCIAL_MASTER real', () => {
  it('importa sin errores y los saldos cuadran con el Excel', async () => {
    const s = await memoryApp(process.env.TODAY ?? '2026-10-11')
    const p = await previewImport(s, file!)
    if (process.env.VERBOSE) fs.writeFileSync(process.env.VERBOSE, JSON.stringify({ ...p, token: undefined }, null, 2))
    expect(p.errors).toEqual([])
    expect(p.balanceCheck.every((b) => b.ok)).toBe(true)
    applyImport(s, p.token, { replaceExisting: false })
    const ctx = s.ctx()
    expect(ctx.transactions.length).toBe(p.counts.Movimientos)
  })
})
