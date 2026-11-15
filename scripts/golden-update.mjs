// Regenera tests/golden/sintetico.golden.json (solo cuando un cambio de cifras es intencionado).
// Funciona igual en Windows y Linux (sin cross-env).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/golden-finanzas.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GOLDEN_SINTETICO_UPDATE: '1' }
})
process.exit(r.status ?? 1)
