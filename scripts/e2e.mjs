// Prueba de extremo a extremo sobre la app compilada: alta, búsqueda, edición y recálculo.
// Uso: FINANZAS_DATA_DIR=<copia de datos> xvfb-run node scripts/e2e.mjs <carpeta-capturas>
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

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
const available = async () => (await win.locator('text=Disponible para gastar').locator('xpath=..').locator('.num').first().innerText()).trim()

await win.waitForSelector('text=Disponible para gastar')
const before = await available()
console.log('Disponible antes:', before)

// 1) Alta rápida con la tecla N
await win.keyboard.press('n')
await win.waitForSelector('dialog[open] >> text=Nuevo movimiento')
const dlg = win.locator('dialog[open]')
await dlg.locator('input[inputmode="decimal"]').first().fill('12,34')
await dlg.getByPlaceholder('Ej.: Mercadona, Nómina octubre…').fill('Prueba e2e supermercado')
await dlg.locator('select').nth(1).selectOption({ label: 'Food' })
await win.waitForTimeout(400)
await shot('01-alta')
await dlg.getByRole('button', { name: 'Guardar', exact: true }).click()
await win.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {})
await win.waitForTimeout(600)
const after = await available()
console.log('Disponible después:', after)
assert.notEqual(before, after, 'el disponible debe cambiar tras el alta')

// 2) Buscarlo en Movimientos
await win.evaluate(() => (window.location.hash = '#/movimientos'))
await win.getByPlaceholder('Buscar descripción, comercio, nota, importe…').fill('e2e')
await win.waitForTimeout(800)
const row = win.locator('tr', { hasText: 'Prueba e2e supermercado' })
assert.equal(await row.count(), 1, 'el movimiento aparece en el historial')
await shot('02-busqueda')

// 3) Editarlo
await row.click()
await win.waitForSelector('dialog[open] >> text=Editar movimiento')
const edit = win.locator('dialog[open]')
await win.waitForTimeout(500)
const amount = edit.locator('input[inputmode="decimal"]').first()
await amount.fill('20')
await win.waitForTimeout(400)
await edit.getByRole('button', { name: 'Guardar', exact: true }).click()
await win.waitForTimeout(800)
assert.ok((await win.locator('tr', { hasText: 'Prueba e2e supermercado' }).innerText()).includes('-20,00'), 'el importe editado se ve en la tabla')

// 4) Transferencia con la tecla T
await win.evaluate(() => (window.location.hash = '#/'))
await win.waitForTimeout(500)
const beforeT = await available()
await win.keyboard.press('t')
await win.waitForSelector('dialog[open] >> text=Nueva transferencia')
const t = win.locator('dialog[open]')
await t.locator('input[inputmode="decimal"]').first().fill('5')
await t.locator('select').nth(1).selectOption({ label: 'Cuenta corriente' })
await t.locator('select').nth(2).selectOption({ label: 'Colchon de Seguridad' })
await win.waitForTimeout(300)
await shot('03-transferencia')
await t.getByRole('button', { name: 'Guardar', exact: true }).click()
await win.waitForTimeout(800)
const afterT = await available()
console.log('Disponible tras transferencia:', beforeT, '->', afterT)
assert.notEqual(beforeT, afterT)
await shot('04-panel-final')

// 5) Revisión de duplicados visible
await win.evaluate(() => (window.location.hash = '#/movimientos?vista=revision'))
await win.waitForTimeout(800)
await shot('05-revision')

console.log('ERRORES', JSON.stringify(errors))
assert.equal(errors.length, 0, 'sin errores en la consola')
await app.close()
console.log('E2E OK')
