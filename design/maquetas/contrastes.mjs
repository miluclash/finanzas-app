// Mide los contrastes de tokens.css (WCAG 2) en núcleo, Finanzas y Entreno, en oscuro y claro.
// Uso:  node design/maquetas/contrastes.mjs          (informe en consola)
//       node design/maquetas/contrastes.mjs --escribir (además, lo deja como comentario al principio de tokens.css)
// Reglas: texto normal 4,5:1, elementos de interfaz y marcas 3:1.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const cssPath = path.join(aqui, 'tokens.css')
// Carpeta del validador de paletas de la skill dataviz (validate_palette.js). Sin ella, esa parte se salta.
const skill = process.env.DATAVIZ_SCRIPTS

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
  // Texto en cuatro niveles sobre cada superficie
  ...['canvas', 'sidebar', 'card', 'raised', 'interactive'].flatMap((s) => [
    ['ink', s, T, `texto principal / ${s}`],
    ['ink-2', s, T, `texto secundario / ${s}`],
    ['ink-3', s, T, `texto terciario / ${s}`]
  ]),
  ['ink-disabled', 'card', 2.5, 'texto deshabilitado / card (solo informativo)'],
  // Acento
  ...['canvas', 'card', 'raised', 'interactive', 'accent-soft'].map((s) => ['accent-text', s, T, `texto de acento / ${s}`]),
  ['accent-mark', 'card', U, 'marca de acento / card'],
  ['accent-mark', 'raised', U, 'marca de acento / elevado'],
  ['accent-mark', 'track', U, 'relleno de progreso / pista'],
  ['on-primary', 'primary', T, 'texto del botón primario'],
  ['on-accent', 'accent', T, 'texto del botón de acento'],
  ['primary-edge', 'card', U, 'borde del botón primario / card'],
  ['primary-edge', 'canvas', U, 'borde del botón primario / lienzo'],
  // Controles
  ...['canvas', 'card', 'raised', 'interactive'].flatMap((s) => [
    ['control', s, U, `borde de campo / ${s}`],
    ['focus', s, U, `anillo de foco / ${s}`]
  ]),
  // Estados: texto 4,5 sobre cada superficie y sobre su fondo suave
  ...['success', 'warning', 'error', 'info'].flatMap((e) => [
    ...['canvas', 'card', 'raised', 'interactive'].map((s) => [e, s, T, `${e} / ${s}`]),
    [e, `${e}-soft`, T, `${e} / su fondo suave`]
  ]),
  // Gráficos
  ['series-1', 'card', U, 'serie 1 / card'],
  ['series-2', 'card', U, 'serie 2 / card'],
  ['series-3', 'card', U, 'serie 3 / card'],
  ['series-4', 'card', U, 'serie 4 / card'],
  ['muted-mark', 'card', U, 'histórico (gris) / card'],
  ['ref', 'card', U, 'línea de referencia / card'],
  ['axis', 'card', 1.1, 'eje (decorativo)'],
  // Marcador de Entreno
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
  ['oscuro Entreno', 'dark', 'entreno', [['accent-text', 'card'], ['on-primary', 'primary'], ['ink-3', 'card'], ['success', 'card']]],
  ['claro Entreno', 'light', 'entreno', [['accent-text', 'card'], ['accent-mark', 'card'], ['primary-edge', 'card'], ['on-primary', 'primary'], ['hero-accent', 'hero-bg']]],
  ['oscuro Finanzas', 'dark', 'finanzas', [['accent-text', 'card'], ['success', 'card'], ['error', 'card'], ['ink-3', 'card']]],
  ['claro Finanzas', 'light', 'finanzas', [['accent-text', 'card'], ['success', 'card'], ['error', 'card'], ['ink-3', 'card']]]
]
const det = []
for (const [n, theme, modulo, ps] of destacados) {
  const v = resolve(theme, modulo)
  det.push(`  ${n}: ` + ps.map(([a, b]) => `${a}/${b} ${ratio(v(a), v(b)).toFixed(2)}`).join(' · '))
}

// --- validador de paletas de la skill dataviz (series de gráfico) ------------
let validar = null
if (!skill) {
  console.warn('Aviso: sin DATAVIZ_SCRIPTS no se validan las paletas de series (solo el contraste de los tokens). Apunta la variable a la carpeta del validador de la skill dataviz.')
} else {
  try {
    validar = (await import(pathToFileURL(path.join(skill, 'validate_palette.js')).href)).validate
  } catch {
    console.warn(`Aviso: no se pudo cargar validate_palette.js desde DATAVIZ_SCRIPTS (${skill}); se salta la validación de paletas.`)
  }
}
const palLineas = []
if (validar) {
  for (const [tema, nombre, theme, modulo] of contextos.filter((c) => c[3])) {
    const v = resolve(theme, modulo)
    const pal = [1, 2, 3, 4].map((i) => v('series-' + i))
    const r = validar(pal, { mode: theme, surface: v('card') })
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
  ...(palLineas.length ? ['Paletas de series (validador de la skill dataviz, adyacentes, sobre card):', ...palLineas] : [])
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
