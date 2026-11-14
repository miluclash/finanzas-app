// Captura la línea base del test dorado con los datos reales:
//   1. copia finanzas.sqlite (solo lectura del original) a la carpeta dorada,
//   2. escribe meta.json,
//   3. lanza tests/golden-finanzas.local.test.ts en modo captura para generar golden.json.
// Origen: FINANZAS_DATA_DIR o %APPDATA%\Finanzas. Destino: FINANZAS_GOLDEN_DIR o %APPDATA%\Finanzas-golden.
// Si ya existe golden.json se niega, salvo con --force. No imprime cifras: solo rutas, número de claves y un trozo del hash.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')
const appData = process.env.APPDATA

const srcDir = process.env.FINANZAS_DATA_DIR || (appData ? path.join(appData, 'Finanzas') : null)
const dstDir = process.env.FINANZAS_GOLDEN_DIR || (appData ? path.join(appData, 'Finanzas-golden') : null)
const fail = (msg) => {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}
if (!srcDir) fail('No encuentro la carpeta de datos: define FINANZAS_DATA_DIR (o APPDATA).')
if (!dstDir) fail('No encuentro la carpeta dorada: define FINANZAS_GOLDEN_DIR (o APPDATA).')

const src = path.join(srcDir, 'finanzas.sqlite')
const dst = path.join(dstDir, 'finanzas.sqlite')
const metaPath = path.join(dstDir, 'meta.json')
const goldenPath = path.join(dstDir, 'golden.json')
if (!fs.existsSync(src)) fail(`No existe ${src}`)
if (path.resolve(src) === path.resolve(dst)) fail('El origen y el destino son el mismo archivo.')
if (fs.existsSync(goldenPath) && !force)
  fail(`Ya existe una línea base en ${dstDir}. Usa --force si quieres sustituirla (solo si el cambio de cifras es intencionado).`)

const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

fs.mkdirSync(dstDir, { recursive: true })
fs.copyFileSync(src, dst) // el original solo se lee
const dbSha256 = sha(dst)
if (dbSha256 !== sha(src)) fail('La copia no coincide con el original (SHA-256 distinto). Cierra la app e inténtalo de nuevo.')

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const plus45 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45)

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
const commit = git(['rev-parse', '--short', 'HEAD'])
const dirty = git(['status', '--porcelain', '--', 'src'])
const meta = {
  createdAt: now.toISOString(),
  todays: [localISO(now), localISO(plus45)],
  dbSha256,
  commit: commit.status === 0 ? commit.stdout.trim() : 'desconocido',
  dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null
}
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
if (fs.existsSync(goldenPath)) fs.rmSync(goldenPath) // --force: se regenera desde cero
const diffFile = path.join(dstDir, 'ultimo-diff.json')
if (fs.existsSync(diffFile)) fs.rmSync(diffFile)

console.log(`Copia: ${dst} (sha256 ${dbSha256.slice(0, 12)}…)`)
console.log(`Fechas de referencia: ${meta.todays.join(', ')} · commit ${meta.commit}${meta.dirty ? ' (con cambios sin confirmar en src/)' : ''}`)

const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/golden-finanzas.local.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FINANZAS_GOLDEN_UPDATE: '1', FINANZAS_GOLDEN_DIR: dstDir }
})
if (r.status !== 0) fail('La captura ha fallado (mira el mensaje de arriba).')
if (!fs.existsSync(goldenPath)) fail('El test no ha generado golden.json (¿se ha saltado?).')
const done = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
console.log(`Hecho: ${goldenPath} con ${done.keyCount} claves.`)
if (meta.dirty) console.warn('AVISO: hay cambios sin confirmar en src/; la línea base debería capturarse sobre código limpio.')
if (done.settingsNotPersisted?.includes('trackingStart')) console.warn('AVISO: trackingStart no está guardado en la base (ver arriba).')
