// Abre la app compilada con Electron y hace capturas de cada pantalla, en oscuro y en claro.
// SIEMPRE con datos de prueba: nunca contra %APPDATA%\Finanzas ni con capturas con datos reales en el repo.
//
// Uso:
//   FINANZAS_DATA_DIR=<carpeta con datos de prueba> node scripts/screenshots.mjs <carpeta-salida> [ruta[:variante]...]
//
// Rutas: las del hash router (/, /finanzas, /finanzas/movimientos, /entreno, /ajustes…). Si no se indica ninguna,
// se hacen las de Inicio, Finanzas, Entreno y Ajustes.
// Variantes (se pueden unir con «+»): plegada, paleta, asistente, nuevo, completa, desplegar (Más detalle del Panel),
// fila (abre la primera fila de Movimientos), filtros (panel de filtros avanzados), transferencia (atajo T) y error (nuevo movimiento vacío, al guardar).
//   /:plegada            barra lateral plegada
//   /finanzas:paleta     buscador Ctrl+K abierto
//   /:asistente          panel del asistente abierto
//   /ajustes:completa    ajusta la altura de la ventana a todo el contenido
// Opciones por entorno:
//   VIEWPORT=1440x900    tamaño de la ventana (por defecto 1440x900)
//   TEMAS=oscuro,claro   temas a capturar (por defecto, ambos; se fuerza data-theme)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const outDir = process.argv[2] ?? 'test-output/screens'
const args = process.argv.slice(3)
const specs = (args.length ? args : ['/', '/finanzas', '/entreno', '/ajustes']).map((a) => {
  const i = a.indexOf(':')
  return { ruta: i < 0 ? a : a.slice(0, i), variantes: i < 0 ? [] : a.slice(i + 1).split('+') }
})
const [vw, vh] = (process.env.VIEWPORT ?? '1440x900').split('x').map(Number)
const temas = (process.env.TEMAS ?? 'oscuro,claro').split(',')
fs.mkdirSync(outDir, { recursive: true })

const app = await electron.launch({
  executablePath: require('electron'),
  args: ['--no-sandbox', '.'],
  env: { ...process.env, FINANZAS_DATA_DIR: process.env.FINANZAS_DATA_DIR ?? '' }
})
const win = await app.firstWindow()
const errors = []
win.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: vw, height: vh })
await win.waitForTimeout(1800)

const nombre = (ruta) => (ruta === '/' ? 'inicio' : ruta.slice(1).replace(/[/?=&]/g, '_'))
for (const { ruta, variantes } of specs) {
  for (const tema of temas) {
    await win.setViewportSize({ width: vw, height: vh })
    // Barra lateral plegada o no: se fija antes de entrar y se recarga la pantalla
    await win.evaluate((p) => (p ? localStorage.setItem('finanzas-barra-plegada', '1') : localStorage.removeItem('finanzas-barra-plegada')), variantes.includes('plegada'))
    await win.evaluate((h) => (window.location.hash = h), '#/__vacio__')
    await win.evaluate(() => window.location.reload())
    await win.waitForTimeout(900)
    await win.evaluate((h) => (window.location.hash = h), '#' + ruta)
    await win.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema === 'claro' ? 'light' : 'dark')
    await win.waitForTimeout(1200)
    if (variantes.includes('paleta')) {
      await win.keyboard.press('Control+k')
      await win.waitForTimeout(400)
    }
    if (variantes.includes('asistente')) {
      await win.click('button[aria-label="Abrir el asistente"]')
      await win.waitForTimeout(500)
    }
    if (variantes.includes('nuevo')) {
      await win.keyboard.press('n')
      await win.waitForTimeout(600)
    }
    if (variantes.includes('desplegar')) {
      await win.getByRole('button', { name: 'Desplegar todo' }).click()
      await win.waitForTimeout(500)
    }
    if (variantes.includes('fila')) {
      await win.locator('table.table tbody tr.row button[aria-expanded]').first().click()
      await win.waitForTimeout(400)
    }
    if (variantes.includes('filtros')) {
      await win.getByRole('button', { name: /^Filtros/ }).click()
      await win.waitForTimeout(400)
    }
    if (variantes.includes('transferencia')) {
      await win.keyboard.press('t')
      await win.waitForTimeout(600)
    }
    if (variantes.includes('error')) {
      await win.keyboard.press('n')
      await win.waitForTimeout(500)
      await win.getByRole('button', { name: 'Guardar', exact: true }).click()
      await win.waitForTimeout(500)
    }
    if (variantes.includes('completa')) {
      const h = await win.evaluate(() => (document.querySelector('main')?.scrollHeight ?? 900) + 56 + 8)
      await win.setViewportSize({ width: vw, height: Math.min(Math.max(vh, h), 4000) })
      await win.waitForTimeout(400)
    }
    const nom = `${nombre(ruta)}${variantes.length ? '-' + variantes.join('-') : ''}-${tema}${vw !== 1440 ? `-${vw}x${vh}` : ''}.png`
    await win.screenshot({ path: path.join(outDir, nom) })
    console.log('captura', nom)
  }
}
console.log('ERRORES', JSON.stringify(errors, null, 1))
await app.close()
