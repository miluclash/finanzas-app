// Busca valores sueltos en el código nuevo (core/ y modules/entreno/; las páginas de Finanzas sin reestilizar quedan fuera hasta la parte B): colores, tamaños y espaciados que no sean tokens.
// Uso: node scripts/auditar-tokens.mjs   (sale con error si encuentra alguno)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.join(aqui, '..', 'src', 'renderer', 'src')
const carpetas = ['core', 'modules/entreno'].map((c) => path.join(raiz, c))
const reglas = [
  [/#[0-9a-fA-F]{3,8}\b/, 'color hexadecimal suelto (usa un token)'],
  [/\brgba?\(/, 'color rgb suelto (usa un token)'],
  [/\[\s*-?\d+(\.\d+)?(px|rem|em|vh|vw)(?![a-z])/, 'medida arbitraria de Tailwind (usa un token o la escala de 4 px)'],
  [/\b(text|leading|tracking)-\[/, 'tipografía arbitraria (usa una clase t-* de la escala)'],
  [/\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(0\.5|1\.5|2\.5|3\.5|5|7|9|11|14)\b/, 'espaciado fuera de la escala 4/8/12/16/24/32/40/48'],
  [/fontSize:\s*['"]?\d/, 'tamaño de fuente suelto en línea'],
  [/\b[1-9]\d*px['"`]/, 'medida en px suelta en línea (usa un token)']
]
const hallazgos = []
const ficheros = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? ficheros(path.join(d, e.name)) : /\.(tsx|ts)$/.test(e.name) ? [path.join(d, e.name)] : []))
for (const f of carpetas.flatMap(ficheros).filter((x) => !x.endsWith('Settings.tsx'))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) return
    for (const [re, msg] of reglas) if (re.test(l)) hallazgos.push(`${path.relative(raiz, f)}:${i + 1}  ${msg}\n    ${l.trim().slice(0, 140)}`)
  })
}
if (hallazgos.length) {
  console.log(hallazgos.join('\n'))
  console.log(`\n${hallazgos.length} valores sueltos`)
  process.exit(1)
}
console.log('Sin valores sueltos en core/ y modules/entreno/')
