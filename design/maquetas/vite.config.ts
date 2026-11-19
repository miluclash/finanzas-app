import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Mini app de maquetas: independiente de la app. Se arranca con `npm run maquetas`.
const root = fileURLToPath(new URL('.', import.meta.url))
// La versión que muestra la barra lateral es la real de package.json (solo se lee, nunca se cambia)
const version = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')).version as string

export default defineConfig({
  root,
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-maquetas', import.meta.url)),
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true }
})
