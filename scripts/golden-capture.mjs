// Captura la línea base del test dorado con los datos reales:
//   1. prepara una carpeta temporal hermana del destino (<destino>.tmp),
//   2. copia finanzas.sqlite (solo lectura del original) y escribe meta.json,
//   3. lanza tests/golden-finanzas.local.test.ts en modo captura para generar golden.json,
//   4. solo si todo sale bien, sustituye la carpeta destino (la línea base anterior no se pierde hasta entonces).
// Origen: FINANZAS_DATA_DIR o %APPDATA%\Finanzas. Destino: FINANZAS_GOLDEN_DIR o %APPDATA%\Finanzas-golden.
// Si ya existe golden.json en el destino se niega, salvo con --force. No imprime cifras: solo rutas, número de claves y un trozo del hash.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')
const appData = process.env.APPDATA

const fail = (msg) => {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

const srcDir = process.env.FINANZAS_DATA_DIR || (appData ? path.join(appData, 'Finanzas') : null)
const dstDir = process.env.FINANZAS_GOLDEN_DIR || (appData ? path.join(appData, 'Finanzas-golden') : null)
if (!srcDir) fail('No encuentro la carpeta de datos: define FINANZAS_DATA_DIR (o APPDATA).')
if (!dstDir) fail('No encuentro la carpeta dorada: define FINANZAS_GOLDEN_DIR (o APPDATA).')

/** Ruta real (resuelve enlaces y mayúsculas) aunque el final aún no exista; en Windows, en minúsculas. */
function real(p) {
  let cur = path.resolve(p)
  const rest = []
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur)
    if (parent === cur) break
    rest.unshift(path.basename(cur))
    cur = parent
  }
  let out = path.join(fs.existsSync(cur) ? fs.realpathSync.native(cur) : cur, ...rest)
  if (process.platform === 'win32') out = out.toLowerCase()
  return out
}
/** ¿`child` está dentro de `parent` (o es la misma carpeta)? */
function inside(child, parent) {
  const rel = path.relative(real(parent), real(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

const src = path.join(srcDir, 'finanzas.sqlite')
if (!fs.existsSync(src)) fail(`No existe ${src}`)
if (real(src) === real(path.join(dstDir, 'finanzas.sqlite'))) fail('El origen y el destino son el mismo archivo.')
if (inside(dstDir, srcDir)) fail('La carpeta dorada no puede estar dentro de la carpeta de datos de origen.')
if (inside(dstDir, root)) fail('La carpeta dorada no puede estar dentro del repositorio (es público y contiene datos reales).')

const goldenPath = path.join(dstDir, 'golden.json')
if (fs.existsSync(goldenPath) && !force)
  fail(`Ya existe una línea base en ${dstDir}. Usa --force si quieres sustituirla (solo si el cambio de cifras es intencionado).`)

const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const tmpDir = `${path.resolve(dstDir)}.tmp`
const oldDir = `${path.resolve(dstDir)}.old`
const cleanTmp = () => fs.rmSync(tmpDir, { recursive: true, force: true })
cleanTmp()
fs.mkdirSync(tmpDir, { recursive: true })

console.log(`Origen: ${src}`)
if (process.env.FINANZAS_DATA_DIR) console.warn('AVISO: el origen viene de FINANZAS_DATA_DIR: no es la carpeta de datos real (%APPDATA%\\Finanzas).')

const tmpDb = path.join(tmpDir, 'finanzas.sqlite')
fs.copyFileSync(src, tmpDb) // el original solo se lee
const dbSha256 = sha(tmpDb)
if (dbSha256 !== sha(src)) {
  cleanTmp()
  fail('La copia no coincide con el original (SHA-256 distinto). Cierra la app e inténtalo de nuevo.')
}

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const plus45 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45)
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
const commit = git(['rev-parse', '--short', 'HEAD'])
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const dirty = git(['status', '--porcelain', '--', 'src'])
const meta = {
  createdAt: now.toISOString(),
  todays: [localISO(now), localISO(plus45)],
  dbSha256,
  commit: commit.status === 0 ? commit.stdout.trim() : 'desconocido',
  branch: branch.status === 0 ? branch.stdout.trim() : 'desconocida',
  dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null
}
fs.writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

console.log(`Copia (temporal): ${tmpDb} (sha256 ${dbSha256.slice(0, 12)}…)`)
console.log(`Fechas de referencia: ${meta.todays.join(', ')} · rama ${meta.branch} · commit ${meta.commit}${meta.dirty ? ' (con cambios sin confirmar en src/)' : ''}`)
if (meta.branch !== 'main') console.warn(`AVISO: no estás en main (rama ${meta.branch}); la línea base debería capturarse sobre código de main.`)

const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/golden-finanzas.local.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FINANZAS_GOLDEN_UPDATE: '1', FINANZAS_GOLDEN_DIR: tmpDir }
})
if (r.status !== 0) {
  cleanTmp()
  fail('La captura ha fallado; el destino queda como estaba (mira el mensaje de arriba).')
}
if (!fs.existsSync(path.join(tmpDir, 'golden.json'))) {
  cleanTmp()
  fail('El test no ha generado golden.json (¿se ha saltado?); el destino queda como estaba.')
}
const done = JSON.parse(fs.readFileSync(path.join(tmpDir, 'meta.json'), 'utf8'))

// Sustitución del destino: la línea base anterior solo se borra cuando la nueva ya está en su sitio
fs.rmSync(oldDir, { recursive: true, force: true })
const had = fs.existsSync(dstDir)
try {
  if (had) fs.renameSync(dstDir, oldDir)
  fs.renameSync(tmpDir, dstDir)
} catch (e) {
  if (had && !fs.existsSync(dstDir) && fs.existsSync(oldDir)) fs.renameSync(oldDir, dstDir)
  cleanTmp()
  fail(`No he podido sustituir la carpeta destino (${e.code ?? 'error'}); la línea base anterior se ha conservado.`)
}
fs.rmSync(oldDir, { recursive: true, force: true })

console.log(`Hecho: ${path.join(dstDir, 'golden.json')} con ${done.keyCount} claves.`)
if (meta.dirty) console.warn('AVISO: hay cambios sin confirmar en src/; la línea base debería capturarse sobre código limpio.')
if (done.settingsNotPersisted?.includes('trackingStart')) console.warn('AVISO: trackingStart no está guardado en la base (ver arriba).')
