// Captura las maquetas de design/maquetas en oscuro y claro (1440x900 y, si la pantalla es más alta, página completa).
// Además: Inicio y Entreno a 1024x768 y una muestra de Inicio y Finanzas con el escalado de Windows al 125 % y al 150 %.
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

const A = { w: 1440, h: 900, scale: 1 }
const pantallas = [
  { n: '01', slug: 'inicio', hash: '#/inicio' },
  { n: '02', slug: 'finanzas', hash: '#/finanzas' },
  { n: '03', slug: 'finanzas-detalle', hash: '#/finanzas', query: 'abre=proximos,acumulado,categorias,objetivos,patrimonio,tasa,ultimos' },
  { n: '04', slug: 'movimientos', hash: '#/movimientos' },
  { n: '05', slug: 'movimientos-filtros-avanzados', hash: '#/movimientos', query: 'filtros=1' },
  { n: '06', slug: 'movimientos-confirmar-anular', hash: '#/movimientos', query: 'anular=1', sinCompleta: true },
  { n: '07', slug: 'entreno', hash: '#/entreno' },
  { n: '08', slug: 'ajustes', hash: '#/ajustes' },
  { n: '09', slug: 'ajustes-error-validacion', hash: '#/ajustes', query: 'demo=error' },
  { n: '10', slug: 'ajustes-guardado', hash: '#/ajustes', query: 'demo=guardado' },
  { n: '11', slug: 'ajustes-confirmar-restaurar', hash: '#/ajustes', query: 'restaurar=1', sinCompleta: true },
  { n: '12', slug: 'sistema-fundamentos', hash: '#/sistema' },
  { n: '13', slug: 'sistema-componentes', hash: '#/sistema/componentes' },
  { n: '14', slug: 'sistema-estructura', hash: '#/sistema/estructura' },
  { n: '15', slug: 'sistema-graficos', hash: '#/sistema/graficos' },
  { n: '16', slug: 'paleta-barra-plegada', hash: '#/finanzas', query: 'paleta=1&plegada=1', sinCompleta: true },
  { n: '17', slug: 'barra-plegada-tooltip', hash: '#/finanzas', query: 'plegada=1&tooltip=finanzas', sinCompleta: true },
  { n: '18', slug: 'asistente-abierto', hash: '#/finanzas', query: 'ia=1', sinCompleta: true },
  { n: '19', slug: 'nuevo-movimiento', hash: '#/movimientos', query: 'nuevo=1', sinCompleta: true },
  { n: '20', slug: 'nuevo-transferencia', hash: '#/movimientos', query: 'nuevo=transferencia', sinCompleta: true },
  { n: '21', slug: 'nuevo-error-guardando', hash: '#/movimientos', query: 'nuevo=error', sinCompleta: true },
  { n: '22', slug: 'inicio-1024', hash: '#/inicio', vp: { w: 1024, h: 768, scale: 1 } },
  { n: '23', slug: 'entreno-1024', hash: '#/entreno', vp: { w: 1024, h: 768, scale: 1 } },
  { n: '28', slug: 'asistente-1024-superpuesto', hash: '#/finanzas', query: 'ia=1', vp: { w: 1024, h: 768, scale: 1 } },
  { n: '24', slug: 'inicio-125', hash: '#/inicio', vp: { w: 1152, h: 720, scale: 1.25 } },
  { n: '25', slug: 'finanzas-125', hash: '#/finanzas', vp: { w: 1152, h: 720, scale: 1.25 } },
  { n: '26', slug: 'inicio-150', hash: '#/inicio', vp: { w: 960, h: 600, scale: 1.5 } },
  { n: '27', slug: 'finanzas-150', hash: '#/finanzas', vp: { w: 960, h: 600, scale: 1.5 } }
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
// Captura completa: se borran las antiguas para que no queden pantallas que ya no existen
if (!filtro) for (const f of fs.readdirSync(salida)) if (f.endsWith('.png')) fs.rmSync(path.join(salida, f))

const errores = []
let browser
try {
  await esperarServidor()
  browser = await chromium.launch({ executablePath: edge })
  for (const tema of ['oscuro', 'claro']) {
    for (const p of pantallas) {
      const vp = p.vp ?? A
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.scale, locale: 'es-ES', colorScheme: tema === 'oscuro' ? 'dark' : 'light' })
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
      // Comprobación de desbordes: nada cortado por los lados
      const desborde = await page.evaluate(() => {
        const el = document.getElementById('contenido')
        return { x: document.documentElement.scrollWidth - document.documentElement.clientWidth, c: el ? el.scrollWidth - el.clientWidth : 0 }
      })
      if (desborde.x > 1 || desborde.c > 1) errores.push(`${nombre}: desborde horizontal (${JSON.stringify(desborde)})`)
      // Página completa: el scroll vive en #contenido, así que se agranda la ventana
      const extra = await page.evaluate(() => {
        const el = document.getElementById('contenido')
        return el ? el.scrollHeight - el.clientHeight : 0
      })
      if (extra > 8 && !p.sinCompleta && !p.vp) {
        await page.setViewportSize({ width: vp.w, height: Math.min(vp.h + extra, 9000) })
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
  console.error('\nERRORES:\n' + [...new Set(errores)].join('\n'))
  process.exit(1)
}
console.log('\nSin errores de consola ni desbordes.')
