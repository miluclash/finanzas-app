// Genera una base de datos SINTÉTICA (la del test dorado, todo inventado) en una carpeta, para abrir la app
// con datos de prueba y hacer capturas sin tocar nunca datos reales. Solo escribe en carpetas sin base: si ya hay
// un finanzas.sqlite, o la carpeta es la de datos reales o la del dorado, falla sin borrar nada.
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

/** Ruta real y comparable (sin mayúsculas en Windows); si la carpeta aún no existe, se resuelve por su carpeta existente más cercana */
function rutaReal(p: string): string {
  let actual = path.resolve(p)
  const resto: string[] = []
  while (!fs.existsSync(actual) && path.dirname(actual) !== actual) {
    resto.unshift(path.basename(actual))
    actual = path.dirname(actual)
  }
  const r = path.join(fs.existsSync(actual) ? fs.realpathSync.native(actual) : actual, ...resto)
  return process.platform === 'win32' ? r.toLowerCase() : r
}
/** Solo se escribe en carpetas sin base: nunca en los datos reales ni en la línea base del dorado, ni encima de una base existente */
function comprobarCarpeta(carpeta: string): void {
  const appdata = process.env.APPDATA ?? ''
  const prohibidas = [path.join(appdata, 'Finanzas'), path.join(appdata, 'Finanzas-golden'), process.env.FINANZAS_GOLDEN_DIR ?? ''].filter(Boolean)
  const destino = rutaReal(carpeta)
  for (const p of prohibidas)
    if (destino === rutaReal(p)) throw new Error(`Me niego a generar datos de prueba en ${carpeta}: es una carpeta de datos reales o de la línea base del dorado. Usa una carpeta nueva.`)
  if (fs.existsSync(path.join(carpeta, 'finanzas.sqlite')))
    throw new Error(`Me niego a generar datos de prueba en ${carpeta}: ya hay un finanzas.sqlite. Usa una carpeta sin base (no se borra nada).`)
}

run('datos de prueba sintéticos', () => {
  it('crea finanzas.sqlite en la carpeta indicada', async () => {
    comprobarCarpeta(dir!)
    fs.mkdirSync(dir!, { recursive: true })
    const file = path.join(dir!, 'finanzas.sqlite')
    const db = await Db.open(file)
    const s = AppState.init(db, { dbPath: file, backupsDir: null })
    // Cada escritura del montaje pasa por la cola (runNow) y se guarda en disco, como en la app
    buildSyntheticApp(s)
    expect(fs.existsSync(file)).toBe(true)
  })
})
