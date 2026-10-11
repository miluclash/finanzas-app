import fs from 'node:fs'
import { describe, it } from 'vitest'
import { applyImport, previewImport } from '../src/main/services/importExcel'
import { reviewQueue } from '../src/main/services/transactions'
import { memoryApp } from './helpers'
const file = process.env.FINANCIAL_MASTER_PATH
const out = process.env.REVIEW_OUT
const run = file && out && fs.existsSync(file) ? describe : describe.skip
run('bandeja de revisión real', () => {
  it('vuelca', async () => {
    const s = await memoryApp('2026-10-11')
    const p = await previewImport(s, file!)
    applyImport(s, p.token, { replaceExisting: false })
    const q = reviewQueue(s)
    fs.writeFileSync(out!, JSON.stringify({ pending: q.pending.map((t) => [t.id, t.errors, t.warnings]), issues: q.issues.map((t) => [t.id, t.description, t.errors, t.warnings]), dups: q.duplicates.map(([a, b]) => [a.id, b.id]) }, null, 1))
  })
})
