// Abre la app compilada con Electron (Xvfb en Linux) y hace capturas de cada pantalla.
// Uso: FINANZAS_DATA_DIR=<carpeta> node scripts/screenshots.mjs <carpeta-salida> [rutas...]
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const outDir = process.argv[2] ?? 'test-output/screens'
const routes = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/movimientos', '/cuentas', '/presupuestos', '/recurrentes', '/objetivos', '/patrimonio', '/prevision', '/inversiones', '/ajustes']
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
await win.setViewportSize({ width: 1440, height: 960 })
await win.waitForTimeout(1500)
for (const r of routes) {
  await win.setViewportSize({ width: 1440, height: 960 })
  await win.evaluate((h) => (window.location.hash = h), '#' + r)
  await win.waitForTimeout(1200)
  const h = await win.evaluate(() => Math.max(960, (document.querySelector('main')?.scrollHeight ?? 900) + 10))
  await win.setViewportSize({ width: 1440, height: Math.min(h, 4000) })
  await win.waitForTimeout(400)
  const name = (r === '/' ? 'panel' : r.slice(1).replace(/[/?=&]/g, '_')) + '.png'
  await win.screenshot({ path: path.join(outDir, name), fullPage: true })
  console.log('captura', name)
}
if (process.env.THEME_DARK) {
  await win.evaluate(() => document.documentElement.classList.add('dark'))
  await win.evaluate(() => (window.location.hash = '#/'))
  await win.waitForTimeout(1000)
  await win.screenshot({ path: path.join(outDir, 'panel-oscuro.png'), fullPage: true })
}
console.log('ERRORES', JSON.stringify(errors, null, 1))
await app.close()
