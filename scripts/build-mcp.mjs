// Compila el servidor MCP en un único archivo: out/mcp/server.cjs
// sql.js se deja fuera del paquete porque necesita leer su .wasm desde node_modules.
import { build } from 'esbuild'
import path from 'node:path'

await build({
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'out/mcp/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['sql.js'],
  alias: { '@shared': path.resolve('src/shared') },
  logLevel: 'warning'
})
console.log('MCP → out/mcp/server.cjs')
