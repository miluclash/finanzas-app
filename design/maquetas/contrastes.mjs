// Mide los contrastes de tokens.css (WCAG 2) en núcleo, Finanzas y Entreno, en oscuro y claro.
// Uso:  node design/maquetas/contrastes.mjs          (informe en consola)
//       node design/maquetas/contrastes.mjs --escribir (además, lo deja como comentario al principio de tokens.css)
// Reglas: texto normal 4,5:1, elementos de interfaz y marcas 3:1.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const cssPath = path.join(aqui, 'tokens.css')
const skill =
  process.env.DATAVIZ_SCRIPTS ??
  'C:/Users/Michael/AppData/Local/Temp/claude/bundled-skills/2.1.325/924b00f67beb54ec5eb6b9a155e5555a/dataviz/scripts'

// Contraste WCAG 2 propio (no depende de la skill)
const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
const lum = (h) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

// --- leer tokens.css ---------------------------------------------------------
const css = fs.readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const core = { dark: {}, light: {} }
const mod = { dark: {}, light: {} }
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const vars = [...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((v) => [v[1], v[2].trim()])
  if (!vars.length) continue
  for (const sel of m[1].split(',').map((s) => s.trim())) {
    const light = /data-theme=['"]light['"]/.test(sel)
    const mm = /data-module=['"](\w+)['"]/.exec(sel)
    const theme = light ? 'light' : 'dark'
    const target = mm ? (mod[theme][mm[1]] ??= {}) : core[theme]
    for (const [k, v] of vars) target[k] = v
  }
}
const resolve = (theme, modulo) => {
  const vars = { ...core[theme], ...(modulo ? mod[theme][modulo] : {}) }
  const get = (k, depth = 0) => {
    const v = vars[k]
    const ref = v && /^var\((--[\w-]+)\)$/.exec(v)
    return ref && depth < 5 ? get(ref[1], depth + 1) : v
  }
  return (name) => get('--' + name)
}

// --- pares a comprobar -------------------------------------------------------
// [primer token, segundo token, mínimo, qué es]
const T = 4.5 // texto normal
const U = 3 // elemento de interfaz / marca
const pares = [
  ['ink', 'bg', T, 'texto principal / fondo'],
  ['ink', 'surface-1', T, 'texto principal / tarjeta'],
  ['ink', 'surface-3', T, 'texto principal / seleccionado'],
  ['ink-2', 'bg', T, 'texto secundario / fondo'],
  ['ink-2', 'surface-1', T, 'texto secundario / tarjeta'],
  ['ink-2', 'surface-3', T, 'texto secundario / seleccionado'],
  ['ink-3', 'bg', T, 'texto apagado / fondo'],
  ['ink-3', 'surface-1', T, 'texto apagado / tarjeta'],
  ['ink-3', 'surface-2', T, 'texto apagado / superficie 2'],
  ['ink-3', 'surface-3', T, 'texto apagado / seleccionado'],
  ['accent-text', 'bg', T, 'texto de acento / fondo'],
  ['accent-text', 'surface-1', T, 'texto de acento / tarjeta'],
  ['accent-text', 'surface-2', T, 'texto de acento / superficie 2'],
  ['accent-text', 'accent-soft', T, 'texto de acento / acento suave'],
  ['accent-mark', 'surface-1', U, 'marca de acento / tarjeta'],
  ['on-primary', 'primary', T, 'texto del botón primario'],
  ['primary-edge', 'surface-1', U, 'borde del botón primario / tarjeta'],
  ['primary-edge', 'bg', U, 'borde del botón primario / fondo'],
  ['control', 'surface-1', U, 'borde de campo / tarjeta'],
  ['control', 'surface-2', U, 'borde de campo / superficie 2'],
  ['control', 'bg', U, 'borde de campo / fondo'],
  ['focus', 'surface-1', U, 'anillo de foco / tarjeta'],
  ['focus', 'bg', U, 'anillo de foco / fondo'],
  ['pos', 'surface-1', T, 'positivo / tarjeta'],
  ['pos', 'surface-2', T, 'positivo / superficie 2'],
  ['pos', 'pos-soft', T, 'positivo / su fondo suave'],
  ['neg', 'surface-1', T, 'negativo / tarjeta'],
  ['neg', 'surface-2', T, 'negativo / superficie 2'],
  ['neg', 'neg-soft', T, 'negativo / su fondo suave'],
  ['warn', 'surface-1', T, 'aviso / tarjeta'],
  ['warn', 'surface-2', T, 'aviso / superficie 2'],
  ['warn', 'warn-soft', T, 'aviso / su fondo suave'],
  ['series-1', 'surface-1', U, 'serie 1 / tarjeta'],
  ['series-2', 'surface-1', U, 'serie 2 / tarjeta'],
  ['series-3', 'surface-1', U, 'serie 3 / tarjeta'],
  ['series-4', 'surface-1', U, 'serie 4 / tarjeta'],
  ['muted-mark', 'surface-1', U, 'gris de contexto / tarjeta'],
  ['track', 'surface-1', 1.1, 'pista de medidor (decorativa)'],
  ['hero-ink', 'hero-bg', T, 'marcador: cifra / fondo'],
  ['hero-ink-2', 'hero-bg', T, 'marcador: texto secundario / fondo'],
  ['hero-accent', 'hero-bg', T, 'marcador: acento / fondo'],
  ['hero-mark', 'hero-bg', U, 'marcador: marca principal / fondo'],
  ['hero-mark-dim', 'hero-bg', U, 'marcador: marca secundaria / fondo']
]
const contextos = [
  ['oscuro', 'núcleo', 'dark', null],
  ['oscuro', 'Finanzas', 'dark', 'finanzas'],
  ['oscuro', 'Entreno', 'dark', 'entreno'],
  ['claro', 'núcleo', 'light', null],
  ['claro', 'Finanzas', 'light', 'finanzas'],
  ['claro', 'Entreno', 'light', 'entreno']
]

const lineas = []
let fallos = 0
let total = 0
for (const [tema, nombre, theme, modulo] of contextos) {
  const v = resolve(theme, modulo)
  const peor = {}
  let f = 0
  for (const [a, b, min, desc] of pares) {
    const ca = v(a), cb = v(b)
    if (!ca || !cb) { lineas.push(`  FALTA ${tema} ${nombre}: ${a} / ${b}`); f++; continue }
    const r = ratio(ca, cb)
    total++
    if (r < min) { f++; lineas.push(`  FALLA ${tema} ${nombre}: ${desc} (${a} ${ca} / ${b} ${cb}) = ${r.toFixed(2)} < ${min}`) }
    const k = min === T ? 'texto' : min === U ? 'interfaz' : null
    if (k && (!peor[k] || r < peor[k][0])) peor[k] = [r, `${a}/${b}`]
  }
  fallos += f
  const t = peor.texto, u = peor.interfaz
  lineas.push(`  ${tema.padEnd(6)} ${nombre.padEnd(8)} ${f === 0 ? 'OK ' : 'MAL'}  peor texto ${t[0].toFixed(2)}:1 (${t[1]})  peor interfaz ${u[0].toFixed(2)}:1 (${u[1]})`)
}

// Contrastes que más importan, para el informe
const destacados = [
  ['oscuro Entreno', 'dark', 'entreno', [['accent-text', 'surface-1'], ['on-primary', 'primary'], ['ink-3', 'surface-1']]],
  ['claro Entreno', 'light', 'entreno', [['accent-text', 'surface-1'], ['accent-mark', 'surface-1'], ['primary-edge', 'surface-1'], ['on-primary', 'primary'], ['hero-accent', 'hero-bg']]],
  ['oscuro Finanzas', 'dark', 'finanzas', [['accent-text', 'surface-1'], ['pos', 'surface-1'], ['neg', 'surface-1']]],
  ['claro Finanzas', 'light', 'finanzas', [['accent-text', 'surface-1'], ['pos', 'surface-1'], ['neg', 'surface-1']]]
]
const det = []
for (const [n, theme, modulo, ps] of destacados) {
  const v = resolve(theme, modulo)
  det.push(`  ${n}: ` + ps.map(([a, b]) => `${a}/${b} ${ratio(v(a), v(b)).toFixed(2)}`).join(' · '))
}

// --- validador de paletas de la skill dataviz (series de gráfico) ------------
let validar = null
try {
  validar = (await import(pathToFileURL(path.join(skill, 'validate_palette.js')).href)).validate
} catch {
  /* la skill no está en esta máquina: se omite esta parte */
}
const palLineas = []
if (validar) {
  for (const [tema, nombre, theme, modulo] of contextos.filter((c) => c[3])) {
    const v = resolve(theme, modulo)
    const pal = [1, 2, 3, 4].map((i) => v('series-' + i))
    const r = validar(pal, { mode: theme, surface: v('surface-1') })
    const partes = r.report.map(([n, estado, d]) => `${n}: ${typeof estado === 'boolean' ? (estado ? 'pasa' : 'FALLA') : estado}`)
    const cvd = r.report[2][2].replace(/^worst adjacent /, '')
    palLineas.push(`  ${tema} ${nombre} [${pal.join(' ')}] ${r.ok ? 'PASA' : 'FALLA'} · ${partes.join(' · ')}`)
    palLineas.push(`      ${cvd}`)
    if (!r.ok) fallos++
  }
}

const informe = [
  `CONTRASTES (generado por design/maquetas/contrastes.mjs; ${total} comprobaciones, ${fallos} fallos)`,
  'Mínimos: texto normal 4,5:1 · elementos de interfaz y marcas 3:1.',
  ...lineas,
  'Destacados:',
  ...det,
  ...(palLineas.length ? ['Paletas de series (validador de la skill dataviz, adyacentes, sobre surface-1):', ...palLineas] : [])
].join('\n')
console.log(informe)

if (process.argv.includes('--escribir')) {
  const bloque = '/* ' + informe.replace(/\*\//g, '* /') + '\n*/'
  let src = fs.readFileSync(cssPath, 'utf8')
  if (src.includes('/*@@CONTRASTES@@*/')) src = src.replace('/*@@CONTRASTES@@*/', bloque + '\n/*@@FIN-CONTRASTES@@*/')
  else src = src.replace(/^\/\* CONTRASTES[\s\S]*?\*\/\n\/\*@@FIN-CONTRASTES@@\*\//, bloque + '\n/*@@FIN-CONTRASTES@@*/')
  fs.writeFileSync(cssPath, src)
  console.log('\nEscrito en tokens.css')
}
process.exit(fallos ? 1 : 0)
