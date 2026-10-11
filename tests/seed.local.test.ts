// Crea una base de datos real a partir del Excel para probar la app a mano.
// Solo con FINANCIAL_MASTER_PATH y SEED_DB_PATH (nunca se sube nada al repositorio).
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'vitest'
import { Db } from '../src/main/db/db'
import { applyImport, previewImport } from '../src/main/services/importExcel'
import { AppState } from '../src/main/services/state'

const file = process.env.FINANCIAL_MASTER_PATH
const out = process.env.SEED_DB_PATH
const run = file && out && fs.existsSync(file) ? describe : describe.skip

run('semilla local', () => {
  it('importa el Excel a un archivo SQLite', async () => {
    fs.mkdirSync(path.dirname(out!), { recursive: true })
    if (fs.existsSync(out!)) fs.rmSync(out!)
    const db = await Db.open(out!)
    const s = AppState.init(db, { dbPath: out!, backupsDir: null })
    const p = await previewImport(s, file!)
    applyImport(s, p.token, { replaceExisting: false })
  })
})
