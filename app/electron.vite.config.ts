import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // app (index) + janela de quem assiste uma sessao (viewer: so o botao de flutuar)
        input: { index: resolve('src/preload/index.ts'), viewer: resolve('src/preload/viewer.ts') },
      },
    },
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        // app (index) + pagina de quem assiste uma sessao (viewer), servida pelo proprio app do host
        input: { index: resolve('src/renderer/index.html'), viewer: resolve('src/renderer/viewer.html') },
      },
    },
  },
})
