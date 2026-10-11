import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { ...alias, '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
