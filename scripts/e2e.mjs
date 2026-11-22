// Prueba de extremo a extremo sobre la app compilada: alta, búsqueda, edición y recálculo.
// Uso: FINANZAS_DATA_DIR=<copia de datos> xvfb-run node scripts/e2e.mjs <carpeta-capturas>
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { exigirDatosDePrueba } from './datos-prueba.mjs'

exigirDatosDePrueba('e2e')
const require = createRequire(import.meta.url)
const out = process.argv[2] ?? 'test-output/e2e'
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', '.'], env: { ...process.env } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await win.setViewportSize({ width: 1440, height: 960 })
const shot = (n) => win.screenshot({ path: path.join(out, n + '.png') })
// El disponible vive en la tarjeta #disponible del Panel (/finanzas): se vuelve a él antes de leerlo
const available = async () => {
  await win.evaluate(() => (window.location.hash = '#/finanzas'))
  await win.waitForSelector('#disponible .kpi-num')
  await win.waitForTimeout(400)
  return (await win.locator('#disponible .kpi-num').first().innerText()).trim()
}
const dialogo = () => win.locator('[role="dialog"][aria-modal="true"]')

await win.evaluate(() => (window.location.hash = '#/finanzas'))
await win.waitForSelector('text=Disponible para gastar')
const before = await available()
console.log('Disponible antes:', before)

// 1) Alta rápida con la tecla N
await win.keyboard.press('n')
await win.getByRole('dialog', { name: 'Nuevo gasto' }).waitFor()
const dlg = dialogo()
await dlg.locator('input[inputmode="decimal"]').first().fill('12,34')
await dlg.getByPlaceholder('Ej.: Mercadona, Nómina octubre…').fill('Prueba e2e supermercado')
await dlg.getByLabel('Categoría', { exact: true }).selectOption({ index: 1 }) // la primera categoría del catálogo ("Food" en la copia de datos original)
await win.waitForTimeout(400)
await shot('01-alta')
await dlg.getByRole('button', { name: 'Guardar', exact: true }).click()
await dialogo().waitFor({ state: 'detached' })
await win.waitForTimeout(600)
const after = await available()
console.log('Disponible después:', after)
assert.notEqual(before, after, 'el disponible debe cambiar tras el alta')

// 2) Buscarlo en Movimientos
await win.evaluate(() => (window.location.hash = '#/finanzas/movimientos'))
await win.getByPlaceholder('Buscar descripción, comercio, nota, importe…').fill('e2e')
await win.waitForTimeout(900)
const row = win.locator('tr', { hasText: 'Prueba e2e supermercado' })
assert.equal(await row.count(), 1, 'el movimiento aparece en el historial')
await shot('02-busqueda')

// 3) Abrir la fila y editarlo
await row.click()
await win.getByRole('button', { name: 'Editar', exact: true }).waitFor()
await shot('03-fila-abierta')
await win.getByRole('button', { name: 'Editar', exact: true }).click()
await win.getByRole('dialog', { name: /Editar movimiento/ }).waitFor()
const edit = dialogo()
await win.waitForTimeout(500)
const amount = edit.locator('input[inputmode="decimal"]').first()
await amount.fill('20')
await win.waitForTimeout(400)
await edit.getByRole('button', { name: 'Guardar', exact: true }).click()
await dialogo().waitFor({ state: 'detached' })
await win.waitForTimeout(700)
assert.ok((await win.locator('tr', { hasText: 'Prueba e2e supermercado' }).first().innerText()).includes('-20,00'), 'el importe editado se ve en la tabla')

// 4) Transferencia con la tecla T
const beforeT = await available()
await win.keyboard.press('t')
await win.getByRole('dialog', { name: 'Nueva transferencia' }).waitFor()
const t = dialogo()
await t.locator('input[inputmode="decimal"]').first().fill('5')
// Sale de la cuenta líquida por defecto y entra en una hucha (así el disponible cambia), sea cual sea el nombre en cada base de datos
const destinos = await t.getByLabel('Entra en (destino)').locator('option').allInnerTexts()
await t.getByLabel('Entra en (destino)').selectOption({ label: destinos.find((o) => /hucha|colch/i.test(o)) ?? destinos.at(-1) })
await win.waitForTimeout(300)
await shot('04-transferencia')
await t.getByRole('button', { name: 'Guardar', exact: true }).click()
await dialogo().waitFor({ state: 'detached' })
await win.waitForTimeout(700)
const afterT = await available()
console.log('Disponible tras transferencia:', beforeT, '->', afterT)
assert.notEqual(beforeT, afterT)
await shot('05-panel-final')

// 5) Revisión de duplicados visible (el botón «Revisar ahora» de Inicio lleva aquí)
await win.evaluate(() => (window.location.hash = '#/finanzas/movimientos?vista=revision'))
await win.waitForTimeout(800)
await shot('06-revision')

console.log('ERRORES', JSON.stringify(errors))
assert.equal(errors.length, 0, 'sin errores en la consola')
await app.close()
console.log('E2E OK')
