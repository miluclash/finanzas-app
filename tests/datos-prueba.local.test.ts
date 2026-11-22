// Genera una base de datos SINTÉTICA (la del test dorado, todo inventado) en una carpeta, para abrir la app
// con datos de prueba y hacer capturas sin tocar nunca datos reales.
// Solo se ejecuta con FINANZAS_DATOS_PRUEBA_DIR:
//   FINANZAS_DATOS_PRUEBA_DIR=<carpeta> npx vitest run tests/datos-prueba.local.test.ts
// y después: FINANZAS_DATA_DIR=<carpeta> npm run dev   (o node scripts/screenshots.mjs …)
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Db } from '../src/main/core/db'
import { AppState } from '../src/main/modules/finanzas/state'
import { buildSyntheticApp } from './golden/synthetic'

const dir = process.env.FINANZAS_DATOS_PRUEBA_DIR
const run = dir ? describe : describe.skip

run('datos de prueba sintéticos', () => {
  it('crea finanzas.sqlite en la carpeta indicada', async () => {
    fs.mkdirSync(dir!, { recursive: true })
    const file = path.join(dir!, 'finanzas.sqlite')
    if (fs.existsSync(file)) fs.rmSync(file)
    const db = await Db.open(file)
    const s = AppState.init(db, { dbPath: file, backupsDir: null })
    // Cada escritura del montaje pasa por la cola (runNow) y se guarda en disco, como en la app
    buildSyntheticApp(s)
    expect(fs.existsSync(file)).toBe(true)
  })
})
