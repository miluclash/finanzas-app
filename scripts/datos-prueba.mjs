// Guardia de los scripts que abren la app (e2e, capturas): solo con una carpeta de datos de prueba explícita.
// Se niegan a arrancar sin FINANZAS_DATA_DIR (la app usaría los datos reales) o si apunta a los datos reales
// (%APPDATA%\Finanzas) o a la línea base del dorado (%APPDATA%\Finanzas-golden / FINANZAS_GOLDEN_DIR).
import fs from 'node:fs'
import path from 'node:path'

/** Ruta real y comparable (sin mayúsculas en Windows); si la carpeta no existe, por su carpeta existente más cercana */
function rutaReal(p) {
  let actual = path.resolve(p)
  const resto = []
  while (!fs.existsSync(actual) && path.dirname(actual) !== actual) {
    resto.unshift(path.basename(actual))
    actual = path.dirname(actual)
  }
  const r = path.join(fs.existsSync(actual) ? fs.realpathSync.native(actual) : actual, ...resto)
  return process.platform === 'win32' ? r.toLowerCase() : r
}

export function exigirDatosDePrueba(nombreScript) {
  const dir = process.env.FINANZAS_DATA_DIR
  if (!dir || !dir.trim()) {
    console.error(`${nombreScript}: falta FINANZAS_DATA_DIR. Sin ella la app arrancaría sobre tus datos reales.\nGenera una base de prueba (FINANZAS_DATOS_PRUEBA_DIR=<carpeta nueva> npx vitest run tests/datos-prueba.local.test.ts) y apunta FINANZAS_DATA_DIR a esa carpeta.`)
    process.exit(1)
  }
  const appdata = process.env.APPDATA ?? ''
  const prohibidas = [path.join(appdata, 'Finanzas'), path.join(appdata, 'Finanzas-golden'), process.env.FINANZAS_GOLDEN_DIR ?? ''].filter(Boolean)
  const destino = rutaReal(dir)
  if (prohibidas.some((p) => rutaReal(p) === destino)) {
    console.error(`${nombreScript}: FINANZAS_DATA_DIR (${dir}) es la carpeta de datos reales o de la línea base del dorado. Usa una carpeta de datos de prueba.`)
    process.exit(1)
  }
}
