// Captura las maquetas de design/maquetas en oscuro y claro (1440x900, y página completa si es más alta).
// Uso: npm run maquetas:capturas [-- <filtro>]   (el filtro es un trozo del nombre, p. ej. "entreno")
// Arranca el servidor de Vite de las maquetas, captura con Edge y lo cierra. Falla si hay errores de consola.
import { chromium } from 'playwright-core'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const salida = path.join(raiz, 'design', 'capturas')
const PUERTO = 5199
const base = `http://127.0.0.1:${PUERTO}/`
const filtro = process.argv[2]

const pantallas = [
  { n: '01', slug: 'inicio', hash: '#/inicio' },
  { n: '02', slug: 'finanzas', hash: '#/finanzas' },
  { n: '03', slug: 'finanzas-detalle', hash: '#/finanzas', query: 'abre=proximos,acumulado,categorias,objetivos,patrimonio,tasa,ultimos' },
  { n: '04', slug: 'movimientos', hash: '#/movimientos' },
  { n: '05', slug: 'entreno', hash: '#/entreno' },
  { n: '06', slug: 'ajustes', hash: '#/ajustes' },
  { n: '07', slug: 'sistema', hash: '#/sistema' },
  { n: '08', slug: 'paleta-barra-plegada', hash: '#/finanzas', query: 'paleta=1&plegada=1', sinCompleta: true },
  { n: '09', slug: 'asistente-abierto', hash: '#/finanzas', query: 'ia=1&plegada=1' },
  { n: '10', slug: 'nuevo-movimiento', hash: '#/movimientos', query: 'nuevo=1', sinCompleta: true }
].filter((p) => !filtro || `${p.n}-${p.slug}`.includes(filtro))

const edge = [process.env.MSEDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find((p) => fs.existsSync(p))
if (!edge) {
  console.error('No encuentro Microsoft Edge. Define MSEDGE_PATH con la ruta de msedge.exe.')
  process.exit(1)
}

// --- servidor de Vite ---
const vite = spawn(process.execPath, [path.join(raiz, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'design/maquetas/vite.config.ts'], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] })
let viteLog = ''
vite.stdout.on('data', (d) => (viteLog += d))
vite.stderr.on('data', (d) => (viteLog += d))
const parar = () => {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' })
    else vite.kill('SIGTERM')
  } catch {
    /* ya estaba cerrado */
  }
}
process.on('exit', parar)

async function esperarServidor() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base)
      if (r.ok) return
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('El servidor de las maquetas no arrancó:\n' + viteLog)
}

fs.mkdirSync(salida, { recursive: true })
const errores = []
let browser
try {
  await esperarServidor()
  browser = await chromium.launch({ executablePath: edge })
  for (const tema of ['oscuro', 'claro']) {
    for (const p of pantallas) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-ES', colorScheme: tema === 'oscuro' ? 'dark' : 'light' })
      const page = await ctx.newPage()
      const nombre = `${p.n}-${p.slug}-${tema}`
      page.on('console', (m) => m.type() === 'error' && errores.push(`${nombre}: ${m.text()}`))
      page.on('pageerror', (e) => errores.push(`${nombre}: ${e.message}`))
      const q = `tema=${tema === 'oscuro' ? 'dark' : 'light'}${p.query ? '&' + p.query : ''}`
      await page.goto(`${base}?${q}${p.hash}`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(900) // gráficos y animaciones de entrada
      await page.screenshot({ path: path.join(salida, `${nombre}.png`) })
      console.log('captura', nombre)
      // Página completa: el scroll vive en #contenido, así que se agranda la ventana
      const extra = await page.evaluate(() => {
        const el = document.getElementById('contenido')
        return el ? el.scrollHeight - el.clientHeight : 0
      })
      if (extra > 8 && !p.sinCompleta) {
        await page.setViewportSize({ width: 1440, height: Math.min(900 + extra, 9000) })
        await page.waitForTimeout(700)
        await page.screenshot({ path: path.join(salida, `${nombre}-completa.png`) })
        console.log('captura', `${nombre}-completa`)
      }
      await ctx.close()
    }
  }
} finally {
  await browser?.close()
  parar()
}

if (errores.length) {
  console.error('\nERRORES DE CONSOLA:\n' + [...new Set(errores)].join('\n'))
  process.exit(1)
}
console.log('\nSin errores de consola.')
