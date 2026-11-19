import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Mini app de maquetas: independiente de la app. Se arranca con `npm run maquetas`.
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-maquetas', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true }
})
