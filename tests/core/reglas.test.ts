// Reglas de arquitectura (CLAUDE.md, reglas 3, 6, 7 y 8) comprobadas leyendo el código fuente.
// No ejecutan nada de la app: recorren `src/` y buscan usos prohibidos. Cada fallo dice qué
// archivo rompe qué regla.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_MODULES, createAppRegistry } from '../../src/main/app'

const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'src')

/** Quita comentarios `//` y `/* *​/` respetando las cadenas de texto. */
function sinComentarios(code: string): string {
  let out = ''
  let i = 0
  while (i < code.length) {
    const c = code[i]
    const n = code[i + 1]
    if (c === '/' && n === '/') {
      while (i < code.length && code[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end < 0 ? code.length : end + 2
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') j++
        else if (c !== '`' && code[j] === '\n') break
        j++
      }
      out += code.slice(i, j + 1)
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

interface Fuente {
  /** Ruta relativa a la raíz del repo, con `/`. */
  rel: string
  /** Ruta absoluta. */
  abs: string
  /** Código sin comentarios. */
  code: string
}

function recorrer(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) recorrer(p, acc)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) acc.push(p)
  }
  return acc
}

const FUENTES: Fuente[] = recorrer(SRC).map((abs) => ({
  abs,
  rel: path.relative(ROOT, abs).split(path.sep).join('/'),
  code: sinComentarios(fs.readFileSync(abs, 'utf8'))
}))

/** Archivos (relativos) donde aparece `re` y que no están en `permitidos`. */
function usosFuera(re: RegExp, permitidos: string[]): string[] {
  return FUENTES.filter((f) => re.test(f.code) && !permitidos.includes(f.rel)).map((f) => f.rel)
}

function exigirSoloEn(nombre: string, re: RegExp, permitidos: string[]): void {
  const fuera = usosFuera(re, permitidos)
  expect(
    fuera,
    `Regla rota: ${nombre} solo puede aparecer en ${permitidos.join(', ')}. Lo usan también: ${fuera.join(', ')}`
  ).toEqual([])
}

interface Importacion {
  spec: string
  soloTipos: boolean
}

function importaciones(code: string): Importacion[] {
  const res: Importacion[] = []
  const reEstatico = /\b(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g
  for (const m of code.matchAll(reEstatico)) {
    const llaves = /^\{([^}]*)\}$/.exec(m[3].trim())
    const todosTipo = !!llaves && llaves[1].split(',').map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith('type '))
    res.push({ spec: m[4], soloTipos: !!m[2] || todosTipo })
  }
  for (const m of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) res.push({ spec: m[1], soloTipos: false })
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) res.push({ spec: m[1], soloTipos: false })
  return res
}

/** Ruta relativa al repo (sin extensión) a la que apunta un import interno; null si es un paquete. */
function resolver(desde: Fuente, spec: string): string | null {
  let abs: string
  if (spec.startsWith('.')) abs = path.resolve(path.dirname(desde.abs), spec)
  else if (spec.startsWith('@shared/')) abs = path.join(SRC, 'shared', spec.slice('@shared/'.length))
  else if (spec.startsWith('@/')) abs = path.join(SRC, 'renderer', 'src', spec.slice(2))
  else return null
  return path.relative(ROOT, abs).split(path.sep).join('/').replace(/\.(ts|tsx)$/, '')
}

describe('reglas de arquitectura: cola de escritura (regla 3)', () => {
  it('runNow( solo se llama desde writeQueue.ts y context.ts', () => {
    exigirSoloEn('runNow(', /\brunNow\s*\(/, ['src/main/core/writeQueue.ts', 'src/main/core/context.ts'])
  })

  it('.persist( solo se llama desde core/db.ts', () => {
    exigirSoloEn('.persist(', /\.persist\s*\(/, ['src/main/core/db.ts'])
  })

  it('beginOp(, commitOp( y rollbackOp( solo se llaman desde core/db.ts y core/writeQueue.ts', () => {
    exigirSoloEn('beginOp(/commitOp(/rollbackOp(', /\b(beginOp|commitOp|rollbackOp)\s*\(/, [
      'src/main/core/db.ts',
      'src/main/core/writeQueue.ts'
    ])
  })

  it('el servidor MCP (congelado) no escribe: nada de .run(, .exec( ni .tx(', () => {
    const f = FUENTES.find((x) => x.rel === 'src/mcp/server.ts')
    expect(f, 'No se encuentra src/mcp/server.ts').toBeDefined()
    const m = f!.code.match(/\.(run|exec|tx)\s*\(/g) ?? []
    expect(m, `Regla rota (regla 3): src/mcp/server.ts no puede escribir, pero usa ${m.join(', ')}`).toEqual([])
  })
})

describe('reglas de arquitectura: rutas de datos', () => {
  it('FINANZAS_DATA_DIR solo se lee en index.ts, updater.ts y mcp/server.ts', () => {
    exigirSoloEn('FINANZAS_DATA_DIR', /FINANZAS_DATA_DIR/, [
      'src/main/index.ts',
      'src/main/core/updater.ts',
      'src/mcp/server.ts'
    ])
  })

  it('app.getPath( solo se usa en src/main/index.ts', () => {
    exigirSoloEn('app.getPath(', /\bapp\.getPath\s*\(/, ['src/main/index.ts'])
  })
})

describe('reglas de arquitectura: dependencias entre capas', () => {
  it('src/main/core no importa nada de modules ni de app.ts', () => {
    const malos: string[] = []
    for (const f of FUENTES.filter((x) => x.rel.startsWith('src/main/core/'))) {
      for (const imp of importaciones(f.code)) {
        const r = resolver(f, imp.spec)
        if (r && (r === 'src/main/app' || r.startsWith('src/main/modules/'))) malos.push(`${f.rel} importa «${imp.spec}»`)
      }
    }
    expect(malos, `Regla rota: el núcleo (src/main/core) no puede importar módulos ni app.ts.\n${malos.join('\n')}`).toEqual([])
  })

  it('un módulo no importa app.ts ni otro módulo', () => {
    const malos: string[] = []
    for (const f of FUENTES.filter((x) => x.rel.startsWith('src/main/modules/'))) {
      const propio = f.rel.split('/')[3]
      for (const imp of importaciones(f.code)) {
        const r = resolver(f, imp.spec)
        if (!r) continue
        if (r === 'src/main/app') malos.push(`${f.rel} importa app.ts («${imp.spec}»)`)
        else if (r.startsWith('src/main/modules/') && r.split('/')[3] !== propio)
          malos.push(`${f.rel} importa del módulo «${r.split('/')[3]}» («${imp.spec}»)`)
      }
    }
    expect(malos, `Regla rota: un módulo no puede importar app.ts ni otro módulo.\n${malos.join('\n')}`).toEqual([])
  })

  it('la interfaz (src/renderer) solo importa de src/main como `import type`', () => {
    const malos: string[] = []
    for (const f of FUENTES.filter((x) => x.rel.startsWith('src/renderer/'))) {
      for (const imp of importaciones(f.code)) {
        const r = resolver(f, imp.spec)
        if (r && r.startsWith('src/main/') && !imp.soloTipos) malos.push(`${f.rel} importa un valor de «${imp.spec}»`)
      }
    }
    expect(malos, `Regla rota: la interfaz solo puede importar tipos de src/main (import type).\n${malos.join('\n')}`).toEqual([])
  })

  it('el detector de importaciones distingue tipos de valores (control)', () => {
    const r = importaciones(
      "import type { A } from './a'\nimport { type B, type C } from './b'\nimport { D } from './d'\nimport { type E, F } from './e'\nexport type { G } from './g'"
    )
    expect(r.map((x) => [x.spec, x.soloTipos])).toEqual([
      ['./a', true],
      ['./b', true],
      ['./d', false],
      ['./e', false],
      ['./g', true]
    ])
  })
})

describe('reglas de arquitectura: IA solo local (regla 8)', () => {
  it('no hay llamadas a APIs de IA externas en src/', () => {
    const prohibidos = [/api\.anthropic\.com/, /api\.openai\.com/, /@anthropic-ai\//, /['"`]openai['"`/]/]
    const malos: string[] = []
    for (const f of FUENTES) {
      // Se mira el texto completo (también comentarios y cadenas), salvo este mismo test que no está en src/.
      const original = fs.readFileSync(f.abs, 'utf8')
      for (const re of prohibidos) if (re.test(original)) malos.push(`${f.rel} contiene ${re}`)
    }
    expect(malos, `Regla rota (regla 8): IA solo local, sin APIs externas.\n${malos.join('\n')}`).toEqual([])
  })
})

describe('reglas de arquitectura: prefijos de tablas (regla 6)', () => {
  it('las tablas creadas por módulos que no son finanzas llevan prefijo trn_ o core_', () => {
    const registro = createAppRegistry()
    const malos: string[] = []
    for (const m of registro.modules) {
      if (m.id === 'finanzas') continue
      for (const mig of m.migrations) {
        const sql = typeof mig.up === 'string' ? mig.up : ''
        for (const t of sql.matchAll(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)/gi)) {
          if (!/^(trn_|core_)/.test(t[1])) malos.push(`módulo «${m.id}», migración ${mig.version} (${mig.name}): tabla «${t[1]}»`)
        }
      }
    }
    expect(malos, `Regla rota (regla 6): las tablas nuevas llevan prefijo trn_ o core_.\n${malos.join('\n')}`).toEqual([])
  })

  it('el registro de la app incluye los módulos esperados (control)', () => {
    expect(createAppRegistry().modules.map((m) => m.id)).toEqual(APP_MODULES.map((m) => m.id))
  })
})
